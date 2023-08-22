const { Action } = require('@prisma/client')
const { getPrisma } = require('./watcher/utils/utils')
const args = require('yargs').argv;
const network = args.network

const prisma = getPrisma(network)

const showAllData = async () => {
  const data = await prisma.eth_near.findMany({
  })
  console.log("data", data)
}

const deleteAllData = async () => {
  // console.log("disabled!")
  console.log("deletetin all data...")
  const deleteData = await prisma.eth_near.deleteMany({})
  console.log("deleteData", deleteData)
}

const runCustomQuery = async () => {
  const result = await prisma.$queryRaw`describe eth_near;`
  console.log(result);
}

const listTransactions = async (params) => {
  if ((params.per_page < 0) && (params.page_no < 0)) {
    throw new Error('Bad input argument!');
  }
  let data = await prisma.eth_near.findMany({
    orderBy: {
      sourceTime: "desc"
    }
  })
  data = data.slice(
    Math.min(data.length, params.per_page * params.page_no),
    Math.min(data.length, params.per_page * (params.page_no + 1))
  )
  return data
}

const transaction = async (params) => {
  let action
  if (params.source == "eth") action = Action.Lock
  else if (params.source == "near") action = Action.Unlock
  else {
    throw new Error('Bad argument `source`!');
  }

  let data = await prisma.eth_near.findUnique({
    where: {
      nonce_action:
      {
        nonce: params.nonce,
        action: action
      }
    }
  })
  return data
}

async function main() {
  if (args.showAll) await showAllData()
  else if (args.delete) await deleteAllData()
  else if (args.custom) await runCustomQuery()
}

if (require.main == module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { listTransactions, transaction }