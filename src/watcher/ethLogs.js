const Web3 = require('web3');
const { numberToHex, sleep, getEmptyData } = require("./utils")
const { PrismaClient, Action, Status } = require('@prisma/client')
const prisma = new PrismaClient()
const {
  RPC_ENDPOINT_WS,
  RPC_ENDPOINT_HTTP,
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  LOCKED_EVENT_NAME,
  UNLOCKED_EVENT_NAME,
  CONTRACT_ADDRESS,
  ABI,
  eth_subscribe
} = require("./ethUtils")

const web3 = new Web3(RPC_ENDPOINT_WS)

const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const RPC_ENDPOINT = RPC_ENDPOINT_WS


async function getTransactionReceipt(web3, txHash) {
  let receipt;
  while (!receipt) {
    try {
      receipt = await web3.eth.getTransactionReceipt(txHash);
    } catch (err) {
      logger.warn(`Error fetching receipt ${err}`);
      console.warn(`Error fetching receipt ${err}`);
      receipt = null;
      await sleep(1000);
    }
  }
  return receipt;
}

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
      // don't update if a complete record already exists
      if (!Object.values(record).includes(null)) return

      const nonce = data.nonce
      const action = data.action
      delete data.nonce
      delete data.action
      data.status = Status.Completed

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
    txReceipt = await getTransactionReceipt(web3, txHash)
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
    txReceipt = await getTransactionReceipt(web3, txHash)
  }

  const block = await web3.eth.getBlock(txReceipt.blockHash)
  const datetime = new Date(block.timestamp * 1000);

  if (action == Action.Lock) {
    // TODO: accountId for receiver address
    data.nonce = decodedLog.lockNonce
    data.senderAddress = txReceipt.from
    data.sourceTx = txHash
    data.amount = decodedLog.amount
    data.tokenAddressSource = decodedLog.token
    data.sourceTime = datetime
  }
  else {
    data.nonce = decodedLog.unlockNonce
    // data.receiverAddress = txReceipt.from
    data.destinationTx = txHash
    data.amount = decodedLog.amount
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
      result.map((logEvent) => extractDataPromises.push(extractDataFromEvent(logEvent, action)))
    } else if (result instanceof Object) { // single txn
      extractDataPromises.push(extractDataFromEvent(result, action))
    } else {
      console.warn(`Websocket error event ${JSON.stringify(data)}`);
    }
    // TODO: try?
    const dataArray = await Promise.all(extractDataPromises)
    await saveToDB(dataArray)
  }
}

const syncEthLogs = async (web3, ...ranges) => {
  const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS)
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    console.log("scanning eth block:", range)
    const lockedEvents = await contract.getPastEvents(LOCKED_EVENT_NAME, { fromBlock: range.fromBlock, toBlock: range.toBlock })
    const unlockedEvents = await contract.getPastEvents(UNLOCKED_EVENT_NAME, { fromBlock: range.fromBlock, toBlock: range.toBlock })

    let extractDataPromises = []
    lockedEvents.map((event) => extractDataPromises.push(extractDataFromEvent(event, Action.Lock)))
    unlockedEvents.map((event) => extractDataPromises.push(extractDataFromEvent(event, Action.Unlock)))

    const data = await Promise.all(extractDataPromises)

    await saveToDB(data)
  }
}

const watchEthLogs = async (client) => {
  client['lock'].addEventListener("open", async () => {
    client['lock'].send(JSON.stringify(eth_subscribe(LOCKED_EVENT, CONTRACT_ADDRESS)));
  });

  client['unlock'].addEventListener("open", async () => {
    client['unlock'].send(JSON.stringify(eth_subscribe(UNLOCKED_EVENT, CONTRACT_ADDRESS)));
  });

  client['lock'].addEventListener("message", async (event) => await processEvent(event, Action.Lock));
  client['unlock'].addEventListener("message", async (event) => await processEvent(event, Action.Unlock));

  client['lock'].addEventListener("close", async () => console.log(`past lock logs [websocket] Disconnected from ${RPC_ENDPOINT}`));
  client['unlock'].addEventListener("close", async () => console.log(`past unlock logs [websocket] Disconnected from ${RPC_ENDPOINT}`));
}

const watchEth = async () => {
  let client = {
    lock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket }),
    unlock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket })
  }

  console.log("wathing eth...")
  await watchEthLogs(client)
}

const syncEth = async (...ranges) => {
  const web3 = new Web3(RPC_ENDPOINT_HTTP)
  console.log("syn eth...")
  await syncEthLogs(web3, ...ranges)
  console.log("syn eth finished")
}

module.exports = { watchEth, syncEth }