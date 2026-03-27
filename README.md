# Anatomy & Physiology Adaptive Flashcards

A full-stack, adaptive active-recall flashcard application designed for studying Anatomy & Physiology. Built with a Node.js/SQLite backend and a vanilla HTML/JS frontend, this app emphasizes active recall, forgiving typos, and gracefully degrading to multiple-choice when you get stuck.

## ✨ Features

* **Active Recall Testing:** Instead of passively clicking "reveal," users must actively type the correct anatomical term based on the definition and provided image.
* **Fuzzy Matching (Levenshtein Distance):** Typos shouldn't ruin a study session. The app calculates the distance between the user's input and the correct answer. 
  * Exact match = 10 Points
  * ≥ 80% accuracy (e.g., "Mithochondria") = 8 Points
* **Adaptive Multiple-Choice Fallback:** If a user completely misses a typed answer, the app dynamically generates a multiple-choice question using other terms from the deck as distractors.
  * Correct multiple-choice answer = 6 Points
* **Keyboard Navigation:** Completely mouse-free study flow. Use `Enter`/`Space` to advance cards, and number keys (`1`, `2`, `3`, `4`) to select multiple-choice lifelines.
* **Persistent SQLite Database:** Flashcards and user statistics (Total Score, Missed Count) are securely stored in a local `.db` file via a Node.js backend.
* **Mobile-Ready & Network Accessible:** Fully responsive UI designed to look and feel like a native mobile app when accessed via a local network or Tailscale tunnel.

## 🛠️ Tech Stack

* **Frontend:** Vanilla HTML5, CSS3, JavaScript (No heavy frameworks, highly portable)
* **Backend:** Node.js, Express.js
* **Database:** SQLite3
* **Networking (Optional):** Tailscale (for secure WSL to iOS tunneling)

## 📂 Project Structure

```text
flashcard-app/
│
├── package.json         # Node.js dependencies
├── server.js            # Express server, SQLite DB initialization, and API routes
├── database.db          # Auto-generated SQLite database (created on first run)
└── public/              # Frontend files served to the client
    ├── index.html       # Main application UI and logic
    └── images/          # Local storage for anatomical reference images (.jpeg)
```

## 🚀 Installation & Setup

**Prerequisites:** You must have [Node.js](https://nodejs.org/) installed on your machine.

1. **Clone or Download the Repository**
2. **Install Dependencies:**
   Open your terminal (PowerShell, Command Prompt, or WSL) in the project directory and run:
   ```bash
   npm install
   ```
3. **Start the Server:**
   ```bash
   npm start
   ```
4. **Access the App:**
   * **Local Desktop:** Open your browser and go to `http://localhost:3001`
   * **Local Network (LAN):** Find your host IPv4 address (e.g., `192.168.1.5`) and go to `http://192.168.1.5:3001` on your mobile device.

*Note: On the very first run, the Node server will automatically build the `database.db` file, create the tables, and seed it with the Chapter 3 flashcard data.*

## 🌐 WSL & Tailscale Integration (Advanced)

If you are developing inside Windows Subsystem for Linux (WSL) and want to securely access the app on your mobile device without wrestling with Hyper-V vEthernet bridging, use Tailscale.

1. Install Tailscale natively inside your WSL environment via the official script:
   ```bash
   curl -fsSL [https://tailscale.com/install.sh](https://tailscale.com/install.sh) | sh
   ```
2. Start the daemon and bring the node online:
   ```bash
   sudo tailscaled &
   sudo tailscale up
   ```
3. Start the Node application (`npm start`).
4. In a separate WSL terminal, serve the port to your Tailnet:
   ```bash
   sudo tailscale serve 3001
   ```
5. Tailscale will provide a secure HTTPS URL (e.g., `https://your-wsl-machine.tailnet.ts.net`). Open this URL on any device connected to your Tailscale network.

## 🗺️ Roadmap

- [x] Base static flashcards
- [x] Local storage progress tracking
- [x] Node.js / SQLite3 backend migration
- [x] Typing active recall with fuzzy matching
- [x] Adaptive multiple-choice fallback with hotkeys
- [ ] Automated data ingestion script for importing new chapters from Markdown/PDFs
- [ ] Spaced repetition algorithm (SRS) based on user miss/hit rates
- [ ] UI visual polish (animations, streak counters, audio cues)
