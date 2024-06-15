import { baseSepolia } from 'viem/chains';
import BuyMeACoffeeABI from './BuyMeACoffeeABI';
import { useBuyMeACoffeeContract } from './useBuyMeACoffeeContract';

describe('useBuyMeACoffeeContract', () => {
  it('should return correct contract data', () => {
    const contract = useBuyMeACoffeeContract();
    expect(contract).toEqual({
      abi: BuyMeACoffeeABI,
      address: '0x7297d3d10da82611cbf98f72C8eA47CC6687f188',
      status: 'ready',
      supportedChains: [baseSepolia],
    });
  });
});
