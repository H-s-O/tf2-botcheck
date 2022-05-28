const { execSync } = require('child_process')

const { TF2_EXEC } = require('../constants')

const sendCommand = (command) => {
  try {
    console.log('Sending command:', command)
    execSync(`"${TF2_EXEC}" -game tf -hijack ${command}`, { windowsHide: true, timeout: 5000 })
    return true
  } catch (e) {
    console.error('Error while sending command:', e)
    return false
  }
}

module.exports = {
  sendCommand,
}
