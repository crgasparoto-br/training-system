import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    take: 5,
    select: { email: true }
  })
  console.log(JSON.stringify(users, null, 2))
}
main().catch(console.error).finally(async () => { await prisma.$disconnect() })