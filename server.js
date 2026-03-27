const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3001; 

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const basicAuth = require('express-basic-auth');

// Lock down the entire app with a username and password
app.use(basicAuth({
    users: { 'alex': process.env.WEB_PASSWORD || 'Reviveone201' },
    challenge: true,
    unauthorizedResponse: 'Access Denied. This is a private study tool.'
}));

// Use Fly.io's persistent volume if it exists, otherwise use local folder
const DB_PATH = process.env.DB_PATH || './database.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('[ERROR] Could not connect to database', err);
    else console.log(`[INFO] Connected to SQLite database at ${DB_PATH}`);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY, front TEXT, back TEXT, context TEXT, image TEXT, chapter TEXT, ai_model TEXT, created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        id INTEGER PRIMARY KEY, total_score REAL, wrong_count INTEGER, total_possible REAL
    )`);

    // NEW: Table for the TikTok Algorithm memory
    db.run(`CREATE TABLE IF NOT EXISTS user_card_stats (
        card_id INTEGER PRIMARY KEY,
        seen_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        consecutive_correct INTEGER DEFAULT 0,
        last_seen_seq INTEGER DEFAULT 0
    )`);

    db.get(`SELECT COUNT(*) as count FROM user_stats`, (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO user_stats (id, total_score, wrong_count, total_possible) VALUES (1, 0, 0, 0)`);
        }
    });
});

// --- API ROUTES ---

// Updated to grab both the card AND its personal TikTok stats
app.get('/api/cards', (req, res) => {
    const query = `
        SELECT f.*, 
        COALESCE(u.seen_count, 0) as seen_count,
        COALESCE(u.miss_count, 0) as miss_count,
        COALESCE(u.consecutive_correct, 0) as consecutive_correct,
        COALESCE(u.last_seen_seq, 0) as last_seen_seq
        FROM flashcards f
        LEFT JOIN user_card_stats u ON f.id = u.card_id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/stats', (req, res) => {
    db.get(`SELECT total_score, wrong_count, total_possible FROM user_stats WHERE id = 1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.post('/api/stats', (req, res) => {
    const { scoreAdd, wrongAdd, possibleAdd } = req.body;
    db.run(`UPDATE user_stats SET total_score = total_score + ?, wrong_count = wrong_count + ?, total_possible = total_possible + ? WHERE id = 1`,
        [scoreAdd, wrongAdd, possibleAdd],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// NEW: Endpoint to update individual card memory
app.post('/api/card-stats', (req, res) => {
    const { cardId, isSuccess, seq } = req.body;
    
    // Upsert: Insert if it doesn't exist, Update if it does
    db.run(`INSERT INTO user_card_stats (card_id, seen_count, miss_count, consecutive_correct, last_seen_seq)
            VALUES (?, 1, CASE WHEN ? THEN 0 ELSE 1 END, CASE WHEN ? THEN 1 ELSE 0 END, ?)
            ON CONFLICT(card_id) DO UPDATE SET
            seen_count = seen_count + 1,
            miss_count = miss_count + CASE WHEN ? THEN 0 ELSE 1 END,
            consecutive_correct = CASE WHEN ? THEN consecutive_correct + 1 ELSE 0 END,
            last_seen_seq = ?`,
            [cardId, isSuccess, isSuccess, seq, isSuccess, isSuccess, seq], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
});

app.post('/api/reset', (req, res) => {
    db.run(`UPDATE user_stats SET total_score = 0, wrong_count = 0, total_possible = 0 WHERE id = 1`);
    db.run(`DELETE FROM user_card_stats`, function(err) {       
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] Server running! Open http://localhost:${PORT} in your browser.`);
});