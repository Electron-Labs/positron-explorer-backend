const nearAPI = require('near-api-js');
const { sleep, createNearConnection } = require("./utils")
const { persistKeyValue, getKeyValue } = require("../db/utils")
const { PrismaClient, Action, Status } = require('@prisma/client')
const prisma = new PrismaClient()

const homedir = require("os").homedir();
const credentials_dir = ".near-credentials";
const currentCredentialsPath = require('path').join(homedir, credentials_dir);

const MAX_BLOCK = "NEAR_MAX_BLOCK"
const CONTRACT_ID = "zkbridge.admin_electronlabs.testnet"
const CONTRACT_INIT_BLOCK_HEIGHT = 125211125
const EVENT_JSON_KEY = "EVENT_JSON";

async function retry(fn, ...args) {
  let r, e;
  for (let i = 0; i < 5; i++) {
    try {
      r = await fn(...args);
      return r;
    } catch (err) {
      e = err;
      await sleep(1000);
    }
  }
  throw e;
}


async function getBlock(near, nearArchival, height) {
  let block;
  try {
    block = await near.connection.provider.block({
      blockId: height
    })
  } catch (e1) {
    try {
      block = await nearArchival.connection.provider.block({
        blockId: height
      })
    } catch (e2) {
      // console.log("Error in nearArchival `getBlock`", e2)
    }
  }
  return block;
}

async function getChunk(near, nearArchival, hash) {
  let chunk;
  try {
    chunk = await near.connection.provider.chunk(hash);
  } catch (e) {
    chunk = await nearArchival.connection.provider.chunk(hash);
  }
  return chunk;
}

const saveMaxBlockNumber = async (blockNumber) => {
  await persistKeyValue(MAX_BLOCK, blockNumber)
}

async function getTxData(near, nearArchival, txHash, accountId) {
  let decodedTxHash = nearAPI.utils.serialize.base_decode(txHash);
  let txData;
  try {
    txData = await near.connection.provider.txStatus(
      decodedTxHash,
      accountId
    );
  } catch {
    txData = await nearArchival.connection.provider.txStatus(
      decodedTxHash,
      accountId
    );
  }
  return txData;
}

const getReceiptsOutcome = async (nearConnection, nearArchival, blockHeight) => {
  var logs = []
  // TODO: retry?
  let block = await getBlock(nearConnection, nearArchival, blockHeight);
  if (block) {
    // try {
    let chunks = block.chunks.filter((chunk) => chunk.height_included == block.header.height);
    if (chunks.length == 0) return logs

    const chunkHashes = chunks.map((chunk) => chunk.chunk_hash);

    let chunkDetailsPromises = []
    chunkHashes.map(chunkHash => chunkDetailsPromises.push(retry(getChunk, nearConnection, nearArchival, chunkHash)))
    let chunkDetails = await Promise.all(chunkDetailsPromises)

    let transactions = chunkDetails.flatMap((chunkDetail) => (chunkDetail.transactions || []).filter((transaction) => {
      if (transaction.receiver_id == CONTRACT_ID) return true;
      return false;
    }));
    if (transactions.length == 0) return logs

    let txDataPromises = []
    transactions.map((transaction) => {
      txDataPromises.push(retry(getTxData, nearConnection, nearArchival, transaction.hash, CONTRACT_ID))
    })
    const txDataResult = await Promise.all(txDataPromises)

    txDataResult.map((result) => logs.push(result.receipts_outcome))

    return logs
    // } catch (err) {
    //   console.log("> Error in `getReceiptsOutcome`")
    //   console.log(err)
    //   return logs
    // }
  }
  return logs
}

const parseEventString = (eventString) => {
  let json = {}
  if (eventString.startsWith(EVENT_JSON_KEY)) json = JSON.parse(eventString.substring(eventString.indexOf(":") + 1))
  return json
}

