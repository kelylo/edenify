const fs = require('fs');
const path = require('path');

// Read the current bible-data.json
const inputPath = path.join(__dirname, 'public', 'bible-data.json');
const outputPath = path.join(__dirname, 'public', 'bible-data-converted.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// Skip first two entries (metadata and headers)
const verses = data.slice(2).map(entry => ({
  book: entry.__EMPTY,
  chapter: parseInt(entry.__EMPTY_2, 10),
  verse: parseInt(entry.__EMPTY_3, 10),
  text: entry.__EMPTY_4
}));

// Write the converted data
fs.writeFileSync(outputPath, JSON.stringify(verses, null, 2));

console.log(`✓ Converted ${verses.length} verses to new format`);
console.log(`✓ Output saved to ${outputPath}`);

// Backup original and replace
fs.renameSync(inputPath, path.join(__dirname, 'public', 'bible-data-backup.json'));
fs.renameSync(outputPath, inputPath);

console.log(`✓ Original backed up as bible-data-backup.json`);
console.log(`✓ Replacement complete`);
