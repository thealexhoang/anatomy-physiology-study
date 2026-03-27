// --- STATE ---
let allFlashcards = [];
let activeDeck = [];
let currentCard = null;
let globalSeq = 1;
let isWaitingForNext = false;
let isMultipleChoiceMode = false;

// --- DOM ELEMENTS ---
const inputContainer = document.getElementById('inputContainer');
const inputField = document.getElementById('answerInput');
const mcContainer = document.getElementById('mcContainer');
const feedbackDiv = document.getElementById('feedback');
const submitBtn = document.getElementById('submitBtn');
const contextBox = document.getElementById('contextBox');
const contextText = document.getElementById('contextText');
const imgElement = document.getElementById('cardImage');
const chapterList = document.getElementById('chapterList');
const deckTitle = document.getElementById('deckTitle');

// --- COMPREHENSIVE LOGGER ---
const AppLogger = {
    history: [],
    log: function(action, details = {}) {
        const entry = {
            time: new Date().toLocaleTimeString(),
            action: action,
            cardId: currentCard ? currentCard.id : null,
            seq: globalSeq,
            details: details
        };
        this.history.push(entry);
        console.log(`📘 [${entry.time}] ${action}`, details);
    },
    dump: function() {
        console.log("=== 🐛 FULL APP DIAGNOSTIC DUMP ===");
        console.table(this.history);
        console.log("CURRENT STATE:", { isWaitingForNext, isMultipleChoiceMode, activeDeckSize: activeDeck.length });
        alert("Logs dumped to browser console! Press F12 to view.");
    }
};

// Press '`' (tilde/backtick key) at any time to dump the logs!
document.addEventListener('keydown', (e) => {
    if (e.key === '`') AppLogger.dump();
});

// --- AUTHENTICATION LOGIC ---
const API_HEADERS = { 'Content-Type': 'application/json' };

function checkAuth() {
    const token = localStorage.getItem('jwt_token');
    if (token) {
        document.getElementById('auth-overlay').style.display = 'none';
        API_HEADERS['Authorization'] = `Bearer ${token}`;
        initializeApp(); // ONLY run this if logged in
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
}

async function handleLogin() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            localStorage.setItem('jwt_token', data.token);
            checkAuth(); // Kick off the app
        } else {
            showAuthError(data.error);
        }
    } catch (err) { showAuthError("Server error."); }
}

async function handleRegister() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.success) {
            handleLogin(); 
        } else {
            showAuthError(data.error);
        }
    } catch (err) { showAuthError("Server error."); }
}

function showAuthError(msg) {
    const msgEl = document.getElementById('auth-message');
    msgEl.innerText = msg;
    msgEl.style.display = 'block';
}

function logout() {
    localStorage.removeItem('jwt_token');
    location.reload();
}

// --- CORE APP LOGIC ---

async function initializeApp() {
    try {
        const cardsRes = await fetch('/api/cards', { headers: API_HEADERS });
        if (!cardsRes.ok) {
            if (cardsRes.status === 401 || cardsRes.status === 403) logout();
            throw new Error("Failed to load cards");
        }
        allFlashcards = await cardsRes.json();
        
        // NEW: Time-Based Decay (The Forgetting Curve)
        const now = new Date();
        allFlashcards.forEach(c => {
            if (c.last_seen_timestamp && c.consecutive_correct > 0) {
                // 'Z' ensures the JS Date object parses the SQLite UTC timestamp correctly
                const lastSeen = new Date(c.last_seen_timestamp + 'Z'); 
                const hoursSince = (now - lastSeen) / (1000 * 60 * 60);
                
                // If you haven't seen a card in 48 hours, drop its mastery by 1 level
                if (hoursSince > 48) {
                    c.consecutive_correct = Math.max(0, c.consecutive_correct - 1);
                }
            }
        });
        
        buildSidebar();
        selectChapter("All"); 
        
        const statsRes = await fetch('/api/stats', { headers: API_HEADERS });
        const stats = await statsRes.json();
        renderStats(stats);
    } catch (err) {
        document.getElementById('definitionText').innerText = "Error connecting to database.";
    }
}

