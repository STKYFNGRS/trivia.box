'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { modal } from '@/config/appkit';
import type { User } from '@/types/user';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  address: string | undefined;
  user: User | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoading: false,
  address: undefined,
  user: null,
  connect: async () => {},
  disconnect: async () => {},
});

export default function AuthProviderPlaceholder({ children }: { children: React.ReactNode }) {
  return children;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isModalBusy, setIsModalBusy] = useState(false);

  const fetchUserData = useCallback(async () => {
    if (address && isConnected) {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/user?address=${address}`);
        const data = await response.json();
        
        if (data.success && data.data) {
          setUser(data.data);
          setIsAuthenticated(true);
        } else {
          console.error('Failed to fetch user data:', data.error);
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    } else {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const connect = async () => {
    if (isModalBusy) return;
    try {
      setIsModalBusy(true);
      await modal.open().catch((error) => {
        if (error.message === 'Proposal expired') {
          return modal.open();
        }
        throw error;
      });
    } catch (error) {
      console.error('Failed to open connect modal:', error);
    } finally {
      setIsModalBusy(false);
    }
  };

  const disconnect = async () => {
    if (isModalBusy) return;
    try {
      setIsModalBusy(true);
      await modal.disconnect();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsModalBusy(false);
    }
  };

  useEffect(() => {
    console.log('[Debug] AuthProvider state:', {
      isAuthenticated,
      isConnected,
      address,
      isLoading,
      isModalBusy
    });
  }, [isAuthenticated, isConnected, address, isLoading, isModalBusy]);

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated, 
        isLoading,
        address, 
        user,
        connect, 
        disconnect 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);