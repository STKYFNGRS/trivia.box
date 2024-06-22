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
    address: '0x5fA9C05fb87C3BaE008853ad0662C93618dc528C',
  },

  // ... more chains for this contract go here
});
