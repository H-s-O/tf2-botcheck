const { OPPOSITE_TEAM } = require('../constants')
const { cleanName } = require('./utils')

const getNameLineRegexp = () => /^"name" = "(.+?)"/g
const getLobbyLineRegexp = () => /^  (Member|Pending)\[\d+\] \[(U:.+?)\]  team = (\w+)/gm
const getStatusLineRegexp = () => /^#\s+(\d+)\s+"(.+?)"\s+\[(U:.+?)\]\s+([\d:]+)\s+(\d+)\s+(\d+)\s+(\w+)/gms

const parseConnectedTime = (time) => {
  const arr = time.split(':').reverse()
  let seconds = 0
  // Seconds
  seconds += parseInt(arr[0])
  // Minutes
  seconds += parseInt(arr[1]) * 60
  if (arr.length === 3) {
    // Hours
    seconds += parseInt(arr[2]) * 3600
  }
  if (arr.length === 4) {
    // Days (?!)
    seconds += parseInt(arr[3]) * 86400
  }
  return seconds
}

const parseStatusTable = (statusContent) => {
  const statusLineRegexp = getStatusLineRegexp()
  const players = []
  let playerMatches
  while ((playerMatches = statusLineRegexp.exec(statusContent)) !== null) {
    players.push({
      userid: playerMatches[1],
      name: playerMatches[2],
      cleanName: cleanName(playerMatches[2]),
      uniqueid: playerMatches[3],
      connected: parseConnectedTime(playerMatches[4]),
      ping: parseInt(playerMatches[5]),
      loss: parseInt(playerMatches[6]),
      state: playerMatches[7],
    })
  }
  return players
}

const parseCurrentPlayer = (statusContent) => {
  const nameLineRegexp = getNameLineRegexp()
  const nameMatches = nameLineRegexp.exec(statusContent)
  // Guard
  if (!nameMatches) {
    return null
  }
  const currentPlayerName = nameMatches[1]
  return currentPlayerName
}

const teamsSwitchedStatus = null

const parseLobbyDebug = (statusContent, teamsSwitchedStatus) => {
  const lobbyLineRegexp = getLobbyLineRegexp()
  const lobby = []
  let lobbyMatches
  while ((lobbyMatches = lobbyLineRegexp.exec(statusContent)) !== null) {
    lobby.push({
      lobby: lobbyMatches[1],
      uniqueid: lobbyMatches[2],
      team: lobbyMatches[3],
      realTeam: teamsSwitchedStatus === true ? OPPOSITE_TEAM[lobbyMatches[3]] : teamsSwitchedStatus === false ? lobbyMatches[3] : null,
    })
  }
  return lobby
}

const mergeStatusAndLobby = (status, lobby) => {
  const statusClone = status.concat()
  for (const player of statusClone) {
    for (const info of lobby) {
      if (info.uniqueid === player.uniqueid) {
        player.team = info.team
        player.realTeam = info.realTeam
      }
    }
  }
  return statusClone
}

const parseAll = (statusContent, teamsSwitchedStatus = null) => {
  const currentPlayer = parseCurrentPlayer(statusContent)
  if (!currentPlayer) return null
  const status = parseStatusTable(statusContent)
  if (status.length === 0) return null
  const lobbyDebug = parseLobbyDebug(statusContent, teamsSwitchedStatus)
  if (lobbyDebug.length === 0) return null
  status.forEach((player) => (player.name === currentPlayer) && (player.currentPlayer = true))
  const merged = mergeStatusAndLobby(status, lobbyDebug)
  return merged
}

const getCurrentPlayerInfo = (status) => status.find(({ currentPlayer }) => currentPlayer === true) || null

module.exports = {
  parseStatusTable,
  parseCurrentPlayer,
  parseLobbyDebug,
  parseAll,
  mergeStatusAndLobby,
  getCurrentPlayerInfo,
}
