const Web3 = require('web3');
const { numberToHex } = require("./utils")
const { sleep } = require("./utils")
const { persistKeyValue, getKeyValue } = require("../db/utils")
const { PrismaClient, Action, Status } = require('@prisma/client')
const prisma = new PrismaClient()
const {
  RPC_ENDPOINT_WS,
  MAX_BLOCK,
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  CONTRACT_ADDRESS,
  CONTRACT_INIT_BLOCK_NUMBER,
  eth_getLogs,
  eth_subscribe
} = require("./constants")

const web3 = new Web3(RPC_ENDPOINT_WS)

const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');


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
  const decodedLog = web3.eth.abi.decodeLog(EVENT_SIGNATURE[action],
    event.data,
    event.topics.slice(1,)
  );
  const txHash = event.transactionHash
  const txReceipt = await getTransactionReceipt(web3, txHash)


  const block = await web3.eth.getBlock(txReceipt.blockHash)
  const datetime = new Date(block.timestamp * 1000);

  let nonce
  let senderAddress
  let receiverAddress
  let sourceTx
  let tokenAddressOrigin
  let destinationTx
  let originTime
  let destinationTime
  if (action == Action.Lock) {
    nonce = decodedLog.lockNonce
    senderAddress = txReceipt.from
    sourceTx = txHash
    tokenAddressOrigin = decodedLog.token
    originTime = datetime
  }
  else {
    nonce = decodedLog.unlockNonce
    receiverAddress = txReceipt.from
    destinationTx = txHash
    destinationTime = datetime
  }

  const amount = decodedLog.amount

  const status = Status.Pending

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

const saveMaxBlockNumber = async (event) => {
  const blockNumber = parseInt(event.blockNumber, 16)
  await persistKeyValue(MAX_BLOCK, blockNumber)
}

const processEvent = async (event, action) => {
  let data = JSON.parse(event.data);
  if (data.params) event_result = data.params.result;
  else event_result = data.result;
  if (!(typeof event_result == "string")) {
    let maxBlockEvent;
    let extractDataPromises = []
    if ((event_result instanceof Array) && (event_result.length != 0)) { // either array of past logs
      event_result.map((event) => extractDataPromises.push(extractDataFromEvent(event, action)))
      maxBlockEvent = event_result[event_result.length - 1]
    } else if (event_result instanceof Object) { // single txn
      maxBlockEvent = event_result
      extractDataPromises.push(extractDataFromEvent(event_result, action))
    } else {
      console.warn(`Websocket error event ${JSON.stringify(data)}`);
    }
    // TODO: try?
    const data = await Promise.all(extractDataPromises)
    await saveToDB(data)
    // TODO:
    // await saveMaxBlockNumber(maxBlockEvent)
  }
}

const watchEthLogs = async (client, fromBlock) => {
  console.log("watchEthLogs")

  const RPC_ENDPOINT = RPC_ENDPOINT_WS

  client['lock'].addEventListener("open", async () => {
    console.info(`past lock logs websocket connected to ${RPC_ENDPOINT}`);
    if (fromBlock) {
      // fromBlock = await db.getValueFromKey('LAST_BLOCK');
      console.info(`From block ${fromBlock}`);
      fromBlock = numberToHex(fromBlock);
      client['lock'].send(JSON.stringify(eth_getLogs(LOCKED_EVENT, fromBlock, CONTRACT_ADDRESS)));
    }
    await sleep(1000);
    client['lock'].send(JSON.stringify(eth_subscribe(LOCKED_EVENT, CONTRACT_ADDRESS)));
  });

  client['unlock'].addEventListener("open", async () => {
    console.info(`past unlock logs websocket connected to ${RPC_ENDPOINT}`);
    if (fromBlock) {
      // fromBlock = await db.getValueFromKey('LAST_BLOCK');
      console.info(`From block ${fromBlock}`);
      fromBlock = numberToHex(fromBlock);
      client['unlock'].send(JSON.stringify(eth_getLogs(UNLOCKED_EVENT, fromBlock, CONTRACT_ADDRESS)));
    }
    await sleep(1000);
    client['unlock'].send(JSON.stringify(eth_subscribe(UNLOCKED_EVENT, CONTRACT_ADDRESS)));
  });

  client['lock'].addEventListener("message", async (event) => await processEvent(event, Action.Lock));
  client['unlock'].addEventListener("message", async (event) => await processEvent(event, Action.Unlock));

  client['lock'].addEventListener("close", async () => console.warn(`past lock logs [websocket] Disconnected from ${RPC_ENDPOINT}`));
  client['unlock'].addEventListener("close", async () => console.warn(`past unlock logs [websocket] Disconnected from ${RPC_ENDPOINT}`));
}

const watchEth = async () => {
  let client = {
    lock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket }),
    unlock: new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket })
  }

  // let fromBlock = await getKeyValue(MAX_BLOCK);
  // fromBlock = fromBlock ? fromBlock : CONTRACT_INIT_BLOCK_NUMBER

  let fromBlock = 9520416

  console.log("fromBlock", fromBlock)

  await watchEthLogs(client, fromBlock)
}

module.exports = { watchEth }