require('dotenv').config();
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// Notice we imported SchemaType here
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai'); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODELS_TO_TRY = [
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash"
];

const ASSETS_DIR = path.join(__dirname, '../assets');

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('[ERROR] Could not connect to database', err);
});

function getAllMarkdownFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllMarkdownFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if(file.endsWith(".md")) arrayOfFiles.push(path.join(dirPath, file));
        }
    });
    return arrayOfFiles;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

// Force the AI to adhere to this exact structure (No hallucinations allowed)
const flashcardSchema = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            front: { type: SchemaType.STRING, description: "The term itself." },
            back: { type: SchemaType.STRING, description: "A fill-in-the-blank definition (replace term with '_______')." },
            context: { type: SchemaType.STRING, description: "The surrounding explanatory paragraph." },
            image: { type: SchemaType.STRING, description: "Image filename, or empty string if none." }
        },
        required: ["front", "back", "context", "image"]
    }
};

// Helper to check if chapter already exists
const checkChapterExists = (chapterName) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM flashcards WHERE chapter = ?`, [chapterName], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
};

db.serialize(async () => {
    const mdFiles = getAllMarkdownFiles(ASSETS_DIR);
    console.log(`[INFO] Found ${mdFiles.length} Markdown files. Booting up Cascading AI Engine...\n`);

    const stmt = db.prepare(`INSERT INTO flashcards (front, back, context, image, chapter, ai_model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    let totalAdded = 0;

    for (const filePath of mdFiles) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        let chapterName = "General";
        const baseName = path.basename(filePath);
        const chapMatch = baseName.match(/(Chapter_\d+_[a-zA-Z_]+)/i);
        if (chapMatch) chapterName = chapMatch[1].replace(/_/g, ' ');

        // --- SMART RESUME CHECK ---
        const existingCount = await checkChapterExists(chapterName);
        if (existingCount > 0) {
            console.log(`[SKIP] ${chapterName} already exists (${existingCount} cards). Moving to next...`);
            continue; 
        }

        console.log(`\n[Processing] Sending ${chapterName} to Gemini API...`);

        const prompt = `
        You are an expert Anatomy & Physiology professor. Read the following textbook chapter in Markdown.
        Extract the most important anatomical terms and physiological concepts to create study flashcards.
        
        Rules:
        - Exclude generic textbook headers like "Learning Outcomes", "Review Questions", or "Chapter Summary".
        - DO NOT include grounding citations (e.g., ). 
        - DO NOT include unescaped literal newline characters inside your string values.
        - For the "image" field, look at the markdown image tags (![[image.jpeg]]). Assign the filename of the most recently mentioned image tag BEFORE the term. Format it as "images/filename.jpeg". If no image is relevant, return an empty string "".
        
        Chapter Content:
        ${fileContent}
        `;

        let success = false;

        for (let modelIdx = 0; modelIdx < MODELS_TO_TRY.length; modelIdx++) {
            const currentModelName = MODELS_TO_TRY[modelIdx];
            
            const model = genAI.getGenerativeModel({ 
                model: currentModelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    responseSchema: flashcardSchema // Enforces perfect JSON formatting
                } 
            });

            let retries = 0;
            const maxRetries = 3;

            while (!success && retries < maxRetries) {
                try {
                    const result = await model.generateContent(prompt);
                    const responseText = result.response.text();
                    
                    try {
                        const flashcards = JSON.parse(responseText);
                        const timestamp = new Date().toISOString(); 

                        flashcards.forEach(card => {
                            stmt.run(card.front, card.back, card.context, card.image, chapterName, currentModelName, timestamp);
                            totalAdded++;
                        });
                        console.log(`  -> [SUCCESS] Extracted ${flashcards.length} smart flashcards using ${currentModelName}.`);
                        success = true; 
                    } catch (parseError) {
                        console.error(`  -> [ERROR] ${currentModelName} returned malformed JSON. Saving output to error_log.txt`);
                        fs.writeFileSync('error_log.txt', responseText);
                        success = true; 
                    }

                } catch (apiError) {
                    if (apiError.message.includes('503') || apiError.message.includes('429')) {
                        retries++;
                        if (retries >= maxRetries) {
                            console.log(`  -> [EXHAUSTED] ${currentModelName} failed 3 times. Falling back to next model...`);
                            break; 
                        }
                        const waitTime = retries * 5000; 
                        console.log(`  -> [WARNING] ${currentModelName} Busy. Retrying in ${waitTime/1000}s... (Attempt ${retries} of ${maxRetries})`);
                        await delay(waitTime); 
                    } else {
                        console.error(`  -> [ERROR] API failed for ${currentModelName}:`, apiError.message);
                        break; 
                    }
                }
            }
            if (success) break; 
        }

        if (!success) {
            console.log(`  -> [FATAL] All models failed to process ${chapterName}. Skipping to next chapter.`);
        }
        await delay(5000); 
    }

    stmt.finalize();
    console.log(`\n[COMPLETE] AI Ingestion finished! Added ${totalAdded} new flashcards to your existing deck.`);
});