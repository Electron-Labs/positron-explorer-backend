require("./watcher/watch")
const { listTransactions, transaction } = require('./dbOp');

async function listTransactionsEndPoint(ctx) {
  try {
    const records = await listTransactions(ctx.query);
    ctx.status = 200;
    ctx.body = records;
  } catch (err) {
    console.error(err);
    ctx.status = 500;
  }
}
async function transactionEndPoint(ctx) {
  try {
    const records = await transaction(ctx.query);
    ctx.status = 200;
    ctx.body = records;
  } catch (err) {
    console.error(err);
    ctx.status = 500;
  }
}

module.exports = { listTransactionsEndPoint, transactionEndPoint };
