// remove invisible characters added by hijacking/duplicating bots
const cleanName = (name) => name.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u206F\u0300-\u036F\u0E31-\u0ECD\uFFF0-\uFFFD\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, '')

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
