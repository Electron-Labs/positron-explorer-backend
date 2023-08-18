const { watchNear } = require("./nearLogs")
const { watchEth } = require("./ethLogs")

const watchLogs = async () => {
  await watchEth()
  await watchNear()
  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watchLogs, 0);

// TODO: handle amount