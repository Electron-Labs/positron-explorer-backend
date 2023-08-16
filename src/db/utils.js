const levelup = require('levelup')
const leveldown = require('leveldown')
const encode = require('encoding-down')
const db = levelup(encode(leveldown('./src/db/watcher')))

const persistKeyValue = async (key, value) => {
  try {
    await db.put(key, value)
    console.log(`persist ${key}:${value}`)
    return true
  } catch (err) {
    console.log('Error while persisting: ', key)
    console.log(err)

  }
}

const getKeyValue = async (key) => {
  try {
    const value = await db.get(key)
    return value
  } catch (err) {
    console.log('Error while querying:', key)
    console.log(err)
    return false
  }
}

module.exports = { persistKeyValue, getKeyValue }