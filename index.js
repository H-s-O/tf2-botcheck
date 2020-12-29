const fs = require('fs');
const robot = require('robotjs');
const sleep = require('sleep');
const sendkeys = require('sendkeys');

const BOT_LIST = require('./data/bots.json');

const HASH = Date.now().toString(36);
const START_MARKER = `-bc.${HASH}-`;
const END_MARKER = `-/bc.${HASH}-`;
const STATUS_LINE_REGEXP = /^#\s+(\d+)\s+"(.+)"/gm;
const BOT_CHECK_REGEXP_TEMPLATE = (name) => RegExp(`^(\\(\\d+\\))*${name}$`);
const CONSOLE_KEY = '/';

robot.setKeyboardDelay(0);

// Open TF2 console, log current status and close console
console.info('Sending TF2 console keystrokes');
robot.typeString(CONSOLE_KEY);
sleep.msleep(10);
sendkeys.sync(`echo ${START_MARKER};status;`);
sleep.msleep(10);
robot.keyTap('enter');
sleep.msleep(250);
sendkeys.sync(`echo ${END_MARKER};`);
sleep.msleep(10);
robot.keyTap('enter');
sleep.msleep(10);
robot.keyTap('escape');

// Read log file
console.info('Opening TF2 log file');
const logPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Team Fortress 2\\tf\\console.log';
const logContent = fs.readFileSync(logPath, { encoding: 'ascii' });

// Find last occurence of start and end markers
const startMarkerPos = logContent.indexOf(START_MARKER);
if (startMarkerPos === -1) {
    // Start marker not found, abort
    console.error('Could not find start marker, aborting');
    process.exit(1);
}
const endMarkerPos = logContent.indexOf(END_MARKER);
if (endMarkerPos === -1) {
    // End marker not found, abort
    console.error('Could not find end, aborting');
    process.exit(1);
}

// Extracting status
const statusContent = logContent.substring(startMarkerPos + START_MARKER.length, endMarkerPos).trim();
if (statusContent.length === 0) {
    // Status content empty, abort
    console.info('No status content, aborting')
    process.exit(1);
}
console.info('Status:')
console.info(statusContent);

// Parsing players list
const players = [];
let matches;
while ((matches = STATUS_LINE_REGEXP.exec(statusContent)) !== null) {
    players.push({ userid: matches[1], name: matches[2] });
}
if (players.length === 0) {
    // Empty players list, exit
    console.info('No players found, exiting')
    process.exit(0);
}

// Loop each bot name and check against each player name
const foundBots = [];
for (const botDefinition of BOT_LIST) {
    for (const player of players) {
        const botRegExp = BOT_CHECK_REGEXP_TEMPLATE(botDefinition.name);
        if (botRegExp.test(player.name)) {
            console.info('Found bot:', player.name);
            foundBots.push(player);
        }
    }
}
if (foundBots.length === 0) {
    // No bots found, exit
    console.info('No bots found, exiting')
    process.exit(0);
}

// Create and format message for sendkeys module to properly "type" it
const message = `BOT CHECK - Found ${foundBots.length} named bot${foundBots.length > 1 ? 's' : ''}: ${foundBots.map(({ name }) => name).join(', ')}`
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}');
console.info('Message to send:', message);

sleep.msleep(100);

// Open TF2 console, output found bots message and close console
console.info('Sending TF2 chat keystrokes')
robot.typeString('y');
sleep.msleep(10);
sendkeys.sync(message);
sleep.msleep(10);
robot.keyTap('enter');

// @TODO auto call kick vote

console.info('Completed');
process.exit(0);
