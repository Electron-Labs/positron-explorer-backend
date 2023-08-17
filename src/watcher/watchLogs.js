const { watchNear } = require("./nearLogs")
const { watchEth } = require("./ethLogs")

const watchLogs = async () => {
  // await watchEth()
  await watchNear()
  // setInterval(watchLogs, 2000 * 60);
}


setTimeout(watchLogs, 0);

// nonce, sender_address, source_tx, receiver_address, destination_tx, action