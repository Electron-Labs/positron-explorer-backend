const { ethers } = require("ethers");
const { Action } = require('@prisma/client')

const RPC_ENDPOINT_WS = "wss://eth-goerli.g.alchemy.com/v2/bPhT1o8ECrP--YN7FE-dbRH3XxMsgEyr"
const RPC_ENDPOINT_HTTP = "https://eth-goerli.g.alchemy.com/v2/bPhT1o8ECrP--YN7FE-dbRH3XxMsgEyr"

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

const LOCKED_EVENT_NAME = "Locked"
const UNLOCKED_EVENT_NAME = "Unlocked"

const CONTRACT_ADDRESS = "0xCF45a233FB21a77e67A0FC5d3E3987fa9cB59e83"

const CONTRACT_INIT_BLOCK_NUMBER = 8912798

const ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "accountId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "lockNonce",
        "type": "uint128"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "native",
        "type": "bool"
      }
    ],
    "name": "Locked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "amount",
        "type": "uint128"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "unlockNonce",
        "type": "uint128"
      }
    ],
    "name": "Unlocked",
    "type": "event"
  }
]

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
  RPC_ENDPOINT_HTTP,
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  LOCKED_EVENT_NAME,
  UNLOCKED_EVENT_NAME,
  CONTRACT_ADDRESS,
  CONTRACT_INIT_BLOCK_NUMBER,
  ABI,
  eth_subscribe
}