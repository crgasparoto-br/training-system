import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'gasparoto' } },
    select: { id: true, email: true, isActive: true, type: true, lastLoginAt: true, createdAt: true }
  })
  console.log(JSON.stringify(users, null, 2))
}
main().catch(console.error).finally(async () => { await prisma.$disconnect() })