const nearAPI = require('near-api-js');
const { sleep, createNearConnection } = require("./utils")
const { PrismaClient, Action, Status } = require('@prisma/client')
const prisma = new PrismaClient()

const homedir = require("os").homedir();
const credentials_dir = ".near-credentials";
const currentCredentialsPath = require('path').join(homedir, credentials_dir);

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

const getLatestBlockHeight = async (nearConnection) => {
  const status = await nearConnection.connection.provider.status();
  return status.sync_info.latest_block_height
}

const saveToDB = async (eventJsonsArray, txHashesArray) => {
  for (let i = 0; i < eventJsonsArray.length; i++) {
    let eventJsons = eventJsonsArray[i]
    for (let j = 0; j < eventJsons.length; j++) {
      let eventJson = eventJsons[j]
      // TODO: destinationTime
      const nonce = eventJson.nonce
      if (eventJson.event == "mint") {
        const receiverAddress = eventJson.recipient.address
        const destinationTx = txHashesArray[i][j]
        const status = Status.Completed

        // TODO: what is record doesn't exist?
        // When to fail?
        const record = await prisma.eth_near.findUnique({
          where: {
            nonce_action: {
              nonce: nonce,
              action: Action.Lock
            }
          }
        });
        if (record) {
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
        }
      } else if (eventJson.event == "burn") {
        const senderAddress = eventJson.recipient.address
        const originTx = txHashesArray[i][j]
        const status = Status.Completed
        const tokenAddressOrigin = eventJson.token.address
        console.log("tokenAddressOrigin---", tokenAddressOrigin)
        const record = await prisma.eth_near.findUnique({
          where: {
            nonce_action: {
              nonce: nonce,
              action: Action.Unlock
            }
          }
        });
        if (record) {
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
}

const getNearLogs = async (nearConnection, nearArchival, fromBlock, toBlock) => {
  // TODO: ensure each valid block gets been scanned
  let BATCH_SIZE = 1000
  let size
  // TODO: check
  let height = fromBlock
  do {
    size = Math.min(BATCH_SIZE, toBlock - height + 1)
    let receiptsOutcomesPromisesForBlocks = []
    let blockNumbers = Array(size).fill().map((_, index) => index + height)
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
          if (logString.startsWith(EVENT_JSON_KEY)) {
            logStrings.push(logString)
            txHashesFlat.push(txHashes[i])
          }
        }
      }
      const eventJsons = logStrings.map((eventString) => JSON.parse(eventString.substring(eventString.indexOf(":") + 1)))
      eventJsonsArray.push(eventJsons)
      txHashesArray.push(txHashesFlat)
    }

    if (eventJsonsArray.length) {
      console.log('saving data from near...')
      await saveToDB(eventJsonsArray, txHashesArray)
      console.log('saved near data')
    }
    height += size
  } while (height <= toBlock);
}

const watchNearLogs = async (nearConnection, nearArchival, fromBlock, toBlock) => {
  await getNearLogs(nearConnection, nearArchival, fromBlock, toBlock)
  await sleep(1000 * 3)

  const latestBlockHeight = await getLatestBlockHeight(nearConnection)
  await watchNearLogs(nearConnection, nearArchival, Math.min(toBlock + 1, latestBlockHeight), latestBlockHeight)
}

const syncNear = async (network, ...ranges) => {
  let nearConnection = await createNearConnection(network, `https://rpc.${network}.near.org`, currentCredentialsPath);
  let nearArchival = await createNearConnection(network, `https://archival-rpc.testnet.near.org`, currentCredentialsPath);

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    await getNearLogs(nearConnection, nearArchival, range.fromBlock, range.toBlock)
  }
}

const watchNear = async (network) => {
  let nearConnection = await createNearConnection(network, `https://rpc.${network}.near.org`, currentCredentialsPath);
  let nearArchival = await createNearConnection(network, `https://archival-rpc.testnet.near.org`, currentCredentialsPath);

  const latestBlockHeight = await getLatestBlockHeight(nearConnection)

  console.log("watching near logs...")
  await watchNearLogs(nearConnection, nearArchival, latestBlockHeight, latestBlockHeight)
}

module.exports = { watchNear, syncNear }