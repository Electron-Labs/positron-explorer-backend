const nearAPI = require('near-api-js');
const { sleep, createNearConnection } = require("./utils")

const homedir = require("os").homedir();
const credentials_dir = ".near-credentials";
const currentCredentialsPath = require('path').join(homedir, credentials_dir);

async function retry(fn, ...args) {
  let r, e;
  for (let i = 0; i < 5; i++) {
    try {
      r = await fn(...args);
      return r;
    } catch (err) {
      e = err;
      await sleep(1000);
    }
  }
  throw e;
}


async function getBlock(near, nearArchival, height) {
  let block;
  try {
    block = await near.connection.provider.block({
      blockId: height
    })
  } catch (e) {
    block = await nearArchival.connection.provider.block({
      blockId: height
    })
  }
  return block;
}

async function getChunk(near, nearArchival, hash) {
  let chunk;
  try {
    chunk = await near.connection.provider.chunk(hash);
  } catch (e) {
    chunk = await nearArchival.connection.provider.chunk(hash);
  }
  return chunk;
}

async function extractTransactions(
  startBlock, endBlock, contractAccountId, near, nearArchival
) {
  // creates an array of block hashes for given range
  // let blockArr = [];
  let blockHash = endBlock;
  let transactions = [];
  let nearNode = near;
  do {
    try {
      let currentBlock = await retry(getBlock, near, nearArchival, blockHash);
      console.debug("Going through blockHash", blockHash, currentBlock.header.height);
      // logger.debug(`Going through blockHash, ${blockHash}, ${currentBlock.header.height}`);
      let chunks = currentBlock.chunks.filter((chunk) => chunk.height_included == currentBlock.header.height);
      chunks = chunks.map(({ chunk_hash }) => chunk_hash);
      let chunkDetails = await Promise.all(
        // chunks.map(chunk => nearNode.connection.provider.chunk(chunk))
        chunks.map(chunk => retry(getChunk, near, nearArchival, chunk))
      );
      let transactions_tmp = chunkDetails.flatMap((chunk) => (chunk.transactions || []).filter((tx) => {
        if (tx.receiver_id === contractAccountId) {
          // logger.debug(`txHash ${tx.hash}`);
          return true;
        }
        return false;
      }));
      if (transactions_tmp.length != 0) {
        console.debug(`Transactions found in block ${currentBlock.header.hash}`);
        // logger.debug(`Transactions found in block ${currentBlock.header.hash}`);
      }
      transactions_tmp.reverse();
      transactions = transactions.concat(transactions_tmp);
      blockHash = currentBlock.header.prev_hash;
      console.log("prev blockHash", blockHash)
    } catch (err) {
      console.warn(`extractTransactions ${err}, sleeping for 30 seconds`);
      // logger.warn(`extractTransactions ${err}, sleeping for 30 seconds`);
      await sleep(30 * 1000);
    }
  } while (blockHash !== startBlock);
  transactions.reverse();
  return transactions;
}

async function getTxData(near, nearArchival, txHash, accountId) {
  let decodedTxHash = nearAPI.utils.serialize.base_decode(txHash);
  let txData;
  try {
    txData = await near.connection.provider.txStatus(
      decodedTxHash,
      accountId
    );
  } catch {
    txData = await nearArchival.connection.provider.txStatus(
      decodedTxHash,
      accountId
    );
  }
  return txData;
}

const watchNearLogs = async (nearConnection, nearArchival, contractAccountId) => {
  const transactions = await extractTransactions("5r7rweskNxYuG23cFqBeuFjcaSKX3M4RZ9vnsqcPdpW5", "6f7rcnoFUc1J93DpbdP4XwDzCwqnVuV1dS4CNLQXJMkA", contractAccountId, nearConnection, nearArchival)
  console.log("transactions", transactions)

  console.log("transaction hash", transactions[0].hash)
  const txData = await getTxData(nearConnection, nearArchival, transactions[0].hash, contractAccountId)
  console.log("txData", txData)

  transactions[0]
}

const watchNear = async () => {
  network = "testnet"
  let nearConnection = await createNearConnection(network, `https://rpc.${network}.near.org`, currentCredentialsPath);
  let nearArchival = await createNearConnection(network, `https://archival-rpc.testnet.near.org`, currentCredentialsPath);

  const contractAccountId = "switchboard-v2.testnet"

  await watchNearLogs(nearConnection, nearArchival, contractAccountId)
}

module.exports = { watchNear }