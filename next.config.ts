import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.my.box',
      }
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack: (config, { dev, isServer }) => {
    // Lit configuration for production
    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@lit/reactive-element': '@lit/reactive-element/reactive-element.js',
        'lit': 'lit/index.js',
        'lit-element': 'lit-element/lit-element.js',
        'lit-html': 'lit-html/lit-html.js',
      };
    }
    return config;
  }
};

export default nextConfig;