'use client';
import Footer from '@/components/layout/footer/Footer';
import BlackHoleSimulation from './_components/BlackHoleSimulation';
import HomeHeader from './_components/HomeHeader';


/**
 * Use the page component to wrap the components
 * that you want to render on the page.
 */

export default function HomePage() {
  return (
    <>
      <HomeHeader />
        <BlackHoleSimulation />
      <Footer />
    </>
  );
}
