const fs = require('fs');
const path = require('path');

// Define our source (assets) and destination (public/images) paths
const ASSETS_DIR = path.join(__dirname, '../assets');
const DEST_DIR = path.join(__dirname, 'public/images');

// Ensure the destination folder exists
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Recursive function to hunt down every image file in any subfolder
function getAllImages(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllImages(fullPath, arrayOfFiles);
        } else {
            // Only grab image files
            if (file.match(/\.(jpeg|jpg|png|gif)$/i)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });
    return arrayOfFiles;
}

console.log(`[INFO] Scanning ${ASSETS_DIR} for images...`);

const allImages = getAllImages(ASSETS_DIR);
console.log(`[INFO] Found ${allImages.length} total images in the assets folder. Syncing...`);

let newCopies = 0;
let skipped = 0;

allImages.forEach(sourcePath => {
    const fileName = path.basename(sourcePath);
    const destPath = path.join(DEST_DIR, fileName);
    
    // Only copy if the file doesn't already exist in the public folder
    if (!fs.existsSync(destPath)) {
        fs.copyFileSync(sourcePath, destPath);
        newCopies++;
    } else {
        skipped++;
    }
});

console.log(`[SUCCESS] Image sync complete!`);
console.log(`  -> Copied ${newCopies} new images.`);
console.log(`  -> Skipped ${skipped} images that were already in the public folder.`);