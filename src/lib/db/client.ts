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
    errorFormat: 'pretty',
    // Important for serverless environments to prevent too many connections
    // and connection exhaustion
    connection: {
      options: { 
        keepAlive: 2000, // keep alive connections 
        monitoring: false, // disable monitoring 
      }
    }
  })
}

export const prisma = global.prisma ?? prismaClientSingleton()

// Don't keep the connection in production environment as it's serverless
// This helps prevent connection pool exhaustion
if (process.env.NODE_ENV !== 'production') global.prisma = prisma

// Handle graceful shutdown in production environments
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}