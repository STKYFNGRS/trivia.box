'use client';

import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import Image from 'next/image';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import Web3ModalButton from './Web3ModalButton';

export default function WalletDisplay() {
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({
    address,
    chainId: 1,
  });
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName || undefined,
    chainId: 1,
  });
  const { open } = useWeb3Modal();

  const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '...';
  const displayAddress = ensName || truncatedAddress;

  if (!isConnected) {
    return <Web3ModalButton />;
  }

  return (
    <button
      onClick={() => open()}
      className="flex flex-col items-center gap-3 p-3 rounded-2xl bg-[#0D0D17]/60 border border-white/10 hover:bg-[#0D0D17]/80 transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,51,102,0.15)] group"
    >
      {ensAvatar ? (
        <Image
          src={ensAvatar}
          alt={displayAddress}
          className="rounded-full ring-2 ring-[#FF6B6B]/30 group-hover:ring-[#FF6B6B] transition-all duration-300 shadow-[0_0_15px_rgba(255,51,102,0.2)]"
          width={64}
          height={64}
          unoptimized
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
          <span className="text-xl text-purple-300">
            {address ? address.slice(2, 4) : '??'}
          </span>
        </div>
      )}
      <span className="text-sm font-medium text-white">
        {displayAddress}
      </span>
    </button>
  );
}