function renderStats(stats) {
    document.getElementById('scoreTotal').innerText = stats.total_score.toFixed(1);
    document.getElementById('scorePossible').innerText = (stats.total_possible || 0).toFixed(1);
    document.getElementById('scoreWrong').innerText = stats.wrong_count;
    
    let percent = 0;
    if (stats.total_possible > 0) {
        percent = Math.round((stats.total_score / stats.total_possible) * 100);
    }
    document.getElementById('scorePercent').innerText = percent + "%";
}

function buildSidebar() {
    const chapters = [...new Set(allFlashcards.map(card => card.chapter || "General"))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    let html = `<button class="chapter-btn active" id="btn-All" onclick="selectChapter('All')">All Chapters (${allFlashcards.length})</button>`;
    chapters.forEach(chap => {
        if(chap) {
            const count = allFlashcards.filter(c => c.chapter === chap).length;
            const displayName = chap.replace(/ output$/i, '').trim();
            const safeId = `btn-${chap.replace(/[^a-zA-Z0-9]/g, '-')}`;
            html += `<button class="chapter-btn" id="${safeId}" onclick="selectChapter('${chap}')">${displayName} (${count})</button>`;
        }
    });
    chapterList.innerHTML = html;
}

function selectChapter(chapterName) {
    document.querySelectorAll('.chapter-btn').forEach(btn => btn.classList.remove('active'));
    if(chapterName === 'All') {
        document.getElementById('btn-All').classList.add('active');
        activeDeck = [...allFlashcards];
        deckTitle.innerText = "All Chapters";
    } else {
        const safeId = `btn-${chapterName.replace(/[^a-zA-Z0-9]/g, '-')}`;
        document.getElementById(safeId).classList.add('active');
        activeDeck = allFlashcards.filter(c => c.chapter === chapterName);
        deckTitle.innerText = chapterName.replace(/ output$/i, '').trim();
    }

    // NEW: Auto-close sidebar after selection
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();

    activeDeck.forEach(c => { if(c.last_seen_seq > globalSeq) globalSeq = c.last_seen_seq; });
    globalSeq++;
    pickNextCard();
}

function pickNextCard() {
    if(activeDeck.length === 0) return;

    let availableCards = activeDeck.filter(c => {
        const timeSinceSeen = globalSeq - c.last_seen_seq;
        
        // NEW: Dynamic Cooldowns (Spacing Effect)
        let requiredCooldown = 2; // Default for 0 consecutive
        if (c.consecutive_correct === 1) requiredCooldown = 10;
        if (c.consecutive_correct === 2) requiredCooldown = 30;
        if (c.consecutive_correct >= 3) requiredCooldown = 50;
        
        if (c.last_seen_seq > 0 && timeSinceSeen <= requiredCooldown) return false;
        return true;
    });

    if (availableCards.length === 0) availableCards = activeDeck;

    // 70/20/10 Bucket Split
    let criticalPool = availableCards.filter(c => c.seen_count > 0 && c.consecutive_correct < 3);
    let newPool = availableCards.filter(c => c.seen_count === 0);
    let masteredPool = availableCards.filter(c => c.consecutive_correct >= 3);

    let roll = Math.random();
    let selectedPool;

    if (roll < 0.70 && criticalPool.length > 0) selectedPool = criticalPool;
    else if (roll < 0.90 && newPool.length > 0) selectedPool = newPool;
    else if (masteredPool.length > 0) selectedPool = masteredPool;
    else selectedPool = criticalPool.length > 0 ? criticalPool : (newPool.length > 0 ? newPool : activeDeck);

    if (selectedPool === criticalPool) {
        // Prioritize 0s, then 1s, then 2s
        selectedPool.sort((a, b) => {
            if (a.consecutive_correct !== b.consecutive_correct) return a.consecutive_correct - b.consecutive_correct;
            return a.last_seen_seq - b.last_seen_seq;
        });
        currentCard = selectedPool[0];
    } else {
        currentCard = selectedPool[Math.floor(Math.random() * selectedPool.length)];
    }

    AppLogger.log('CARD_SELECTED', { 
        front: currentCard.front, 
        pool: selectedPool === criticalPool ? 'Critical' : (selectedPool === newPool ? 'New' : 'Mastered'),
        missCount: currentCard.miss_count
    });

    loadCardUI();
}

async function updateDatabaseStats(scoreAdd, wrongAdd, possibleAdd = 10.0) {
    await fetch('/api/stats', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ scoreAdd, wrongAdd, possibleAdd })
    });
    const statsRes = await fetch('/api/stats', { headers: API_HEADERS });
    const stats = await statsRes.json();
    renderStats(stats);
}

