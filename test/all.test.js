const { exec, spawn } = require('child_process');
const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { promisify } = require('util')

const { TF2_EXEC } = require('../constants');

const wait = (msDelay) => new Promise((resolve, reject) => setTimeout(resolve, msDelay));

const execPromise = promisify(exec)

const initTf2 = () => spawn(TF2_EXEC, ['-game', 'tf', '-novid', '-condebug', '-conclearlog', '+sv_lan', '1', '+map', 'ctf_2fort'], { windowsHide: true });
const execTf2Command = (command) => execPromise(`"${TF2_EXEC}" -game tf -hijack ${command}`, { windowsHide: true });

const execBotCheck = (hash) => {
    const mainPath = join(__dirname, '..', 'index.js');
    const logPath = join(__dirname, 'fixtures', 'test_console.txt');
    const command = `node ${mainPath} -i 1000 -f ${logPath} -h ${hash}`
    return execPromise(command, { timeout: 3000 });
};

// const compareFiles = (hash, testOutputFile) => {
//     const expectedPath = join(__dirname, 'fixtures', 'output', `${hash}.txt`);
//     expect(readFileSync(testOutputFile).toString()).toEqual(readFileSync(expectedPath).toString());
// };

const testRunner = async (hash) => {
    await execBotCheck(hash);
    // compareFiles(hash, file);
    // return undefined;
};

// ----------------------------

jest.setTimeout(60 * 1000);

let tf2;

beforeAll(async () => {
    console.info('Spawning local TF2 instance...');
    tf2 = initTf2();
    console.info('Waiting 45 seconds...');
    await wait(45 * 1000);
});

test('nothing suspicious', () => testRunner('00000001'));
test('name-stealing bot on same team', () => testRunner('00000002'));
test('name-stealing bot on other team', () => testRunner('00000003'));
test('stalled name-stealing bot on same team', () => testRunner('00000004'));
test('stalled name-stealing bot on other team', () => testRunner('00000005'));

afterAll(() => {
    console.info('Exiting TF2...');
    if (tf2) tf2.kill();
});