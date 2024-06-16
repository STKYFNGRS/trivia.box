'use client';
import { Name } from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';
import Footer from '@/components/layout/footer/Footer';
import Header from '@/components/layout/header/Header';

/**
 * Use the page component to wrap the components
 * that you want to render on the page.
 */
export default function HomePage() {
  const { address, chainId, status } = useAccount();

  if (!address) return null;

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
              <b>addresses</b>: {address}
            </li>
            <li>
              <b>chainId</b>: {chainId}
            </li>
            <li>
              <Name address={address} />
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