// NEW: Accepts 'perfect', 'partial', or 'miss'
async function updateCardMemory(status) { 
    currentCard.seen_count++;
    currentCard.last_seen_seq = globalSeq;
    
    if (status === 'perfect') {
        currentCard.consecutive_correct++;
    } else if (status === 'miss') {
        currentCard.miss_count++;
        currentCard.consecutive_correct = 0; // Punish multiple choice/misses
    }
    // Note: If status === 'partial', consecutive_correct DOES NOT increase.

    await fetch('/api/card-stats', {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ cardId: currentCard.id, status, seq: globalSeq })
    });
}

async function resetProgress() {
    if(confirm("Are you sure you want to wipe your database stats AND algorithm memory?")) {
        await fetch('/api/reset', { 
            method: 'POST',
            headers: API_HEADERS 
        });
        globalSeq = 1;
        allFlashcards.forEach(c => {
            c.seen_count = 0; c.miss_count = 0; c.consecutive_correct = 0; c.last_seen_seq = 0;
        });
        pickNextCard();
        
        const statsRes = await fetch('/api/stats', { headers: API_HEADERS });
        const stats = await statsRes.json();
        renderStats(stats);
    }
}

function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function loadCardUI() {
    const leechWarning = document.getElementById('leechWarning');
    
    // Show the red banner if it's a leech, but DO NOT show the context box yet
    if (currentCard.miss_count > 10) {
        leechWarning.style.display = 'block';
    } else {
        leechWarning.style.display = 'none';
    }
    
    document.getElementById('definitionText').innerHTML = currentCard.back;
    imgElement.style.display = 'none';
    imgElement.src = ''; 
    document.getElementById('cardCounter').innerText = `Algorithmic FYP Feed • Interaction #${globalSeq}`;
    
    inputContainer.style.display = 'flex';
    mcContainer.style.display = 'none';
    
    // ALWAYS hide context box when loading a fresh card
    contextBox.style.display = 'none'; 
    contextText.innerHTML = ''; // Clear it out so it doesn't leak old text
    
    inputField.value = '';
    inputField.disabled = false;
    submitBtn.style.display = 'inline-block';
    submitBtn.disabled = false;
    inputField.focus();
    feedbackDiv.innerHTML = '';
    submitBtn.innerText = 'Submit';
    isWaitingForNext = false;
    isMultipleChoiceMode = false;
    
    AppLogger.log('UI_RESET', { 
        isWaitingForNext, 
        isMultipleChoiceMode,
        contextVisible: contextBox.style.display,
        imageVisible: imgElement.style.display,
        isLeech: currentCard.miss_count > 10
    });
}

function generateMultipleChoice(correctAnswer) {
    inputContainer.style.display = 'none';
    submitBtn.style.display = 'none'; 
    mcContainer.style.display = 'flex';
    mcContainer.innerHTML = '';
    isMultipleChoiceMode = true;

    let distractors = activeDeck
        .filter(card => card.front.toLowerCase() !== correctAnswer.toLowerCase())
        .map(card => card.front);
    
    for (let i = distractors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
    }
    distractors = distractors.slice(0, 3);

    let options = [correctAnswer, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    const keyBadges = ['1', '2', '3', '4'];

    options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'mc-btn-opt';
        btn.innerHTML = `<span class="key-badge">${keyBadges[index]}</span> ${opt}`;
        btn.onclick = () => handleMCAnswer(opt, correctAnswer, btn);
        mcContainer.appendChild(btn);
    });

    feedbackDiv.innerHTML = `<span class="incorrect">Not quite! Let's try multiple choice (70% points max):</span>`;
}

