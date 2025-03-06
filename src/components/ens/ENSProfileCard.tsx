'use client';

import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Twitter, Github, Globe, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { lookupEnsName, lookupEnsAvatar } from '@/lib/ens';
import { getDirectEnsAvatar } from '@/lib/ensUtils';
import { cn } from '@/lib/utils';

interface ENSProfileCardProps {
  addressOrName: string;
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

// Fetch additional ENS records for a given name
const fetchENSRecords = async (ensName: string) => {
  try {
    // This is a simplified version - you might need to enhance this
    // based on your existing ENS resolution functions
    return {
      description: '',
      email: '',
      url: '',
      twitter: '',
      github: '',
      discord: '',
      // Add more as needed
    };
  } catch (error) {
    console.error('Error fetching ENS records:', error);
    return null;
  }
};

export default function ENSProfileCard({ addressOrName, isOpen, onClose, darkMode = true }: ENSProfileCardProps) {
  const [isEthAddress, setIsEthAddress] = useState(false);

  // Check if the input is an ETH address or ENS name
  useEffect(() => {
    setIsEthAddress(addressOrName.startsWith('0x') && addressOrName.length === 42);
  }, [addressOrName]);

  // Query for ENS name if address is provided
  const { data: ensName, isLoading: ensNameLoading } = useQuery({
    queryKey: ['ensName', addressOrName],
    queryFn: async () => {
      if (!isEthAddress) return addressOrName;
      const name = await lookupEnsName(addressOrName);
      return name || null;
    },
    enabled: isOpen && isEthAddress,
  });

  // Query for avatar
  const { data: avatar, isLoading: avatarLoading } = useQuery({
    queryKey: ['ensAvatar', ensName || addressOrName],
    queryFn: async () => {
      if (!ensName && isEthAddress) return null;
      const nameToLookup = ensName || addressOrName;
      const avatar = await lookupEnsAvatar(nameToLookup);
      if (avatar) return avatar;
      
      // Try alternate method
      const directAvatar = await getDirectEnsAvatar(nameToLookup);
      return directAvatar || null;
    },
    enabled: isOpen && (!!ensName || !isEthAddress),
  });

  // Query for additional records if we have an ENS name
  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['ensRecords', ensName || (!isEthAddress ? addressOrName : '')],
    queryFn: async () => {
      const nameToLookup = ensName || (!isEthAddress ? addressOrName : '');
      if (!nameToLookup) return null;
      return fetchENSRecords(nameToLookup);
    },
    enabled: isOpen && (!!ensName || !isEthAddress),
  });

  const isLoading = ensNameLoading || avatarLoading || recordsLoading;
  const displayName = ensName || addressOrName;
  const displayAddress = isEthAddress ? addressOrName : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-xl overflow-hidden bg-gray-900 text-white shadow-xl">
          <div className="absolute right-2 top-2 z-10">
            <button
              onClick={onClose}
              className="rounded-full p-1.5 bg-gray-800/70 text-white hover:bg-gray-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-300">Loading ENS profile...</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Header/Banner */}
              <div className="h-24 bg-gradient-to-r from-amber-600 to-amber-400"></div>
              
              {/* Avatar */}
              <div className="px-4 -mt-12 pb-4">
                <div className="w-24 h-24 rounded-full bg-gray-800 border-4 border-gray-900 overflow-hidden">
                  {avatar ? (
                    <Image 
                      src={avatar} 
                      alt={displayName} 
                      width={96} 
                      height={96} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 font-bold text-2xl">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="px-6 py-2">
                <h2 className="text-xl font-bold text-white">{displayName}</h2>
                
                {displayAddress && (
                  <div className="mt-1 flex items-center space-x-1">
                    <p className="text-sm text-gray-400">{`${displayAddress.slice(0, 8)}...${displayAddress.slice(-6)}`}</p>
                    <a 
                      href={`https://etherscan.io/address/${displayAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-amber-400 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
                
                {records?.description && (
                  <p className="mt-4 text-gray-300">{records.description}</p>
                )}

                {/* Social Links */}
                <div className="mt-6 space-y-2">
                  {records?.url && (
                    <a 
                      href={records.url.startsWith('http') ? records.url : `https://${records.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-gray-300 hover:text-amber-400 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      <span className="text-sm">{records.url}</span>
                    </a>
                  )}
                  
                  {records?.twitter && (
                    <a 
                      href={`https://twitter.com/${records.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-gray-300 hover:text-amber-400 transition-colors"
                    >
                      <Twitter className="h-4 w-4" />
                      <span className="text-sm">{records.twitter}</span>
                    </a>
                  )}
                  
                  {records?.github && (
                    <a 
                      href={`https://github.com/${records.github.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-gray-300 hover:text-amber-400 transition-colors"
                    >
                      <Github className="h-4 w-4" />
                      <span className="text-sm">{records.github}</span>
                    </a>
                  )}
                  
                  {records?.email && (
                    <a 
                      href={`mailto:${records.email}`}
                      className="flex items-center space-x-2 text-gray-300 hover:text-amber-400 transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      <span className="text-sm">{records.email}</span>
                    </a>
                  )}
                </div>
              </div>
              
              {/* Footer */}
              <div className="px-6 py-4 mt-4 border-t border-gray-800">
                <div className="flex items-center justify-between">
                  <a 
                    href={`https://app.ens.domains/name/${ensName || addressOrName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors flex items-center"
                  >
                    <span>View on ENS</span>
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
      </motion.div>
    </div>
  );
}