const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs")

const watch = async () => {
  const nearNetwork = "testnet"

  // TODO: don't sync if already done
  await syncEth({ fromBlock: 9552038, toBlock: 9552038 }, { fromBlock: 9555811, toBlock: 9555811 })
  await syncNear(nearNetwork, { fromBlock: 135348864, toBlock: 135348864 }, { fromBlock: 135386914, toBlock: 135386914 })

  await watchEth()
  await watchNear(nearNetwork)
}


setTimeout(watch, 0);

// TODO: handle amount
// TODO: failure status after a periodic check
