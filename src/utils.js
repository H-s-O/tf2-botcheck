// remove characters added by bots
const cleanName = (name) => name.replace(/[\u000A\u000D\u200F\u202C\u2063]/g, '')

const censorMessage = (message) => message.replace(/(b)o(t)/gi, '$1*$2')

const censorName = (name) => censorMessage(name.replace(/[aeiouy]/gi, '*'))

const messageChecksum = (message) => {
  let checksum = message.charCodeAt(0)
  for (let i = 1; i < message.length; i++) {
    checksum ^= message.charCodeAt(i)
  }
  return checksum
}

const escapeMessage = (message) => message.replace(/\"/g, '\'\'') // yolo

module.exports = {
  cleanName,
  censorMessage,
  censorName,
  messageChecksum,
  escapeMessage,
}
