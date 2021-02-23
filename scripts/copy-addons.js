const path = require('path');
const cpy = require('cpy');

const modulesDir = path.join(__dirname, '..', 'node_modules')
const binaries = path.join('**', '*.node');
const buildDir = path.join(__dirname, '..', 'build', 'node_modules');
cpy(binaries, buildDir, { cwd: modulesDir, parents: true });

console.info('Done.');
