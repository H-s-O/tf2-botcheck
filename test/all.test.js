const { execSync, spawn } = require('child_process');
const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const robot = require('robotjs');

const execApp = (hash) => {
    const mainPath = join(__dirname, '..', 'index.js');
    const logPath = join(__dirname, 'fixtures', 'test_console.txt');
    const command = `node ${mainPath} -i 1000 -f ${logPath} -h ${hash}`
    execSync(command, { timeout: 3000 });
};

const prepNotepadFile = () => {
    const filePath = join(tmpdir(), `tf2-botcheck-test-${Date.now()}.txt`);
    writeFileSync(filePath, '');
    spawn('notepad', [filePath], { timeout: 3000 });
    return filePath;
};

const saveAndCloseNotepad = () => {
    robot.keyTap('s', 'control');
    robot.keyTap('f4', 'alt');
};

const compareFiles = (hash, testOutputFile) => {
    const expectedPath = join(__dirname, 'fixtures', 'output', `${hash}.txt`);
    expect(readFileSync(testOutputFile).toString()).toEqual(readFileSync(expectedPath).toString());
};

const testRunner = (hash) => {
    const file = prepNotepadFile();
    execApp(hash);
    saveAndCloseNotepad();
    compareFiles(hash, file);
};

// ----------------------------

test('nothing suspicious', () => testRunner('00000001'));
test('name-stealing bot on same team', () => testRunner('00000002'));
test('name-stealing bot on other team', () => testRunner('00000003'));
test('stalled name-stealing bot on same team', () => testRunner('00000004'));
test('stalled name-stealing bot on other team', () => testRunner('00000005'));
