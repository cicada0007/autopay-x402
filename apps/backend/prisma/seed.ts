import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.agentRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.auditLog.deleteMany();

  await prisma.auditLog.create({
    data: {
      category: 'SYSTEM',
      level: 'INFO',
      message: 'Seed data initialised',
      details: { note: 'Fresh workspace for Autopay Agent demo' }
    }
  });
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

