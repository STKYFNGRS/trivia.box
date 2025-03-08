import { PrismaClient } from '@prisma/client'
import { NODE_ENV } from '@/lib/constants'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

// For better serverless performance and connection resilience
const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: 'pretty'
    // Connection pool configuration not supported in this Prisma version
  })
}

export const prisma = global.prisma ?? prismaClientSingleton()

// Don't keep the connection in production environment as it's serverless
// This helps prevent connection pool exhaustion
if (process.env.NODE_ENV !== 'production') global.prisma = prisma

// Handle graceful shutdown for all environments
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
  
  // Also handle SIGINT (e.g., Ctrl+C)
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}