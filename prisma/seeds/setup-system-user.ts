import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupSystemUser() {
  const systemUser = await prisma.trivia_users.upsert({
    where: { wallet_address: 'system' },
    create: { wallet_address: 'system' },
    update: {}
  });

  console.log('System user created with ID:', systemUser.id);
  return systemUser.id;
}

setupSystemUser()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });