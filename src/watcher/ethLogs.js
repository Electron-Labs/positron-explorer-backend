const Web3 = require('web3');
const { sleep, getEmptyData, getPrisma, getLogger, retry } = require("./utils/utils")
const { Action, Status } = require('@prisma/client')
const ReconnectingWebSocket = require('reconnecting-websocket');
const {
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  LOCKED_EVENT_NAME,
  UNLOCKED_EVENT_NAME,
  CONTRACT_ADDRESS,
  ABI,
  eth_subscribe,
  RPC
} = require("./utils/ethUtils")
const WebSocket = require('ws');

const args = require('yargs').argv;
const network = args.network
const contractAddress = CONTRACT_ADDRESS[network]
const RPC_ENDPOINT_WS = RPC[network]["ws"]
const RPC_ENDPOINT_HTTP = RPC[network]["http"]
const web3 = new Web3(RPC_ENDPOINT_HTTP)
const prisma = getPrisma(network)
const logger = getLogger(network)

const saveToDB = async (dataArray) => {
  const newRecords = []

  for (let i = 0; i < dataArray.length; i++) {
    const data = dataArray[i]
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
      newRecords.push(data)
    }
    else {
      // if a complete record already exists: don't update db; else: update db
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
      console.log("eth updated")

      // TODO: check and commit properly
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

  if (newRecords.length) {
    const created = await prisma.eth_near.createMany({ data: newRecords, skipDuplicates: true })
    console.log(`eth created`)
  }
}

const extractDataFromEvent = async (event, action) => {
  const data = getEmptyData()

  let txHash
  let txReceipt
  let decodedLog

  if ("returnValues" in event) {
    txHash = event.transactionHash
    txReceipt = await web3.eth.getTransactionReceipt(txHash)
    decodedLog = web3.eth.abi.decodeLog(EVENT_SIGNATURE[action],
      event.raw.data,
      event.raw.topics.slice(1,)
    )
  } else {
    decodedLog = web3.eth.abi.decodeLog(EVENT_SIGNATURE[action],
      event.data,
      event.topics.slice(1,)
    );
    txHash = event.transactionHash
    txReceipt = await web3.eth.getTransactionReceipt(txHash)
  }

  const block = await web3.eth.getBlock(txReceipt.blockHash)
  const datetime = new Date(block.timestamp * 1000);

  if (action == Action.Lock) {
    data.nonce = decodedLog.lockNonce
    data.senderAddress = txReceipt.from
    data.sourceTx = txHash
    data.receiverAddress = decodedLog.accountId
    data.sourceAmount = decodedLog.amount
    data.tokenAddressSource = decodedLog.token
    data.sourceTime = datetime
  }
  else {
    data.nonce = decodedLog.unlockNonce
    data.receiverAddress = decodedLog.recipient
    data.destinationTx = txHash
    data.destinationAmount = decodedLog.amount
    data.destinationTime = datetime
  }

  data.action = action

  return data
}

const processEvent = async (event, action) => {
  let data = JSON.parse(event.data);
  if (data.params) result = data.params.result;
  else result = data.result;
  if (!(typeof result == "string")) {
    let extractDataPromises = []
    if ((result instanceof Array) && (result.length != 0)) { // either array of past logs
      result.map((logEvent) => extractDataPromises.push(retry(extractDataFromEvent, logEvent, action)))
    } else if (result instanceof Object) { // single txn
      extractDataPromises.push(retry(extractDataFromEvent, result, action))
    } else {
      console.log(`Websocket error event ${JSON.stringify(data)}`);
    }
    const dataArray = await Promise.all(extractDataPromises)
    await saveToDB(dataArray)
  }
}

const syncEthLogs = async (...ranges) => {
  const contract = new web3.eth.Contract(ABI, contractAddress)
  for (let i = 0; i < ranges.length; i++) {
    try {
      const range = ranges[i]
      console.log("scanning eth block:", range)
      const lockedEvents = await contract.getPastEvents(LOCKED_EVENT_NAME, { fromBlock: range.fromBlock, toBlock: range.toBlock })
      const unlockedEvents = await contract.getPastEvents(UNLOCKED_EVENT_NAME, { fromBlock: range.fromBlock, toBlock: range.toBlock })

      let extractDataPromises = []
      lockedEvents.map((event) => extractDataPromises.push(retry(extractDataFromEvent, event, Action.Lock)))
      unlockedEvents.map((event) => extractDataPromises.push(retry(extractDataFromEvent, event, Action.Unlock)))

      const dataArray = await Promise.all(extractDataPromises)

      await saveToDB(dataArray)
      if (Math.floor(i / 80) == 0) await sleep(1000)
    } catch (err) {
      // TODO: added new
      console.log("Error scanning eth block:", ranges[i])
      console.log("Trying again in 60 seconds...")
      await sleep(1000 * 60)
      i -= 1
      continue
    }
  }
}

const watchEthLogs = async (client) => {
  client['lock'].addEventListener("open", async () => {
    client['lock'].send(JSON.stringify(eth_subscribe(LOCKED_EVENT, contractAddress)));
  });

  client['unlock'].addEventListener("open", async () => {
    client['unlock'].send(JSON.stringify(eth_subscribe(UNLOCKED_EVENT, contractAddress)));
  });

  client['lock'].addEventListener("message", async (event) => {
    try {
      await processEvent(event, Action.Lock)
    } catch (err) {
      logger.warn(`> Error in watchEthLogs::lock::message ${err}`)
      console.log(`> Error in watchEthLogs::lock::message ${err}`)
      console.log("Trying again...")
      await sleep(1000 * 5)
      await processEvent(event, Action.Lock)
    }
  });
  client['unlock'].addEventListener("message", async (event) => {
    try {
      await processEvent(event, Action.Unlock)
    } catch (err) {
      logger.warn(`> Error in watchEthLogs::unlock::message ${err}`)
      console.log(`> Error in watchEthLogs::unlock::message ${err}`)
      console.log("Trying again...")
      await sleep(1000 * 5)
      await processEvent(event, Action.Unlock)
    }
  });

  client['lock'].addEventListener("close", async () => console.log(`past lock logs [websocket] Disconnected from ${RPC_ENDPOINT_WS}`));
  client['unlock'].addEventListener("close", async () => console.log(`past unlock logs [websocket] Disconnected from ${RPC_ENDPOINT_WS}`));
}

const watchEth = async () => {
  try {
    let client = {
      lock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket }),
      unlock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket })
    }

    console.log("wathing eth...")
    await watchEthLogs(client)
  } catch (err) {
    console.log(`> Error in watchEth ${err}`)
    logger.warn(`> Error in watchEth ${err}`)
    console.log("Trying again in 60 seconds...")
    await sleep(1000 * 60)
    await watchEth()
  }
}

const syncEth = async (...ranges) => {
  console.log("syn eth...")
  try {
    await syncEthLogs(...ranges)
  } catch (err) {
    logger.warn(`> Error in syncEth ${err}`)
    console.log(`> Error in syncEth ${err}`)
    console.log("Trying again in 60 seconds...")
    await sleep(1000 * 60)
    await syncEth(...ranges)
  }
  console.log("syn eth finished")
}

module.exports = { watchEth, syncEth }