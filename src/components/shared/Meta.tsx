import Head from 'next/head';

interface MetaProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
}

export default function Meta({
  title = 'Trivia Box - Web3 Trivia Game',
  description = 'Test your knowledge, earn rewards, and compete with players worldwide!',
  keywords = 'trivia, web3, game, blockchain, quiz, rewards, crypto',
  image = '/social-preview.jpg',
}: MetaProps) {
  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>{title}</title>
        <meta name="title" content={title} />
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        
        {/* Mobile optimization */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Trivia Box" />
        
        {/* iOS optimization */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Trivia Box" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://trivia.box/" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        
        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://trivia.box/" />
        <meta property="twitter:title" content={title} />
        <meta property="twitter:description" content={description} />
        <meta property="twitter:image" content={image} />
      </Head>
    </>
  );
}