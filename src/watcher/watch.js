const { watchNear, syncNear } = require("./nearLogs")
const { watchEth, syncEth } = require("./ethLogs");
const { sleep, getRangesFromNumbers, getLogger } = require("./utils/utils");
const syncConfig = require("../syncConfig.json")

const args = require('yargs').argv;
const network = args.network
const logger = getLogger(network)

const watch = async () => {
  try {
    logger.info("Start");

    let ethSyncRanges = []
    let nearSyncRanges = []

    ethSyncRanges = [...ethSyncRanges, ...getRangesFromNumbers(...syncConfig[network]["eth"]["numbers"])]
    ethSyncRanges = [...ethSyncRanges, ...syncConfig[network]["eth"]["ranges"]]

    nearSyncRanges = [...nearSyncRanges, ...getRangesFromNumbers(...syncConfig[network]["near"]["numbers"])]
    nearSyncRanges = [...nearSyncRanges, ...syncConfig[network]["near"]["ranges"]]

    await syncEth(...ethSyncRanges)
    await syncNear(...nearSyncRanges)

    await watchEth()
    await watchNear()
  } catch (err) {
    logger.error(`> Error in watch: ${err}`)
    console.log(`> Error in watch: ${err}`)
    console.log("Restarting in 5 minutes...")
    await sleep(1000 * 60 * 5)
    await watch()
  }
}

setTimeout(watch, 0);

// TODO: handle amount
// TODO: failure status after a periodic check