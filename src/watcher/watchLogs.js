const { watchNear } = require("./nearLogs")
const { watchEth } = require("./ethLogs")

const watchLogs = async () => {
  await watchEth()
  // await watchNear()
  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watchLogs, 0);

// source
// tx_hash, contract_address, block_number, sender_address, time

// destination
// tx_hash, contract_address, block_number, block_hash, receiver_address, time

// interchain_tx
// nonce, source_tx, destination_tx