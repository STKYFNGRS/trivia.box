import { baseSepolia } from 'viem/chains';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';
import { useBuyMeACoffeeContract } from './useBuyMeACoffeeContract';

describe('useBuyMeACoffeeContract', () => {
  it('should return correct contract data', () => {
    const contract = useBuyMeACoffeeContract();
    expect(contract).toEqual({
      abi: BuyMeACoffeeABI,
      address: '0x0c77aF2E8f46ce8E4e2EEd25638b4913141D5dEb',
      status: 'ready',
      supportedChains: [baseSepolia],
    });
  });
});
