# 🧠 Adaptive Anatomy & Physiology Recall

A full-stack, AI-powered active recall application designed specifically for studying medical and anatomical concepts. It replaces rigid calendar-based flashcard scheduling with a dynamic, algorithmic "For You Page" feed that adapts to your memory in real time.

## ✨ Key Features

* **🤖 Automated AI Data Ingestion:** Features a multi-tiered Node.js pipeline that uses the Google Gemini API (cascading from 3.1-Flash-Lite to 2.5-Flash) to automatically read textbook Markdown files, extract key terms, write fill-in-the-blank definitions, and map context and images into a SQLite database.
* **📈 Algorithmic Spaced Repetition:** Scraps traditional SM-2 calendar scheduling for a dynamic probability engine. It tracks every interaction, forcing missed cards back into your feed within 5 turns while aggressively filtering out cards you've mastered.
* **🎯 Forgiving Active Recall:** Requires you to actively type the answer to build deep memory pathways, but uses a Levenshtein distance algorithm to forgive minor spelling mistakes and typos (because *syncytiotrophoblast* is hard to spell).
* **🛟 Dynamic Lifelines:** If you completely miss a term, the app dynamically generates a multiple-choice question using other terms from your deck as distractors. 

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** SQLite3 (Local)
* **Frontend:** Vanilla JavaScript, HTML5, CSS3
* **AI Integration:** `@google/generative-ai` (Gemini API)

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* A free API key from [Google AI Studio](https://aistudio.google.com/).
* Textbook chapters converted to Markdown (placed in a parent `assets/` folder).

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/thealexhoang/anatomy-physiology-study.git](https://github.com/thealexhoang/anatomy-physiology-study.git)
    cd anatomy-physiology-study/flashcard-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up your environment variables:**
    Create a `.env` file in the root directory and add your Gemini API key:
    ```env
    GEMINI_API_KEY=your_actual_api_key_here
    ```

4.  **Sync your images:**
    Run the vacuum script to pull all diagrams from your Markdown folders into the public directory:
    ```bash
    node sync-images.js
    ```

5.  **Build your database:**
    Initialize the SQLite tables, then run the AI engine to parse your Markdown files and build your deck:
    ```bash
    npm start # Stop it with Ctrl+C once it connects
    node ingest-ai.js
    ```

6.  **Run the app:**
    ```bash
    npm start
    ```
    Open your browser and navigate to `http://localhost:3001`.