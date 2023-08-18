const { ethers } = require("ethers");
const { Action } = require('@prisma/client')

const RPC_ENDPOINT_WS = "wss://eth-goerli.g.alchemy.com/v2/bPhT1o8ECrP--YN7FE-dbRH3XxMsgEyr"
// const RPC_ENDPOINT_WS = "https://eth-goerli.g.alchemy.com/v2/bPhT1o8ECrP--YN7FE-dbRH3XxMsgEyr"
const MAX_BLOCK = "ETH_MAX_BLOCK"


const EVENT_SIGNATURE = {
  [Action.Lock]: [
    {
      type: 'address',
      name: 'token',
      indexed: true
    },
    {
      type: 'address',
      name: 'sender',
      indexed: true
    },
    {
      type: 'uint256',
      name: 'amount',
      indexed: false
    },
    {
      type: 'string',
      name: 'accountId',
      indexed: false
    },
    {
      type: 'uint128',
      name: 'lockNonce',
      indexed: false
    },
    {
      type: 'bool',
      name: 'native',
      indexed: false
    },
  ],
  [Action.Unlock]: [
    {
      type: 'uint128',
      name: 'amount',
    },
    {
      type: 'address',
      name: 'recipient',
    },
    {
      type: 'uint128',
      name: 'unlockNonce',
    },
  ]
}

const LOCKED_EVENT = ethers.keccak256(ethers.toUtf8Bytes(
  'Locked(address,address,uint256,string,uint128,bool)'
));

const UNLOCKED_EVENT = ethers.keccak256(ethers.toUtf8Bytes(
  'Unlocked(uint128,address,uint128)'
));

const CONTRACT_ADDRESS = "0xCF45a233FB21a77e67A0FC5d3E3987fa9cB59e83"

const CONTRACT_INIT_BLOCK_NUMBER = 8912798

const eth_getLogs = (event, fromBlock, contractAddress) => {
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_getLogs",
    "params": [{ "address": contractAddress, "topics": [event], "fromBlock": fromBlock }]
  }
}

const eth_subscribe = (event, contractAddress) => {
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_subscribe",
    "params": ["logs", { "address": contractAddress, "topics": [event] }]
  }
}

module.exports = {
  RPC_ENDPOINT_WS,
  MAX_BLOCK,
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  CONTRACT_ADDRESS,
  CONTRACT_INIT_BLOCK_NUMBER,
  eth_getLogs,
  eth_subscribe
}