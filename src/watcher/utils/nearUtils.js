const { keyStores, connect } = require('near-api-js');
const homedir = require("os").homedir();
const credentials_dir = ".near-credentials";
const currentCredentialsPath = require('path').join(homedir, credentials_dir);

const CONTRACT_ID = "zkbridge.admin_electronlabs.testnet"
const CONTRACT_INIT_BLOCK_HEIGHT = 125211125
const EVENT_JSON_KEY = "EVENT_JSON";

const RPC = {
  "testnet": {
    "primary": "https://rpc.testnet.near.org",
    "archival": "https://archival-rpc.testnet.near.org"
  },
  "mainnet": {
    "primary": "https://rpc.mainnet.near.org",
    "archival": "https://archival-rpc.mainnet.near.org"
  }
}

async function createNearConnection(network, credentialsPath, isArchival) {
  const type = isArchival ? "archival" : "primary"
  let keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath);
  let config = {
    keyStore,
    networkId: network,
    nodeUrl: RPC[network][type]
  }
  let near_connection = await connect(config);
  return near_connection;
}

module.exports = { CONTRACT_ID, CONTRACT_INIT_BLOCK_HEIGHT, EVENT_JSON_KEY, currentCredentialsPath, createNearConnection, RPC }