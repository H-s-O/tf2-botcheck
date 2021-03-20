const fs = require('fs');
const robot = require('robotjs');
const sleep = require('sleep');
const yargs = require('yargs');
const os = require('os');

const SIMULATE = yargs.argv.s === true;
const BOT_LIST = require('./data/bots.json');
const INITIAL_DELAY = typeof yargs.argv.i !== 'undefined' ? yargs.argv.i : null;
const CUSTOM_HASH = typeof yargs.argv.h !== 'undefined' ? yargs.argv.h : null;

const HASH = CUSTOM_HASH ? CUSTOM_HASH : Date.now().toString(36);
const START_MARKER = `-bc.${HASH}-`;
const END_MARKER = `-/bc.${HASH}-`;
const START_MARKER_LOOKUP = `${START_MARKER} ${os.EOL}`;
const END_MARKER_LOOKUP = `${END_MARKER} ${os.EOL}`;
const GAME_JOIN_MARKER_LOOKUP = `Team Fortress${os.EOL}`;
const TEAMS_SWITCHED_MARKER_LOOKUP = `Teams have been switched.${os.EOL}`;
const NAME_LINE_REGEXP = /^"name" = "(.+?)"/g;
const LOBBY_LINE_REGEXP = /^  Member\[\d+\] \[(U:.+?)\]  team = (\w+)/gm;
const STATUS_LINE_REGEXP = /^#\s+(\d+)\s+"(.+?)"\s+\[(U:.+?)\]\s+([\d:]+)\s+(\d+)\s+(\d+)\s+(\w+)/gm;
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
const STATE_ACTIVE = 'active';
const STATE_SPAWNING = 'spawning';
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
const MESSAGE_CHECKSUM = (message) => {
    let checksum = message.charCodeAt(0);
    for (let i = 1; i < message.length; i++) {
        checksum ^= message.charCodeAt(i);
    }
    return checksum;
};
const CENSOR_MESSAGE = (message) => {
    return message.replace(/(b)o(t)/gi, '$1*$2');
};
const CENSOR_NAME = (name) => {
    return CENSOR_MESSAGE(name.replace(/[aeiouy]/gi, '*'));
}

robot.setKeyboardDelay(0);

if (INITIAL_DELAY) {
    sleep.msleep(INITIAL_DELAY);
}

if (!SIMULATE && !CUSTOM_HASH) {
    // Open TF2 console, log current status and close console
    console.info('Sending TF2 console keystrokes');
    robot.typeString(CONSOLE_KEY);
    sleep.msleep(50);
    robot.typeString(`echo ${START_MARKER};name;tf_lobby_debug;status;`);
    sleep.msleep(50);
    robot.keyTap('enter');
    sleep.msleep(250);
    robot.typeString(`echo ${END_MARKER}`);
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
const startMarkerPos = logContent.lastIndexOf(START_MARKER_LOOKUP);
if (startMarkerPos === -1) {
    // Start marker not found, abort
    console.error('Could not find start marker, aborting');
    process.exit(1);
}
const endMarkerPos = logContent.lastIndexOf(END_MARKER_LOOKUP);
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

let teamsSwitchedStatus = null;
const gameJoinMakerPos = logContent.lastIndexOf(GAME_JOIN_MARKER_LOOKUP, endMarkerPos);
if (gameJoinMakerPos !== -1) {
    const teamsSwitchedMarkerPos = logContent.indexOf(TEAMS_SWITCHED_MARKER_LOOKUP, gameJoinMakerPos);
    teamsSwitchedStatus = teamsSwitchedMarkerPos !== -1;
}
console.info('Teams switched status:', teamsSwitchedStatus);

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
        ping: parseInt(playerMatches[5]),
        loss: parseInt(playerMatches[6]),
        state: playerMatches[7],
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
        realTeam: teamsSwitchedStatus === true ? OPPOSITE_TEAM[lobbyMatches[2]] : teamsSwitchedStatus === false ? lobbyMatches[2] : null,
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
            player.realTeam = info.realTeam;
        }
    }
}

// Parsing current player name
const nameMatches = NAME_LINE_REGEXP.exec(statusContent);
// Guard
if (!nameMatches) {
    console.error('Cannot find name of current player, aborting');
    process.exit(1);
}
const currentPlayerName = nameMatches[1];
const currentPlayerInfo = players.find(({ name }) => name === currentPlayerName);
console.info('Current player:');
console.info('  name:', currentPlayerName);
console.info('  userid:', currentPlayerInfo.userid);
console.info('  uniqueid:', currentPlayerInfo.uniqueid);
console.info('  connected:', currentPlayerInfo.connected);
console.info('  ping:', currentPlayerInfo.ping);
console.info('  loss:', currentPlayerInfo.loss);
console.info('  state:', currentPlayerInfo.state);
console.info('  team:', currentPlayerInfo.team);
console.info('  realTeam:', currentPlayerInfo.realTeam);

