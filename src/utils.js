const cleanName = (name) => {
  // remove invisible characters added by hijacking/duplicating bots
  return name.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u206F\u0300-\u036F\u0E31-\u0ECD\uFFF0-\uFFFD\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, '')
}

module.exports = {
  cleanName,
}
