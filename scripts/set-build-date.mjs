import fs from 'fs';
import path from 'path';

const versionFilePath = path.join(process.cwd(), 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));

// Update buildDate to current ISO timestamp
versionData.buildDate = new Date().toISOString();

fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
console.log('Build date updated in version.json');
