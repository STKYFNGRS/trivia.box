'use client';
import { useAccount, useEnsName } from 'wagmi';
import { Name } from '@coinbase/onchainkit/identity';
import Footer from '@/components/layout/footer/Footer';
import Header from '@/components/layout/header/Header';

/**
 * Use the page component to wrap the components
 * that you want to render on the page.
 */
export default function HomePage() {
  const { address, status, chainId } = useAccount();
  const { data: ensName } = useEnsName({ address });

  return (
    <>
      <Header />
      <main className="container mx-auto flex flex-col px-8 py-16">
        <div>
          <h2 className="text-xl">Developer information</h2>
          <br />
          <h3 className="text-lg">Account</h3>
          <ul>
            <li>
              <b>status</b>: {status}
            </li>
            <li>
              <b>address</b>: {address}
            </li>
            <li>
              <b>chainId</b>: {chainId}
            </li>
            <li>
              <b>ENS Name / Address</b>: {ensName ?? address}
            </li>
            <Name address={address} ensName={ensName} />
      ) : (
        <div>No ENS name found for {address}</div>
            
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
