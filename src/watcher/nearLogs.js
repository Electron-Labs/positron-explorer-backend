const nearAPI = require('near-api-js');
const { sleep, getEmptyData, retry } = require("./utils/utils")
const { CONTRACT_ID, EVENT_JSON_KEY, currentCredentialsPath, createNearConnection } = require("./utils/nearUtils")
const { PrismaClient, Action, Status } = require('@prisma/client')
const prisma = new PrismaClient()

const network = process.argv[2].slice(2)

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
    const timestamp = block.header.timestamp_nanosec / 10 ** 9
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

    txDataResult.map((result) => {
      result.receipts_outcome.map((elm) => elm.outcome["timestamp"] = timestamp)
      result.receipts_outcome.map((elm) => elm.outcome["signerId"] = result.transaction.signer_id)
      result.receipts_outcome.map((elm) => elm.outcome["hash"] = result.transaction.hash)
      logs.push(result.receipts_outcome)
    })

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

const saveToDB = async (data) => {
  console.log('saving data from near...')
  const record = await prisma.eth_near.findUnique({
    where: {
      nonce_action: {
        nonce: data.nonce,
        action: data.action
      }
    }
  });
  let savedData
  if (!record) {
    data.status = Status.Pending
    savedData = await prisma.eth_near.create({ data: data })
    console.log('near created')
  }
  else {
    // don't update if a complete record already exists
    if (!Object.values(record).includes(null)) return

    const nonce = data.nonce
    const action = data.action
    delete data.nonce
    delete data.action
    data.status = Status.Completed

    await prisma.eth_near.update({
      where: {
        nonce_action: {
          nonce: nonce,
          action: action
        },
      },
      data: data,
    })
  }
  console.log('near updated')
}
const extractDataFromEvent = async (eventJson, txHash, timestamp, signerId) => {
  const datetime = new Date(timestamp * 1000);

  const data = getEmptyData()

  if (eventJson.event == "mint") {
    data.nonce = eventJson.nonce
    data.receiverAddress = eventJson.recipient.address
    data.destinationTx = txHash
    data.amount = eventJson.amount
    data.destinationTime = datetime
    data.action = Action.Lock
  } else if (eventJson.event == "burn") {
    data.nonce = eventJson.nonce
    data.receiverAddress = `0x${eventJson.recipient.address}`
    data.senderAddress = signerId
    data.sourceTx = txHash
    data.tokenAddressSource = `0x${eventJson.token.address}`
    data.amount = eventJson.amount
    data.sourceTime = datetime
    data.action = Action.Unlock
  }

  return data
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
        const data = await extractDataFromEvent(eventJson, txHashesArray[i][j], timestampsArray[i][j], signerIdsArray[i][j])
        if (data.nonce) await saveToDB(data)
      }
    }

    height += size
  } while (height <= toBlock);
}

const watchNearLogs = async (nearConnection, nearArchival, fromBlock, toBlock) => {
  await retry(getNearLogs, nearConnection, nearArchival, fromBlock, toBlock)
  await sleep(1000 * 3)

  const latestBlockHeight = await getLatestBlockHeight(nearConnection)
  await watchNearLogs(nearConnection, nearArchival, Math.min(toBlock + 1, latestBlockHeight), latestBlockHeight)
}

const syncNear = async (...ranges) => {
  let nearConnection = await createNearConnection(network, currentCredentialsPath, false);
  let nearArchival = await createNearConnection(network, currentCredentialsPath, true);

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    await getNearLogs(nearConnection, nearArchival, range.fromBlock, range.toBlock)
  }
}

const watchNear = async () => {
  let nearConnection = await createNearConnection(network, currentCredentialsPath, false);
  let nearArchival = await createNearConnection(network, currentCredentialsPath, true);

  const latestBlockHeight = await getLatestBlockHeight(nearConnection)

  console.log("watching near logs...")
  await watchNearLogs(nearConnection, nearArchival, latestBlockHeight, latestBlockHeight)
}

module.exports = { watchNear, syncNear }