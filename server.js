const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-development-key';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BACKEND TRAFFIC LOGGER ---
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`\n[${timestamp}] 📡 ${req.method} ${req.url}`);
        
        if (req.method === 'POST') {
            // Clone the body so we can hide passwords in the log
            const safeBody = { ...req.body };
            if (safeBody.password) safeBody.password = '***';
            console.log(`   Payload:`, safeBody);
        }
    }
    next();
});

const DB_PATH = process.env.DB_PATH || './database.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[ERROR] Could not connect to database', err);
    else console.log(`[INFO] Connected to SQLite database at ${DB_PATH}`);
});

db.serialize(() => {
    // 1. Keep your precious flashcards exactly as they are
    db.run(`CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY, front TEXT, back TEXT, context TEXT, image TEXT, chapter TEXT, ai_model TEXT, created_at TEXT
    )`);

    // 2. New Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT
    )`);

    // 3. Upgraded Stats Tables (v2) - Now tied to user_id
    db.run(`CREATE TABLE IF NOT EXISTS user_stats_v2 (
        user_id INTEGER PRIMARY KEY, total_score REAL, wrong_count INTEGER, total_possible REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_card_stats_v2 (
        user_id INTEGER,
        card_id INTEGER,
        seen_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        consecutive_correct INTEGER DEFAULT 0,
        last_seen_seq INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, card_id)
    )`);
    
    // 4. Safely add the timestamp column to an existing database
    db.run(`ALTER TABLE user_card_stats_v2 ADD COLUMN last_seen_timestamp DATETIME`, (err) => {});
});

// --- AUTHENTICATION MIDDLEWARE ---
// This acts as a bouncer. If a request doesn't have a valid token, it gets rejected.
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user; // Attach the decoded user data (like user.id) to the request
        next();
    });
}

// --- AUTH ROUTES ---

// 1. Register a new user
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists.' });
                return res.status(500).json({ error: err.message });
            }
            // Initialize their global stats
            db.run(`INSERT INTO user_stats_v2 (user_id, total_score, wrong_count, total_possible) VALUES (?, 0, 0, 0)`, [this.lastID]);
            res.json({ success: true, message: 'User registered successfully!' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Error hashing password.' });
    }
});

// 2. Login and get a token
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid username or password.' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid username or password.' });

        // Generate the digital ticket (valid for 7 days)
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, username: user.username });
    });
});

// --- PROTECTED API ROUTES ---

app.get('/api/cards', authenticateToken, (req, res) => {
    const query = `
        SELECT f.*, 
        COALESCE(u.seen_count, 0) as seen_count,
        COALESCE(u.miss_count, 0) as miss_count,
        COALESCE(u.consecutive_correct, 0) as consecutive_correct,
        COALESCE(u.last_seen_seq, 0) as last_seen_seq,
        u.last_seen_timestamp
        FROM flashcards f
        LEFT JOIN user_card_stats_v2 u ON f.id = u.card_id AND u.user_id = ?
    `;
    db.all(query, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/stats', authenticateToken, (req, res) => {
    db.get(`SELECT total_score, wrong_count, total_possible FROM user_stats_v2 WHERE user_id = ?`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { total_score: 0, wrong_count: 0, total_possible: 0 });
    });
});

// MISSING ENDPOINT ADDED BACK: Updates the Global Scoreboard
app.post('/api/stats', authenticateToken, (req, res) => {
    const { scoreAdd, wrongAdd, possibleAdd } = req.body;
    db.run(`UPDATE user_stats_v2 SET total_score = total_score + ?, wrong_count = wrong_count + ?, total_possible = total_possible + ? WHERE user_id = ?`,
        [scoreAdd, wrongAdd, possibleAdd, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// UPGRADED ENDPOINT: The only one we need for card stats now
app.post('/api/card-stats', authenticateToken, (req, res) => {
    const { cardId, status, seq } = req.body; 

    const isPerfect = status === 'perfect';
    const isMiss = status === 'miss';
    const isPartial = status === 'partial';

    db.run(`INSERT INTO user_card_stats_v2 (user_id, card_id, seen_count, miss_count, consecutive_correct, last_seen_seq, last_seen_timestamp) 
            VALUES (?, ?, 1, CASE WHEN ? THEN 1 ELSE 0 END, CASE WHEN ? THEN 1 ELSE 0 END, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, card_id) DO UPDATE SET 
            seen_count = seen_count + 1,
            miss_count = miss_count + CASE WHEN ? THEN 1 ELSE 0 END,
            consecutive_correct = CASE WHEN ? THEN consecutive_correct + 1 WHEN ? THEN consecutive_correct ELSE 0 END,
            last_seen_seq = ?,
            last_seen_timestamp = CURRENT_TIMESTAMP`, 
            [req.user.id, cardId, isMiss, isPerfect, seq, isMiss, isPerfect, isPartial, seq],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
});

// ADDED BACK: The reset progress endpoint
app.post('/api/reset', authenticateToken, (req, res) => {
    db.run(`UPDATE user_stats_v2 SET total_score = 0, wrong_count = 0, total_possible = 0 WHERE user_id = ?`, [req.user.id]);  
    db.run(`DELETE FROM user_card_stats_v2 WHERE user_id = ?`, [req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] Server running! Open http://localhost:${PORT} in your browser.`);
});