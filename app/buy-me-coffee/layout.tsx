import { generateMetadata } from '@/utils/generateMetadata';

export const metadata = generateMetadata({
  title: 'Buy me a coffee - Please',
  description:
    'Trivia Box needs coffee.',
  images: 'themes.png',
  pathname: 'buy-me-coffee',
});

export default async function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
