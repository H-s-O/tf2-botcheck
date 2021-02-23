const path = require('path');
const fs = require('fs');

// @TODO macOS and Linux support

const filename = 'botcheck.bat';
const fullPath = path.join(__dirname, '..', 'build', filename);
const content = 'tf2-botcheck.exe';
fs.writeFileSync(fullPath, content);

console.info('Done.');