const saveToDB = async (eventJsonsArray, txHashesArray) => {
  for (let i = 0; i < eventJsonsArray.length; i++) {
    let eventJsons = eventJsonsArray[i]
    for (let j = 0; j < eventJsons.length; j++) {
      let eventJson = eventJsons[j]
      // TODO: skip if empty eventJson
      // TODO: destinationTime
      const nonce = eventJson.nonce
      if (eventJson.event == "mint") {
        const receiverAddress = eventJson.recipient.address
        const destinationTx = txHashesArray[i][j]
        const status = Status.Completed

        // TODO: update only if it exists
        console.log("destinationTx", destinationTx)
        const updateFromNear = await prisma.eth_near.update({
          where: {
            nonce_action: {
              nonce: nonce,
              action: Action.Lock
            },
          },
          data: {
            receiverAddress: receiverAddress,
            destinationTx: destinationTx,
            status: status
          },
        })
        console.log(updateFromNear)
      } else if (eventJson.event == "burn") {
        const senderAddress = eventJson.recipient.address
        const originTx = txHashesArray[i][j]
        const status = Status.Completed
        const tokenAddressOrigin = eventJson.token.address
        console.log("tokenAddressOrigin---", tokenAddressOrigin)
        const updateFromNear = await prisma.eth_near.update({
          where: {
            nonce_action: {
              nonce: nonce,
              action: Action.Unlock
            },
          },
          data: {
            senderAddress: senderAddress,
            originTx: originTx,
            tokenAddressOrigin: tokenAddressOrigin,
            status: status
          },
        })
        console.log(updateFromNear)
      }
    }
  }
}

const watchNearLogs = async (nearConnection, nearArchival) => {
  let fromBlockHeight = await getKeyValue(MAX_BLOCK);
  fromBlockHeight = fromBlockHeight ? fromBlockHeight : CONTRACT_INIT_BLOCK_HEIGHT
  const status = await nearConnection.connection.provider.status();
  const latestBlockHeight = status.sync_info.latest_block_height

  // TODO: ensure each valid block gets been scanned
  let MAX_NUM_BLOCKS = 1000
  let size
  // TODO: use latestBlockHeight
  for (let height = 134933108; height < latestBlockHeight; height += size) {
    size = Math.min(MAX_NUM_BLOCKS, latestBlockHeight - height)
    let receiptsOutcomesPromisesForBlocks = []
    let blockNumbers = Array(size).fill().map((element, index) => index + height)
    console.log(`Scanning block range [${blockNumbers[0]}:${blockNumbers[blockNumbers.length - 1]}]`)
    blockNumbers.map((blockNumber) => receiptsOutcomesPromisesForBlocks.push(
      retry(getReceiptsOutcome, nearConnection, nearArchival, blockNumber))
    )
    const receiptsOutcomes = (await Promise.all(receiptsOutcomesPromisesForBlocks)).flatMap((receiptsOutcomes_) => receiptsOutcomes_)
    const eventJsonsArray = []
    const txHashesArray = []

    for (let receipt_idx = 0; receipt_idx < receiptsOutcomes.length; receipt_idx++) {
      const logsStrings = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.outcome.logs)
      const txHashes = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.id)
      let logStrings = []
      let txHashesFlat = []
      for (let i = 0; i < logsStrings.length; i++) {
        for (let j = 0; j < logsStrings[i].length; j++) {
          const logString = logsStrings[i][j]
          console.log("logString", logString)
          console.log("logString", typeof logString)
          if (logString.startsWith(EVENT_JSON_KEY)) {
            logStrings.push(logString)
            txHashesFlat.push(txHashes[i])
          }
        }
        // logStrings = [...logStrings, ...logsStrings[i]]
        // txHashesFlat = [...txHashesFlat, ...Array(logsStrings[i].length).fill(txHashes[i])]
      }
      // TODO: use parse
      const eventJsons = logStrings.map((eventString) => JSON.parse(eventString.substring(eventString.indexOf(":") + 1)))
      eventJsonsArray.push(eventJsons)
      txHashesArray.push(txHashesFlat)
    }

    if (eventJsonsArray.length) {
      console.log('saving data from near...')
      await saveToDB(eventJsonsArray, txHashesArray)
      console.log('saved near data')
    }
    // await saveMaxBlockNumber(blockNumbers[blockNumbers.length - 1])
  }
  // setInterval(watchLogs, 2 * 1000);
}

const watchNear = async () => {
  network = "testnet"
  let nearConnection = await createNearConnection(network, `https://rpc.${network}.near.org`, currentCredentialsPath);
  let nearArchival = await createNearConnection(network, `https://archival-rpc.testnet.near.org`, currentCredentialsPath);

  await watchNearLogs(nearConnection, nearArchival)
}

module.exports = { watchNear }