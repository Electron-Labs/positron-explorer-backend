const { ethers } = require("ethers");
const { Action } = require('@prisma/client')

const CONTRACT_ADDRESS = {
  "testnet": "0xCF45a233FB21a77e67A0FC5d3E3987fa9cB59e83",
  "mainnet": "0x36E3d7a3Fa4D8B87151A864F2e2C47429541e170"
}

const TOKEN_ADDRESS = {
  "testnet": "0xc5bbac81754d2ccfdde030f6aea05d881752f2f8",
  "mainnet": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
}

const RPC = {
  "testnet": {
    "http": process.env.ETH_RPC_ENDPOINT_HTTP_TESTNET,
    "ws": process.env.ETH_RPC_ENDPOINT_WS_TESTNET
  },
  "mainnet": {
    "http": process.env.ETH_RPC_ENDPOINT_HTTP_MAINNET,
    "ws": process.env.ETH_RPC_ENDPOINT_WS_MAINNET
  }
}

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
  EVENT_SIGNATURE,
  LOCKED_EVENT,
  UNLOCKED_EVENT,
  LOCKED_EVENT_NAME,
  UNLOCKED_EVENT_NAME,
  CONTRACT_ADDRESS,
  TOKEN_ADDRESS,
  CONTRACT_INIT_BLOCK_NUMBER,
  ABI,
  eth_subscribe,
  RPC
}