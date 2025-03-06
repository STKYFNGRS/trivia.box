/// <reference types="react" />

import '@reown/appkit/react';

declare module '@reown/appkit/react' {
  interface AppKitUser {
    id: string;
    email?: string;
    wallet?: string;
  }

  interface PublicStateControllerState {
    status: 'authenticated' | 'unauthenticated' | 'loading';
    data?: AppKitUser;
    chain?: {
      id: number;
      name: string;
    };
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'appkit-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        theme?: 'light' | 'dark';
        size?: 'sm' | 'md' | 'lg';
        variant?: 'primary' | 'secondary';
      };
    }
  }
}

export {};