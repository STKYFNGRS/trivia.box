'use client';

import { useAccount, useEnsName, useEnsAvatar, useChainId } from 'wagmi';
import Image from 'next/image';
import { base } from 'wagmi/chains';
import { modal } from '@/context';

export default function WalletDisplay() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: ensName } = useEnsName({
    address,
    chainId: 1, // Always check ENS on mainnet
    query: {
      enabled: Boolean(address)
    }
  });
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName || undefined,
    chainId: 1, // Always check ENS on mainnet
    query: {
      enabled: Boolean(ensName)
    }
  });

  const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '...';
  const displayAddress = ensName || truncatedAddress;

  if (!isConnected) {
    return null; // Let the parent handle the unconnected state
  }

  return (
    <button
      onClick={() => modal.open()}
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
            {address ? address.slice(2, 4).toUpperCase() : '??'}
          </span>
        </div>
      )}
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium text-white">
          {displayAddress}
        </span>
        {chainId !== base.id && (
          <span className="text-xs text-red-400">
            Wrong Network
          </span>
        )}
      </div>
    </button>
  );
}