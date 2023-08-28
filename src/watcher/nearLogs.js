const nearAPI = require('near-api-js');
const { sleep, getEmptyData, retry, getPrisma, getLogger } = require("./utils/utils")
const { CONTRACT_ID, EVENT_JSON_KEY, currentCredentialsPath, createNearConnection } = require("./utils/nearUtils")
const { Action, Status } = require('@prisma/client')

const args = require('yargs').argv;
const network = args.network
const contractId = CONTRACT_ID[network]
const prisma = getPrisma(network)
const logger = getLogger(network)

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
      if (e2.message.toLowerCase().includes("db not found")) return block
      throw e2
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
  let block = await retry(getBlock, nearConnection, nearArchival, blockHeight);
  if (block) {
    const timestamp = block.header.timestamp_nanosec / 10 ** 9
    let chunks = block.chunks.filter((chunk) => chunk.height_included == block.header.height);
    if (chunks.length == 0) return logs

    const chunkHashes = chunks.map((chunk) => chunk.chunk_hash);

    let chunkDetailsPromises = []
    chunkHashes.map(chunkHash => chunkDetailsPromises.push(retry(getChunk, nearConnection, nearArchival, chunkHash)))
    let chunkDetails = await Promise.all(chunkDetailsPromises)

    let transactions = chunkDetails.flatMap((chunkDetail) => (chunkDetail.transactions || []).filter((transaction) => {
      if (transaction.receiver_id == contractId) return true;
      return false;
    }));
    if (transactions.length == 0) return logs

    let txDataPromises = []
    transactions.map((transaction) => {
      txDataPromises.push(retry(getTxData, nearConnection, nearArchival, transaction.hash, contractId))
    })
    const txDataResult = await Promise.all(txDataPromises)

    txDataResult.map((result) => {
      result.receipts_outcome.map((elm) => elm.outcome["timestamp"] = timestamp)
      result.receipts_outcome.map((elm) => elm.outcome["signerId"] = result.transaction.signer_id)
      result.receipts_outcome.map((elm) => elm.outcome["hash"] = result.transaction.hash)
      logs.push(result.receipts_outcome)
    })

    return logs
  }
  return logs
}

const getLatestBlockHeight = async (nearConnection) => {
  const status = await nearConnection.connection.provider.status();
  return status.sync_info.latest_block_height
}

const saveToDB = async (data) => {
  const record = await prisma.eth_near.findUnique({
    where: {
      nonce_action: {
        nonce: data.nonce,
        action: data.action
      }
    }
  });
  if (!record) {
    data.status = Status.Pending
    const savedData = await prisma.eth_near.create({ data: data })
    console.log('near created')
  }
  else {
    // don't update if a complete record already exists
    if (!Object.values(record).includes(null)) return

    const nonce = data.nonce
    const action = data.action
    delete data.nonce
    delete data.action

    const updated = await prisma.eth_near.update({
      where: {
        nonce_action: {
          nonce: nonce,
          action: action
        },
      },
      data: data,
    })
    console.log('near updated')

    delete updated.status
    if (!Object.values(updated).includes(null)) {
      await prisma.eth_near.update({
        where: {
          nonce_action: {
            nonce: nonce,
            action: action
          },
        },
        data: { status: Status.Completed },
      })
    }
  }
}

const extractDataFromEvent = (eventJson, txHash, timestamp, signerId) => {
  const data = getEmptyData()

  const datetime = new Date(timestamp * 1000);

  if (eventJson.event == "mint") {
    data.nonce = eventJson.nonce
    data.receiverAddress = eventJson.recipient.address
    data.destinationTx = txHash
    data.destinationAmount = eventJson.amount
    data.destinationTime = datetime
    data.action = Action.Lock
  } else if (eventJson.event == "burn") {
    data.nonce = eventJson.nonce
    data.receiverAddress = `0x${eventJson.recipient.address}`
    data.senderAddress = signerId
    data.sourceTx = txHash
    data.tokenAddressSource = `0x${eventJson.token.address}`
    data.sourceAmount = eventJson.amount
    data.sourceTime = datetime
    data.action = Action.Unlock
  }

  return data
}

