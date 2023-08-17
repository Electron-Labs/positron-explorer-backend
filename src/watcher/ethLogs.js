const Web3 = require('web3');
const { ethers } = require("ethers");
const { numberToHex } = require("./utils")
const { sleep } = require("./utils")
const { persistKeyValue, getKeyValue } = require("../db/utils")

const RPC_ENDPOINT_WS = "wss://eth-mainnet.g.alchemy.com/v2/wmGekVuyKiKzd42I0tkfFhXySiqnRxFs"
const MAX_BLOCK = "ETH_MAX_BLOCK"
const web3 = new Web3(RPC_ENDPOINT_WS)

const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const TRANSFER_EVENT = ethers.keccak256(ethers.toUtf8Bytes(
  'Transfer(address,address,uint256)'
));
const CONTRACT_ADDRESS = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"// "0xCF45a233FB21a77e67A0FC5d3E3987fa9cB59e83"
const CONTRACT_INIT_BLOCK_NUMBER = 17927728 // 8912798

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

const saveToDB = async (event) => {
  const contractAccount = event.address
  const txHash = event.transactionHash
  const txReceipt = await getTransactionReceipt(web3, txHash)
  const senderAddress = txReceipt.from
  const blockNumber = txReceipt.blockNumber
  const blockHash = txReceipt.blockHash

  // TODO: save to db
  // console.log("contractAccount", contractAccount)
  // console.log("txHash", txHash)
  // console.log("senderAddress", senderAddress)
  // console.log("blockHash", blockHash)
}

const saveMaxBlockNumber = async (event) => {
  const blockNumber = parseInt(event.blockNumber, 16)
  await persistKeyValue(MAX_BLOCK, blockNumber)
}

const watchEthLogs = async (client, fromBlock) => {
  console.log("watchEthLogs")

  const RPC_ENDPOINT = RPC_ENDPOINT_WS
  let logs_query = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_getLogs",
    "params": [{ "address": CONTRACT_ADDRESS, "topics": [TRANSFER_EVENT], "fromBlock": fromBlock }]
  }
  let query = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_subscribe",
    "params": ["logs", { "address": CONTRACT_ADDRESS, "topics": [TRANSFER_EVENT] }]
  }

  client.addEventListener("open", async () => {
    console.info(`past logs websocket connected to ${RPC_ENDPOINT}`);
    if (fromBlock) {
      // fromBlock = await db.getValueFromKey('LAST_BLOCK');
      console.info(`From block ${fromBlock}`);
      // logger.info(`From block ${fromBlock}`);
      fromBlock = numberToHex(fromBlock);
      logs_query.params[0].fromBlock = fromBlock;
      client.send(JSON.stringify(logs_query));
    }
    await sleep(1000);
    client.send(JSON.stringify(query));
  });

  client.addEventListener("message", async (event) => {
    let data = JSON.parse(event.data);
    if (data.params) event_result = data.params.result;
    else event_result = data.result;
    if (!(typeof event_result == "string")) {
      let maxBlockEvent;
      let processEventsPromises = []
      if (event_result instanceof Array) { // either array of past logs
        event_result.map((event) => processEventsPromises.push(saveToDB(event)))
        maxBlockEvent = event_result[event_result.length - 1]
      } else if (event_result instanceof Object) { // single txn
        maxBlockEvent = event_result
        processEventsPromises.push(saveToDB(event_result))
      } else {
        console.warn(`Websocket error event ${JSON.stringify(data)}`);
      }
      console.log("processEventsPromises")
      await Promise.allSettled(processEventsPromises)
      console.log("processEventsPromises done")
      await saveMaxBlockNumber(maxBlockEvent)
    }

  });
  client.addEventListener("close", async () => {
    console.warn(`past logs [websocket] Disconnected from ${RPC_ENDPOINT}`);
  });
}

const watchEth = async () => {
  let client = new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket })

  // let fromBlock = await getKeyValue(MAX_BLOCK);
  // fromBlock = fromBlock ? fromBlock : CONTRACT_INIT_BLOCK_NUMBER

  let fromBlock = 17925728

  console.log("fromBlock", fromBlock)

  await watchEthLogs(client, fromBlock)
}

module.exports = { watchEth }