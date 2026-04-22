import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'crgasparoto@gmail.com' },
    select: { id: true, email: true, isActive: true, type: true, lastLoginAt: true, createdAt: true }
  })
  console.log(JSON.stringify(user, null, 2))
}
main().catch(console.error).finally(async () => { await prisma.$disconnect() })