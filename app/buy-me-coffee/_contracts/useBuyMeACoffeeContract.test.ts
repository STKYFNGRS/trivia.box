import { baseSepolia } from 'viem/chains';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';
import { useBuyMeACoffeeContract } from './useBuyMeACoffeeContract';

describe('useBuyMeACoffeeContract', () => {
  it('should return correct contract data', () => {
    const contract = useBuyMeACoffeeContract();
    expect(contract).toEqual({
      abi: BuyMeACoffeeABI,
      address: '0xDc71A23A22e42F6fed10fD6DA7D8F6B2cc101E04',
      status: 'ready',
      supportedChains: [baseSepolia],
    });
  });
});
