import { baseSepolia } from 'viem/chains';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';
import { useBuyMeACoffeeContract } from './useBuyMeACoffeeContract';

describe('useBuyMeACoffeeContract', () => {
  it('should return correct contract data', () => {
    const contract = useBuyMeACoffeeContract();
    expect(contract).toEqual({
      abi: BuyMeACoffeeABI,
      address: '0xdF9A684cc8c35f25c25D275AF950828c658765d9',
      status: 'ready',
      supportedChains: [baseSepolia],
    });
  });
});
