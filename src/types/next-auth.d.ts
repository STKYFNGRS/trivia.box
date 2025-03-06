import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      walletAddress?: string;
    } & DefaultSession['user'];
  }

  interface User {
    walletAddress: string;
  }
}