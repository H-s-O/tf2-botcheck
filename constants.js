module.exports = {
  TF2_EXEC: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Team Fortress 2\\hl2.exe',
  TF2_LOG: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Team Fortress 2\\tf\\console.log',

  STATE_ACTIVE: 'active',
  STATE_SPAWNING: 'spawning',

  STALLED_WARN_MIN_TIME: 30,
  STALLED_EXCLUDE_TIME_LIMIT: 60,

  TEAM_LABELS: {
    TF_GC_TEAM_DEFENDERS: 'RED',
    TF_GC_TEAM_INVADERS: 'BLU',
  },
  OPPOSITE_TEAM: {
    TF_GC_TEAM_DEFENDERS: 'TF_GC_TEAM_INVADERS',
    TF_GC_TEAM_INVADERS: 'TF_GC_TEAM_DEFENDERS',
  },

  LOBBY_MEMBER: 'Member',
  LOBBY_PENDING: 'Pending',
}
