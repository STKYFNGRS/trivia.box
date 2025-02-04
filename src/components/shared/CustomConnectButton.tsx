'use client';

import { useWeb3Modal } from '@web3modal/wagmi/react';

export default function CustomConnectButton() {
  const { open } = useWeb3Modal();

  return (
    <button
      onClick={() => open()}
      className="px-8 py-3 text-white font-medium rounded-full text-base bg-gradient-to-r from-[#FF3366] to-[#FF8C42] hover:opacity-95 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF3366]/20"
    >
      Connect Wallet
    </button>
  );
}