import { generateMetadata } from '@/utils/generateMetadata';

export const metadata = generateMetadata({
  title: 'Trivia Box - Mint',
  description:
    'Mint an NFT',
  images: 'themes.png',
  pathname: 'mint',
});

export default async function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
