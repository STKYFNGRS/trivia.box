// Environment variable type declarations
declare namespace NodeJS {
  interface ProcessEnv {
    POSTGRES_PRISMA_URL: string;
    NODE_ENV: 'development' | 'production' | 'test';
    CLAUDE_API_KEY?: string;
  }
}
