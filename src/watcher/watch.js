const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs");
const { sleep } = require("./utils/utils");

const args = require('yargs').argv;
const network = args.network

const watch = async () => {
  try {
    let ethSyncRanges = []
    let nearSyncRanges = []

    if (network == "testnet") {
      ethSyncRanges = [{ fromBlock: 9555811, toBlock: 9555988 },]
      nearSyncRanges = [{ fromBlock: 135386914, toBlock: 135386914 }, { fromBlock: 135388715, toBlock: 135389716 }]
    } else if (network == "mainnet") {
      ethSyncRanges = [{ fromBlock: 17897304, toBlock: 17897304 },]
      nearSyncRanges = [{ fromBlock: 98656629, toBlock: 98656629 },]
    }

    await syncEth(...ethSyncRanges)
    await syncNear(...nearSyncRanges)

    await watchEth()
    await watchNear()
  } catch (err) {
    console.log("> Error in `watch`")
    console.log(err)
    console.log("Restarting in 5 minutes...")
    await sleep(1000 * 60 * 5)
    await watch()
  }
}


setTimeout(watch, 0);

// TODO: handle amount
// TODO: failure status after a periodic check
