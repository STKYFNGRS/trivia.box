'use client';
import { useAccount, useEnsName } from 'wagmi';
import Footer from '@/components/layout/footer/Footer';
import Header from '@/components/layout/header/Header';

/**
 * Use the page component to wrap the components
 * that you want to render on the page.
 */
export default function HomePage() {
  const { address, status, chainId } = useAccount();
  const { data: name, isLoading, isError } = useEnsName({ address });

  console.log('Account:', { address, status, chainId });
  console.log('ENS Name:', { name, isLoading, isError });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error fetching ENS name</div>;

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
              <b>ENS Name / Address</b>: {name ?? address}
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
