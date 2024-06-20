import { baseSepolia } from 'viem/chains';
import { generateContractHook } from '@/hooks/contracts';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';

/**
 * Returns contract data for the BuyMeACoffee contract.
 */
export const useBuyMeACoffeeContract = generateContractHook({
  abi: BuyMeACoffeeABI,
  [baseSepolia.id]: {
    chain: baseSepolia,
    address: '0x2001dce233105e4f8b32d4ac9c92203f9b4052f8',
  },

  // ... more chains for this contract go here
});
