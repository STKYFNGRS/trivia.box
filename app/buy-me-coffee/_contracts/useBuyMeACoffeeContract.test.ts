import { baseSepolia } from 'viem/chains';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';
import { useBuyMeACoffeeContract } from './useBuyMeACoffeeContract';

describe('useBuyMeACoffeeContract', () => {
  it('should return correct contract data', () => {
    const contract = useBuyMeACoffeeContract();
    expect(contract).toEqual({
      abi: BuyMeACoffeeABI,
      address: '00x0b3507b64197cBaDda81BA8786D05BCd8F1e6540',
      status: 'ready',
      supportedChains: [baseSepolia],
    });
  });
});