async function checkAnswer() {
    if (isWaitingForNext) {
        globalSeq++;
        pickNextCard();
        return;
    }
    const userAnswer = inputField.value.trim().toLowerCase();
    // NEW: Guardrail against empty submissions
    if (userAnswer === '') {
        inputField.focus(); // Just bring them back to the input box
        return; 
    }

    const correctAnswer = currentCard.front.trim().toLowerCase();

    const distance = getLevenshteinDistance(userAnswer, correctAnswer);
    const maxLength = Math.max(userAnswer.length, correctAnswer.length);
    const similarity = maxLength === 0 ? 1 : (maxLength - distance) / maxLength;

    AppLogger.log('ANSWER_SUBMITTED', { 
        userAnswer, 
        correctAnswer, 
        similarity 
    });

    if (similarity === 1) {
        inputField.disabled = true;
        isWaitingForNext = true;
        submitBtn.innerText = 'Next (Enter/Space)';
        feedbackDiv.innerHTML = `<span class="correct">Spot on! (+10.0)</span>`;
        if (currentCard.image) { imgElement.src = currentCard.image; imgElement.style.display = 'block'; }
        
        await updateDatabaseStats(10.0, 0, 10.0);
        await updateCardMemory('perfect'); // Passes the new string!

    } else if (similarity >= 0.8) {
        inputField.disabled = true;
        isWaitingForNext = true;
        submitBtn.innerText = 'Next (Enter/Space)';
        feedbackDiv.innerHTML = `<span class="partial">Close match! (+9.0)</span><br>Exact term: <b>${currentCard.front}</b>`;
        if (currentCard.image) { imgElement.src = currentCard.image; imgElement.style.display = 'block'; }
        
        await updateDatabaseStats(9.0, 0, 10.0);
        await updateCardMemory('partial'); // Passes the new string!

    } else {
        generateMultipleChoice(currentCard.front);
    }
}

async function handleMCAnswer(selected, correct, btnNode) {
    AppLogger.log('MC_CLICKED', { selected, correct });
    isMultipleChoiceMode = false;
    isWaitingForNext = true;

    const buttons = mcContainer.querySelectorAll('.mc-btn-opt');
    buttons.forEach(b => {
        b.disabled = true;
        b.querySelector('.key-badge').style.opacity = '0.5';
    }); 

    if (selected.toLowerCase() === correct.toLowerCase()) {
        btnNode.style.backgroundColor = '#27ae60';
        btnNode.style.color = 'white';
        btnNode.style.borderColor = '#27ae60';
        feedbackDiv.innerHTML = `<span class="mc-correct">Correct! (+7.0)</span>`;
        await updateDatabaseStats(7.0, 0, 10.0);
    } else {
        btnNode.style.backgroundColor = '#e74c3c';
        btnNode.style.color = 'white';
        btnNode.style.borderColor = '#e74c3c';
        feedbackDiv.innerHTML = `<span class="incorrect">Incorrect (+0.0)</span>`;
        await updateDatabaseStats(0, 1, 10.0);
        
        buttons.forEach(b => {
            if(b.innerText.toLowerCase().includes(correct.toLowerCase())) {
                b.style.backgroundColor = '#27ae60';
                b.style.color = 'white';
                b.style.borderColor = '#27ae60';
            }
        });
    }

    await updateCardMemory('miss'); 

    contextText.innerHTML = currentCard.context || "<i>Detailed textbook section will appear here once the markdown ingestion script is run.</i>";
    contextBox.style.display = 'block';
    if (currentCard.image) { imgElement.src = currentCard.image; imgElement.style.display = 'block'; }

    submitBtn.innerText = 'Next (Enter/Space)';
    submitBtn.style.display = 'inline-block';
}

// --- EVENT LISTENERS ---
document.addEventListener("keydown", function(event) {
    if (isMultipleChoiceMode) {
        const key = event.key;
        let selectedIndex = -1;
        
        if (key === '1') selectedIndex = 0;
        else if (key === '2') selectedIndex = 1;
        else if (key === '3') selectedIndex = 2;
        else if (key === '4') selectedIndex = 3;

        if (selectedIndex !== -1) {
            event.preventDefault(); 
            const buttons = mcContainer.querySelectorAll('.mc-btn-opt');
            if (buttons[selectedIndex] && !buttons[selectedIndex].disabled) {
                buttons[selectedIndex].click(); 
            }
        }
        return; 
    }

    if (isWaitingForNext) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); 
            globalSeq++;
            pickNextCard();
        }
    } 
    else {
        if (document.activeElement === inputField && event.key === "Enter") {
            event.preventDefault();
            submitBtn.click();
        }
    }
});

// --- SIDEBAR TOGGLE ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        backdrop.classList.remove('show');
    } else {
        sidebar.classList.add('open');
        backdrop.classList.add('show');
    }
}

// Kick off the whole thing by checking if a user is logged in
checkAuth();