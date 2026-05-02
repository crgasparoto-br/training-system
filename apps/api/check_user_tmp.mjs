import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({
  where: { email: 'crgasparoto@gmail.com' },
  select: { id: true, email: true, type: true, isActive: true, createdAt: true }
});
console.log(JSON.stringify(user));
await prisma.$disconnect();
