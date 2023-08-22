const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs")

const network = process.argv[2].slice(2)

const watch = async () => {
  let ethSyncRanges = []
  let nearSyncRanges = []

  if (network == "testnet") {
    ethSyncRanges = [{ fromBlock: 9555811, toBlock: 9555988 },]
    nearSyncRanges = [{ fromBlock: 135386914, toBlock: 135386914 }, { fromBlock: 135388715, toBlock: 135389716 }]
  } else if (network == "mainnet") {
    throw new Error('set contract address');
  }

  await syncEth(...ethSyncRanges)
  await syncNear(...nearSyncRanges)

  await watchEth()
  await watchNear()
}


setTimeout(watch, 0);

// TODO: handle amount
// TODO: failure status after a periodic check
