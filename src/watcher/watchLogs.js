const { watchNearLogs } = require("./nearLogs")
const { watchEth } = require("./ethLogs")

const watchLogs = async () => {
  await watchEth()
  await watchNearLogs()
  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watchLogs, 0);