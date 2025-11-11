"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    await prisma.session.deleteMany();
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
//# sourceMappingURL=seed.js.map