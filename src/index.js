require("./watcher/watch")
const { getRecords } = require('./dbOp');

async function records(ctx) {
  try {
    const records = await getRecords(ctx.params.n);
    ctx.status = 200;
    ctx.body = records;
  } catch (err) {
    console.error(err);
    ctx.status = 500;
  }
}

module.exports = { records };
