const fs = require('fs');
const robot = require('robotjs');
const sleep = require('sleep');
const yargs = require('yargs');

const SIMULATE = yargs.argv.s === true;
const BOT_LIST = require('./data/bots.json');

const HASH = typeof yargs.argv.h !== 'undefined' ? yargs.argv.h : Date.now().toString(36);
const START_MARKER = `-bc.${HASH}-`;
const END_MARKER = `-/bc.${HASH}-`;
const NAME_LINE_REGEXP = /^"name" = "(.+?)"/g;
const LOBBY_LINE_REGEXP = /^  Member\[\d+\] \[(U:.+?)\]  team = (\w+)/gm;
const STATUS_LINE_REGEXP = /^#\s+(\d+)\s+"(.+?)"\s+\[(U:.+?)\]\s+([\d:]+)/gm;
const BOT_CHECK_REGEXP_TEMPLATE = (name, escape = true) => RegExp(`^(\\(\\d+\\))*${escape ? name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : name}$`); // escape the name which may contain regexp control characters
const CONSOLE_KEY = '/';
const TEAM_LABELS = {
    TF_GC_TEAM_DEFENDERS: 'RED',
    TF_GC_TEAM_INVADERS: 'BLU',
};
const OPPOSITE_TEAM = {
    TF_GC_TEAM_DEFENDERS: 'TF_GC_TEAM_INVADERS',
    TF_GC_TEAM_INVADERS: 'TF_GC_TEAM_DEFENDERS',
};
const PARSE_CONNECTED_TIME = (time) => {
    const arr = time.split(':').reverse();
    let seconds = 0;
    // Seconds
    seconds += parseInt(arr[0]);
    // Minutes
    seconds += parseInt(arr[1]) * 60;
    if (arr.length === 3) {
        // Hours
        seconds += parseInt(arr[2]) * 3600;
    }
    if (arr.length === 4) {
        // Days (?!)
        seconds += parseInt(arr[3]) * 86400;
    }
    return seconds;
};

robot.setKeyboardDelay(0);

if (!SIMULATE) {
    // Open TF2 console, log current status and close console
    console.info('Sending TF2 console keystrokes');
    robot.typeString(CONSOLE_KEY);
    sleep.msleep(50);
    robot.typeString(`echo ${START_MARKER};name;tf_lobby_debug;status;`);
    sleep.msleep(50);
    robot.keyTap('enter');
    sleep.msleep(250);
    robot.typeString(`echo ${END_MARKER};`);
    sleep.msleep(50);
    robot.keyTap('enter');
    sleep.msleep(50);
    robot.keyTap('escape');
}

// Read log file
console.info('Reading TF2 console log file');
const logPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Team Fortress 2\\tf\\console.log';
const logContent = fs.readFileSync(logPath, { encoding: 'utf8' });

// Find last occurence of start and end markers
const startMarkerPos = logContent.lastIndexOf(START_MARKER);
if (startMarkerPos === -1) {
    // Start marker not found, abort
    console.error('Could not find start marker, aborting');
    process.exit(1);
}
const endMarkerPos = logContent.lastIndexOf(END_MARKER);
if (endMarkerPos === -1) {
    // End marker not found, abort
    console.error('Could not find end marker, aborting');
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
let playerMatches;
while ((playerMatches = STATUS_LINE_REGEXP.exec(statusContent)) !== null) {
    players.push({
        userid: playerMatches[1],
        name: playerMatches[2],
        cleanName: playerMatches[2].replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u206F]/g, ''), // remove invisible characters possibly added by hijacking bots
        uniqueid: playerMatches[3],
        connected: PARSE_CONNECTED_TIME(playerMatches[4]),
    });
}
if (players.length === 0) {
    // Empty players list, exit
    console.info('No players found, exiting')
    process.exit(0);
}

// Parsing lobby debug info
const lobby = [];
let lobbyMatches;
while ((lobbyMatches = LOBBY_LINE_REGEXP.exec(statusContent)) !== null) {
    lobby.push({
        uniqueid: lobbyMatches[1],
        team: lobbyMatches[2],
    });
}

if (lobby.length < players.length) {
    // Mismatch between players status count and lobby debug info count, abort
    console.error('Status and lobby debug mismatch, aborting');
    process.exit(1);
}

// Merge lobby debug info into player info
for (const player of players) {
    for (const info of lobby) {
        if (info.uniqueid === player.uniqueid) {
            player.team = info.team;
        }
    }
}

// Parsing current player name
const nameMatches = NAME_LINE_REGEXP.exec(statusContent);
const currentPlayerName = nameMatches[1];
const currentPlayerInfo = players.find(({ name }) => name === currentPlayerName);
console.info('Current player name:', currentPlayerName, 'uniqueid:', currentPlayerInfo.uniqueid, 'team:', currentPlayerInfo.team);

// Find named bots first; loop each known bot name and check against each player name
for (const botDefinition of BOT_LIST) {
    for (const player of players) {
        const botRegExp = BOT_CHECK_REGEXP_TEMPLATE(botDefinition.name, botDefinition.regexp !== true);
        if (botRegExp.test(player.cleanName)) {
            console.info('Found bot:', player.name);
            player.flag = 'namedbot';
        }
    }
}

// Then, find hijacking bots; loop each player against all other players and compare names and connected time
for (const player1 of players) {
    for (const player2 of players) {
        if (player1.userid === player2.userid) {
            // Do not compare a player against itself, skip
            continue;
        }
        if (player1.cleanName === player2.cleanName) {
            if (player1.connected < player2.connected && !player1.flag) {
                player1.flag = 'hijackerbot';
            } else if (player2.connected < player1.connected && !player2.flag) {
                player2.flag = 'hijackerbot';
            } else {
                // Connected times are the same for both players, so ignore since we can't determine which one is the bot
            }
        }
    }
}

const foundBots = players.filter(({ flag }) => flag === 'namedbot');
const foundDuplicates = players.filter(({ flag }) => flag === 'hijackerbot');
if (foundBots.length === 0 && foundDuplicates.length === 0) {
    // Nothing suspicious found, exit
    console.info('No bots or duplicates found, exiting')
    process.exit(0);
}

// Create and format messages for sendkeys module to properly "type" it
let message1 = null, message2 = null;
if (foundBots.length > 0) {
    message1 = `[BOT CHECK] Found ${foundBots.length} known named bot${foundBots.length > 1 ? 's' : ''}: ${foundBots.map(({ cleanName }) => cleanName).join(', ')}`;
    console.info('Message to send:', message1);
}
if (foundDuplicates.length > 0) {
    message2 = `[BOT CHECK] Found ${foundDuplicates.length} name-stealing bot${foundDuplicates.length > 1 ? 's' : ''}: ${foundDuplicates.map(({ cleanName }) => cleanName).join(', ')}`;
    console.info('Message to send:', message2);
}

if (!SIMULATE) {
    sleep.msleep(250);

    // Send found bots and duplicates chat messages
    console.info('Sending TF2 chat keystrokes')
    if (message1) {
        robot.typeString('y');
        sleep.msleep(50);
        robot.typeString(message1);
        sleep.msleep(50);
        robot.keyTap('enter');
    }
    if (message1 && message2) {
        sleep.msleep(1000);
    }
    if (message2) {
        robot.typeString('y');
        sleep.msleep(50);
        robot.typeString(message2);
        sleep.msleep(50);
        robot.keyTap('enter');
    }
}

// @TODO auto call kick vote

console.info('Completed');
process.exit(0);
