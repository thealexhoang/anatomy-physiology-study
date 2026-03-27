const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('[ERROR] Could not connect to database', err);
        process.exit(1);
    }
});

const IGNORE_LIST = [
    'learning outcome', 'check your understanding', 'level 1', 'level 2', 
    'level 3', 'homeostatic imbalance', 'clinical', 'chapter', 
    'review questions', 'summary', 'related clinical terms', 
    'a closer look', 'career connection'
];

function getAllMarkdownFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllMarkdownFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if(file.endsWith(".md")) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

db.serialize(() => {
    // Add the new chapter column safely
    db.run(`ALTER TABLE flashcards ADD COLUMN context TEXT`, (err) => {});
    db.run(`ALTER TABLE flashcards ADD COLUMN chapter TEXT`, (err) => {});

    if (!fs.existsSync(ASSETS_DIR)) {
        console.error(`[ERROR] Assets directory not found at: ${ASSETS_DIR}`);
        process.exit(1);
    }

    const mdFiles = getAllMarkdownFiles(ASSETS_DIR);
    console.log(`[INFO] Found ${mdFiles.length} Markdown files. Starting extraction...`);

    // Updated SQL statement to include 'chapter'
    const stmt = db.prepare(`INSERT INTO flashcards (front, back, context, image, chapter) VALUES (?, ?, ?, ?, ?)`);
    let addedCount = 0;
    let skippedCount = 0;

    mdFiles.forEach(filePath => {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const paragraphs = fileContent.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
        
        // Extract Chapter Name from the filename (e.g., B04_Chapter_4_Tissue... -> Chapter 4 Tissue...)
        let chapterName = "General";
        const baseName = path.basename(filePath);
        const chapMatch = baseName.match(/(Chapter_\d+_[a-zA-Z_]+)/i);
        if (chapMatch) {
            chapterName = chapMatch[1].replace(/_/g, ' ');
        } else {
            // Fallback: Try to find an H1 tag like "# 4. Tissue: The Living Fabric"
            const h1Match = fileContent.match(/^#\s+(.*)/m);
            if(h1Match) chapterName = h1Match[1].trim();
        }

        let currentImage = null;

        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];

            const imgMatch = para.match(/!\[\[(.*?)\]\]/);
            if (imgMatch) {
                currentImage = `images/${imgMatch[1]}`;
                continue;
            }

            if (para.startsWith('### ') || para.startsWith('#### ') || para.startsWith('## ')) {
                let term = para.replace(/^#+\s*/, '').trim(); 
                let termLower = term.toLowerCase();
                
                const isIgnored = IGNORE_LIST.some(ignoreWord => termLower.includes(ignoreWord));

                if (term.length > 0 && term.length < 60 && !isIgnored && !/^\d+\.\d+/.test(term)) {
                    let back = "Definition not found.";
                    let contextPara = "Context not found.";

                    if (paragraphs[i+1] && !paragraphs[i+1].startsWith('#') && !paragraphs[i+1].startsWith('!')) {
                        back = paragraphs[i+1];
                    }
                    if (paragraphs[i+2] && !paragraphs[i+2].startsWith('#') && !paragraphs[i+2].startsWith('!')) {
                        contextPara = paragraphs[i+2];
                    }

                    // Save to database, now including the chapter name!
                    stmt.run(term, back, contextPara, currentImage, chapterName);
                    addedCount++;
                    console.log(`  -> Extracted: ${term} [${chapterName}]`);
                } else if (isIgnored) {
                    skippedCount++;
                }
            }
        }
    });

    stmt.finalize();
    console.log(`\n[SUCCESS] Ingestion complete! Added ${addedCount} flashcards with Chapter tags.`);
});