const getNearLogs = async (nearConnection, nearArchival, fromBlock, toBlock) => {
  let BATCH_SIZE = 1000
  let size
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
    const timestampsArray = []
    const signerIdsArray = []

    for (let receipt_idx = 0; receipt_idx < receiptsOutcomes.length; receipt_idx++) {
      const logsStrings = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.outcome.logs)
      const txHashes = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.outcome.hash)
      const timestamps = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.outcome.timestamp)
      const signerIds = receiptsOutcomes[receipt_idx].map((receiptsOutcome) => receiptsOutcome.outcome.signerId)
      let logStrings = []
      let txHashesFlat = []
      let timestampsFlat = []
      let signerIdsFlat = []
      for (let i = 0; i < logsStrings.length; i++) {
        for (let j = 0; j < logsStrings[i].length; j++) {
          const logString = logsStrings[i][j]
          if (logString.startsWith(EVENT_JSON_KEY)) {
            logStrings.push(logString)
            txHashesFlat.push(txHashes[i])
            timestampsFlat.push(timestamps[i])
            signerIdsFlat.push(signerIds[i])
          }
        }
      }
      const eventJsons = logStrings.map((eventString) => JSON.parse(eventString.substring(eventString.indexOf(":") + 1)))
      eventJsonsArray.push(eventJsons)
      txHashesArray.push(txHashesFlat)
      timestampsArray.push(timestampsFlat)
      signerIdsArray.push(signerIdsFlat)
    }


    for (let i = 0; i < eventJsonsArray.length; i++) {
      let eventJsons = eventJsonsArray[i]
      for (let j = 0; j < eventJsons.length; j++) {
        let eventJson = eventJsons[j]
        const data = extractDataFromEvent(eventJson, txHashesArray[i][j], timestampsArray[i][j], signerIdsArray[i][j])
        if (data.nonce) await saveToDB(data)
      }
    }

    height += size
  } while (height <= toBlock);
}

const watchNearLogs = async (nearConnection, nearArchival, fromBlock, toBlock) => {
  try {
    await retry(getNearLogs, nearConnection, nearArchival, fromBlock, toBlock)
    await sleep(1000 * 5)
  } catch (err) {
    logger.warn(`> Error in watchNearLogs: ${err}`)
    console.log(`> Error in watchNearLogs: ${err}`)
    console.log("Trying again in 60 seconds...")
    await sleep(1000 * 60)
    await watchNearLogs(nearConnection, nearArchival, fromBlock, toBlock)
  }

  const latestBlockHeight = await retry(getLatestBlockHeight, nearConnection)
  await watchNearLogs(nearConnection, nearArchival, Math.min(toBlock + 1, latestBlockHeight), latestBlockHeight)
}

const syncNear = async (...ranges) => {
  try {
    let nearConnection = await createNearConnection(network, currentCredentialsPath, false);
    let nearArchival = await createNearConnection(network, currentCredentialsPath, true);

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      await retry(getNearLogs, nearConnection, nearArchival, range.fromBlock, range.toBlock)
      // TODO: fine?
      if (Math.floor(i / 80) == 0) await sleep(1000)
    }
  } catch (err) {
    logger.warn(`> Error in syncNear: ${err}`)
    console.log(`> Error in syncNear: ${err}`)
    console.log("Trying again in 60 seconds...")
    await sleep(1000 * 60)
    await syncNear(...ranges)
  }
}

const watchNear = async () => {
  let nearConnection = await createNearConnection(network, currentCredentialsPath, false);
  let nearArchival = await createNearConnection(network, currentCredentialsPath, true);

  const latestBlockHeight = await retry(getLatestBlockHeight, nearConnection)

  console.log("watching near logs...")
  await watchNearLogs(nearConnection, nearArchival, latestBlockHeight, latestBlockHeight)
}

module.exports = { watchNear, syncNear }