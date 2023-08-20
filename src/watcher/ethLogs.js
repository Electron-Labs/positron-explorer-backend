const Web3 = require('web3');
const { numberToHex } = require("./utils")
const { sleep } = require("./utils")
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
} = require("./ethConstants")

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

const saveToDB = async (data) => {
  console.log('saving data from eth...')
  const savedData = await prisma.eth_near.createMany({ data: data, skipDuplicates: true })
  console.log('saved eth data', savedData)
}

const extractDataFromEvent = async (event, action) => {
  let nonce
  let originTime
  let destinationTime
  let senderAddress
  let receiverAddress
  let sourceTx
  let destinationTx
  let amount
  let tokenAddressOrigin
  let status

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
    nonce = decodedLog.lockNonce
    senderAddress = txReceipt.from
    sourceTx = txHash
    amount = decodedLog.amount
    tokenAddressOrigin = decodedLog.token
    originTime = datetime
  }
  else {
    nonce = decodedLog.unlockNonce
    receiverAddress = txReceipt.from
    destinationTx = txHash
    amount = decodedLog.amount
    destinationTime = datetime
  }

  status = Status.Pending

  const data = {
    nonce: nonce,
    originTime: originTime,
    destinationTime: destinationTime,
    action: action,
    senderAddress: senderAddress,
    receiverAddress: receiverAddress,
    sourceTx: sourceTx,
    destinationTx: destinationTx,
    amount: amount,
    status: status
  }

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
    const data = await Promise.all(extractDataPromises)
    await saveToDB(data)
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