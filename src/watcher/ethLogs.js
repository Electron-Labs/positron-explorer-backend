const Web3 = require('web3');
const { sleep, getEmptyData, getPrisma } = require("./utils/utils")
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


async function getTransactionReceipt(txHash) {
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
  try {
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
  } catch (err) {
    console.log("> Error in `saveToDB`")
    console.log(err)
  }
}

const extractDataFromEvent = async (event, action) => {
  const data = getEmptyData()

  try {
    let txHash
    let txReceipt
    let decodedLog

    if ("returnValues" in event) {
      txHash = event.transactionHash
      txReceipt = await getTransactionReceipt(txHash)
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
      txReceipt = await getTransactionReceipt(txHash)
    }

    const block = await web3.eth.getBlock(txReceipt.blockHash)
    const datetime = new Date(block.timestamp * 1000);

    if (action == Action.Lock) {
      data.nonce = decodedLog.lockNonce
      data.senderAddress = txReceipt.from
      data.sourceTx = txHash
      data.receiverAddress = decodedLog.accountId
      data.amount = decodedLog.amount
      data.tokenAddressSource = decodedLog.token
      data.sourceTime = datetime
    }
    else {
      data.nonce = decodedLog.unlockNonce
      data.receiverAddress = decodedLog.recipient
      data.destinationTx = txHash
      data.amount = decodedLog.amount
      data.destinationTime = datetime
    }

    data.action = action
  } catch (err) {
    console.log("> Error in `extractDataFromEvent`")
    console.log(err)
  }

  return data
}

const processEvent = async (event, action) => {
  try {
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
      const dataArray = await Promise.all(extractDataPromises)
      await saveToDB(dataArray)
    }
  } catch (err) {
    console.log("Error in `processEvent`")
    console.log(err)
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
      lockedEvents.map((event) => extractDataPromises.push(extractDataFromEvent(event, Action.Lock)))
      unlockedEvents.map((event) => extractDataPromises.push(extractDataFromEvent(event, Action.Unlock)))

      const dataArray = await Promise.all(extractDataPromises)

      await saveToDB(dataArray)
    } catch (err) {
      console.log("Error in `syncEthLogs` for range", ranges[i])
      console.log(err)
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

  client['lock'].addEventListener("message", async (event) => await processEvent(event, Action.Lock));
  client['unlock'].addEventListener("message", async (event) => await processEvent(event, Action.Unlock));

  client['lock'].addEventListener("close", async () => console.log(`past lock logs [websocket] Disconnected from ${RPC_ENDPOINT_WS}`));
  client['unlock'].addEventListener("close", async () => console.log(`past unlock logs [websocket] Disconnected from ${RPC_ENDPOINT_WS}`));
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
  console.log("syn eth...")
  await syncEthLogs(...ranges)
  console.log("syn eth finished")
}

module.exports = { watchEth, syncEth }