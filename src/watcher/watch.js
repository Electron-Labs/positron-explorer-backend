const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs")

const watch = async () => {
  await syncEth({ fromBlock: 9538784, toBlock: 9538788 }, { fromBlock: 9546795, toBlock: 9546795 })
  await watchEth()

  const nearNetwork = "testnet"
  await syncNear(nearNetwork, { fromBlock: 135152400, toBlock: 135152400 }, { fromBlock: 135246476, toBlock: 135247423 })
  await watchNear(nearNetwork)

  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watch, 0);

// TODO: handle amount
