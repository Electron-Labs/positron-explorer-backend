const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs")

const watch = async () => {
  const nearNetwork = "testnet"

  await syncEth({ fromBlock: 9551226, toBlock: 9551226 }, { fromBlock: 9551922, toBlock: 9552213 })
  await syncNear(nearNetwork, { fromBlock: 135335211, toBlock: 135349425 })

  await watchEth()
  await watchNear(nearNetwork)

  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watch, 0);

// TODO: handle amount
// TODO: failure status after a periodic check
