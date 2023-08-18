const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const showAllData = async () => {
  const data = await prisma.eth_near.findMany({
  })
  console.log("data", data)
}

const deleteAllData = async () => {
  console.log("disabled!")
  // console.log("deletetin all data...")
  // const deleteData = await prisma.eth_near.deleteMany({})
  // console.log("deleteData", deleteData)
}

const runCustomQuery = async () => {
}

async function main() {
  if (process.argv[2]) {
    if (process.argv[2] == "--showAll") await showAllData()
    else if (process.argv[2] == "--delete") await deleteAllData()
    else if (process.argv[2] == "--custom") await runCustomQuery()
  }
}

if (require.main == module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
