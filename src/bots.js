const { STATE_SPAWNING, STALLED_WARN_MIN_TIME, TEAM_LABELS, STATE_ACTIVE, STALLED_EXCLUDE_TIME_LIMIT } = require('../constants')
const BOT_LIST = require('../data/bots.json')
const { getCurrentPlayerInfo } = require('./parsers')
const { censorName, censorMessage, messageChecksum } = require('./utils')

const getBotCheckRegexp = (name, escape = true) => RegExp(`^(\\(\\d+\\))*${escape ? name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : name}$`) // escape the name which may contain regexp control characters

const findBots = (players) => {
  const currentPlayerInfo = getCurrentPlayerInfo(players)

  players = players.concat() // @TODO
  const bots = []

  // Find named bots first; loop each known bot name and check against each player name
  for (const botDefinition of BOT_LIST) {
    for (const player of players) {
      if (botDefinition.ignore && botDefinition.ignore.includes(player.uniqueid)) {
        continue
      }
      const botRegExp = getBotCheckRegexp(botDefinition.name, botDefinition.regexp !== true)
      if (botRegExp.test(player.cleanName)) {
        console.info('Found named bot:', player.name)
        player.flag = 'namedbot'
        player.censor = botDefinition.censor === true
        player.priority = botDefinition.priority || 0
        bots.push(player)
      }
    }
  }

  // Then, find hijacking bots; loop each player against all other players and compare names and connected time
  for (const player1 of players) {
    for (const player2 of players) {
      if (player1.userid === player2.userid) {
        // Do not compare a player against itself, skip
        continue
      }
      if (player1.cleanName === player2.cleanName) {
        if (player1.connected < player2.connected && !player1.flag) {
          console.info('Found clone bot:', player1.name)
          player1.flag = 'hijackerbot'
          player1.priority = player1.cleanName === currentPlayerInfo.name ? 1 : 0
          bots.push(player1)
        } else if (player2.connected < player1.connected && !player2.flag) {
          console.info('Found clone bot:', player2.name)
          player2.flag = 'hijackerbot'
          player2.priority = player2.cleanName === currentPlayerInfo.name ? 1 : 0
          bots.push(player2)
        }
      }/* else if (`${player1.cleanName}0` === player2.cleanName) {
        if (player1.connected < player2.connected && !player1.flag) {
          console.info('Found clone bot:', player1.name)
          player1.flag = 'hijackerbot'
          // player1.priority = player1.cleanName === currentPlayerInfo.name ? 1 : 0
          bots.push(player1)
        } else if (player2.connected < player1.connected && !player2.flag) {
          console.info('Found clone bot:', player2.name)
          player2.flag = 'hijackerbot'
          // player2.priority = player2.cleanName === currentPlayerInfo.name ? 1 : 0
          bots.push(player2)
        }
      }*/
    }
  }

  // Generic bots with special characters
  for (const player of players) {
    if (!player.flag && player.cleanName !== player.name) {
      console.info('Found generic bot:', player.name)
      player.flag = 'charbot'
      bots.push(player)
    }
  }

  return bots
}

const getBotInfoString = (state, connected, realTeam) => {
  if (realTeam) {
    if (state === STATE_SPAWNING && connected < STALLED_WARN_MIN_TIME) {
      return ` [joining ${TEAM_LABELS[realTeam]}...]`
    } else if (state === STATE_SPAWNING && connected >= STALLED_WARN_MIN_TIME) {
      return ` [stalled in ${TEAM_LABELS[realTeam]}...]`
    } else {
      return ` [${TEAM_LABELS[realTeam]}]`
    }
  } else {
    if (state === STATE_SPAWNING && connected < STALLED_WARN_MIN_TIME) {
      return ' [connecting...]'
    } else if (state === STATE_SPAWNING && connected >= STALLED_WARN_MIN_TIME) {
      return ' [stalled...]'
    }
  }
  return ''
}

const getBotMessages = (bots) => {
  const foundBots = bots.filter(({ flag, connected, state }) =>
    typeof flag !== 'undefined' && flag !== 'hijackerbot'
    && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))
  const foundDuplicates = bots.filter(({ flag, connected, state }) =>
    flag === 'hijackerbot'
    && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))

  let message1 = null, message2 = null
  let needsGlobalCensor = foundBots.some(({ censor, state }) => censor && state === STATE_ACTIVE)
  if (foundBots.length > 0) {
    const list1 = foundBots.map(({ cleanName, state, connected, realTeam, censor }) => {
      return `${censor && (state === STATE_ACTIVE || needsGlobalCensor)
        ? censorName(cleanName)
        : needsGlobalCensor
          ? censorMessage(cleanName)
          : cleanName}${getBotInfoString(state, connected, realTeam)}`
    }).join(', ')
    let content1 = `Found ${foundBots.length} bot${foundBots.length > 1 ? 's' : ''}`
    if (needsGlobalCensor) {
      content1 = censorMessage(content1)
    }
    const checksum1 = messageChecksum(content1).toString(36).toUpperCase().padStart(2, '0')
    let heading1 = `[BOT CHECK |${checksum1}]`
    if (needsGlobalCensor) {
      heading1 = censorMessage(heading1)
    }
    message1 = `${heading1} ${content1}: ${list1}`
    console.info('Known bots message to send:')
    console.info(message1)
  }
  if (foundDuplicates.length > 0) {
    const list2 = foundDuplicates.map(({ cleanName, state, connected, realTeam }) => {
      return `${needsGlobalCensor ? censorMessage(cleanName) : cleanName}${getBotInfoString(state, connected, realTeam)}`
    }).join(', ')
    let content2 = `Found ${foundDuplicates.length} name-stealing bot${foundDuplicates.length > 1 ? 's' : ''}`
    if (needsGlobalCensor) {
      content2 = censorMessage(content2)
    }
    const checksum2 = messageChecksum(content2).toString(36).toUpperCase().padStart(2, '0')
    let heading2 = `[BOT CHECK |${checksum2}]`
    if (needsGlobalCensor) {
      heading2 = censorMessage(heading2)
    }
    message2 = `${heading2} ${content2}: ${list2}`
    console.info('Hijacking bots message to send:')
    console.info(message2)
  }

  return [message1, message2]
}

const getKickableBot = (bots, status) => {
  const currentPlayerInfo = getCurrentPlayerInfo(status)

  const foundBots = bots.filter(({ flag, connected, state }) =>
    typeof flag !== 'undefined' && flag !== 'hijackerbot'
    && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))
  const foundDuplicates = bots.filter(({ flag, connected, state }) =>
    flag === 'hijackerbot'
    && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))

  const foundBotsOnSameTeam = foundBots
    .filter(({ team }) => team === currentPlayerInfo.team)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const foundDuplicatesOnSameTeam = foundDuplicates
    .filter(({ team }) => team === currentPlayerInfo.team)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  if (foundDuplicatesOnSameTeam.length > 0) {
    return foundDuplicatesOnSameTeam[0]
  } else if (foundBotsOnSameTeam.length > 0) {
    return foundBotsOnSameTeam[0]
  }
  return null
}

module.exports = {
  findBots,
  getBotInfoString,
  getBotMessages,
  getKickableBot,
}
