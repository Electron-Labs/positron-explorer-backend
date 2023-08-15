// const Web3 = require('web3');
const { ethers } = require("ethers");
const {numberToHex} = require("./utils")
const { sleep } = require("./utils")


const RPC_ENDPOINT_WS = "wss://eth-mainnet.g.alchemy.com/v2/wmGekVuyKiKzd42I0tkfFhXySiqnRxFs"
// const web3 = new Web3("https://eth-mainnet.g.alchemy.com/v2/wmGekVuyKiKzd42I0tkfFhXySiqnRxFs")
// const web3 = new Web3("wss://eth-mainnet.g.alchemy.com/v2/wmGekVuyKiKzd42I0tkfFhXySiqnRxFs")
// const abi = require("../abi/Uni.json")

const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const TRANSFER_EVENT = ethers.keccak256(ethers.toUtf8Bytes(
  'Transfer(address,address,uint256)'
));
const CONTRACT_ADDRESS = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"

const watchEth = async () => {
  let client = new ReconnectingWebSocket(RPC_ENDPOINT_WS, [], { WebSocket: WebSocket })
  let fromBlock = 17919233
  await watchEthLogs(client, fromBlock)
}



const watchEthLogs = async (client, fromBlock) => {
  console.log("watchEthLogs")

  let sequence = Promise.resolve();
  const RPC_ENDPOINT = RPC_ENDPOINT_WS
  let logs_query = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_getLogs",
    "params": [{"address": CONTRACT_ADDRESS, "topics": [TRANSFER_EVENT], "fromBlock": fromBlock}]
  }
  let query = {
    "jsonrpc": "2.0",
    "id": 1 ,
    "method": "eth_subscribe" ,
    "params": ["logs",{"address":CONTRACT_ADDRESS, "topics":[TRANSFER_EVENT]}]
  }

  client.addEventListener("open", async () => {
    console.info(`past logs websocket connected to ${RPC_ENDPOINT}`);
    if(fromBlock) {
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
  client.addEventListener("message", (event) => {
    let data = JSON.parse(event.data);
    console.log("data", data)

  });
  client.addEventListener("close", async () => {
    console.warn(`past logs [websocket] Disconnected from ${RPC_ENDPOINT}`);
  });

}

// const watchEthLogs = async () => {
//   console.log("watchEthLogs")
//   // console.log(web3.eth.getPastEvents)
//   const contract = new web3.eth.Contract(abi, "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984")
//   events = await contract.getPastEvents("Transfer", { fromBlock: "17915353", toBlock: "17915463" })
//   let event = events[0]
//   console.log("events", event)
// }

module.exports = { watchEth }