// Find named bots first; loop each known bot name and check against each player name
for (const botDefinition of BOT_LIST) {
    for (const player of players) {
        const botRegExp = BOT_CHECK_REGEXP_TEMPLATE(botDefinition.name, botDefinition.regexp !== true);
        if (botRegExp.test(player.cleanName)) {
            console.info('Found named bot:', player.name);
            player.flag = 'namedbot';
            player.censor = botDefinition.censor === true;
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
                console.info('Found clone bot:', player1.name);
                player1.flag = 'hijackerbot';
            } else if (player2.connected < player1.connected && !player2.flag) {
                console.info('Found clone bot:', player2.name);
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

const foundBotsOnSameTeam = foundBots.filter(({ team }) => team === currentPlayerInfo.team);
const foundDuplicatesOnSameTeam = foundDuplicates.filter(({ team }) => team === currentPlayerInfo.team);
if (foundBotsOnSameTeam.length > 0) {
    console.info('Attempting to auto-kick named bot', foundBotsOnSameTeam[0].cleanName, `(userid ${foundBotsOnSameTeam[0].userid})`);

    if (!SIMULATE) {
        sleep.msleep(250);

        // Send auto-kick command
        console.info('Sending TF2 console keystrokes');
        robot.typeString(CONSOLE_KEY);
        sleep.msleep(50);
        robot.typeString(`callvote kick ${foundBotsOnSameTeam[0].userid}`);
        sleep.msleep(50);
        robot.keyTap('enter');
        sleep.msleep(50);
        robot.keyTap('escape');
    }
} else if (foundDuplicatesOnSameTeam.length > 0) {
    console.info('Attempting to auto-kick hijacking bot', foundDuplicatesOnSameTeam[0].cleanName);

    if (!SIMULATE) {
        sleep.msleep(250);

        // Send auto-kick command
        console.info('Sending TF2 console keystrokes');
        robot.typeString(CONSOLE_KEY);
        sleep.msleep(50);
        robot.typeString(`callvote kick ${foundDuplicatesOnSameTeam[0].userid}`);
        sleep.msleep(50);
        robot.keyTap('enter');
        sleep.msleep(50);
        robot.keyTap('escape');
    }
}


// Create messages
let message1 = null, message2 = null;
if (foundBots.length > 0) {
    let needsCensor = false;
    const list1 = foundBots.map(({ cleanName, state, realTeam, censor }) => {
        if (censor) {
            needsCensor = true;
        }
        return `${censor ? CENSOR_NAME(cleanName) : cleanName}${state === STATE_SPAWNING ? ' [still connecting]' : ''}${realTeam ? ` [team ${TEAM_LABELS[realTeam]}]` : ''}`;
    }).join(', ')
    let content1 = `Found ${foundBots.length} known bot${foundBots.length > 1 ? 's' : ''}`;
    if (needsCensor) {
        content1 = CENSOR_MESSAGE(content1);
    }
    const checksum1 = MESSAGE_CHECKSUM(content1).toString(36).toUpperCase().padStart(2, '0');
    let heading1 = `[BOT CHECK |${checksum1}]`;
    if (needsCensor) {
        heading1 = CENSOR_MESSAGE(heading1);
    }
    message1 = `${heading1} ${content1}: ${list1}`;
    console.info('Message to send:', message1);
}
if (foundDuplicates.length > 0) {
    const content2 = `Found ${foundDuplicates.length} clone bot${foundDuplicates.length > 1 ? 's' : ''}: ${foundDuplicates.map(({ cleanName, state, realTeam, }) => {
        return `${cleanName}${state === STATE_SPAWNING ? ' [still connecting]' : ''}${realTeam ? ` [team ${TEAM_LABELS[realTeam]}]` : ''}`;
    }).join(', ')}`;
    const checksum2 = MESSAGE_CHECKSUM(content2).toString(36).toUpperCase().padStart(2, '0');
    message2 = `[BOT CHECK |${checksum2}] ${content2}`;
    console.info('Message to send:', message2);
}

if (!SIMULATE) {
    sleep.msleep(250);

    // Send chat messages
    console.info('Sending TF2 chat keystrokes')
    if (message1) {
        console.info('Sending message 1');
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
        console.info('Sending message 2');
        robot.typeString('y');
        sleep.msleep(50);
        robot.typeString(message2);
        sleep.msleep(50);
        robot.keyTap('enter');
    }
}

console.info('Completed');
process.exit(0);
