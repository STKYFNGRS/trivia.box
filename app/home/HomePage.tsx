'use client';
import { useAccount, useEnsName } from 'wagmi';
import Footer from '@/components/layout/footer/Footer';
import Header from '@/components/layout/header/Header';

/**
 * Use the page component to wrap the components
 * that you want to render on the page.
 */
export default function HomePage() {
  const account = useAccount();
  const { data: ensName } = useEnsName({ address: account.addresses?.[0] });
  console.log('ensName:', ensName);

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
              <b>status</b>: {account.status}
            </li>
            <li>
              <b>addresses</b>: {JSON.stringify(account.addresses)}
            </li>
            <li>
              <b>chainId</b>: {account.chainId}
            </li>
            <li>
              <b>ENS Name / Address</b>: {ensName ?? account.addresses?.[0]}
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
