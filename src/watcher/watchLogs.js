const { watchNear } = require("./nearLogs")
const { watchEth } = require("./ethLogs")

const watchLogs = async () => {
  // await watchEth()
  await watchNear()
  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watchLogs, 0);

// nonce, sender_address, source_tx, receiver_address, destination_tx, action, amount, time_origin, time_destination,
// token_address_origin, status

// status: {completed, pending, failed}
// action: {lock, unlock}
// token_address_origin: only for eth