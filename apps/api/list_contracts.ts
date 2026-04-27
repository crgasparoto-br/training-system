import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const contracts = await prisma.contract.findMany({ select: { id: true, name: true } })
  console.log(JSON.stringify(contracts, null, 2))
}
main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect() })
