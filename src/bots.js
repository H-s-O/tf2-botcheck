const BOT_LIST = require('../data/bots.json')

const getBotCheckRegexp = (name, escape = true) => RegExp(`^(\\(\\d+\\))*${escape ? name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : name}$`); // escape the name which may contain regexp control characters

const findBots = (status, currentPlayerInfo) => {
  const players = status.concat()

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
        } else if (player2.connected < player1.connected && !player2.flag) {
          console.info('Found clone bot:', player2.name)
          player2.flag = 'hijackerbot'
          player2.priority = player2.cleanName === currentPlayerInfo.name ? 1 : 0
        } else {
          // Connected times are the same for both players, so ignore since we can't determine which one is the bot
        }
      }
    }
  }

  // Additional check for bots with linebreak hacks
  for (const player of players) {
    if (player.flag !== 'hijackerbot' && /\r|\n/g.test(player.name)) {
      console.info('Found linebreak hack bot:', player.name)
      player.flag = 'namedbot'
    }
  }

  return players
}

module.exports = {
  findBots
}
