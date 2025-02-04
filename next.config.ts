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
  env: {
    NEXT_PUBLIC_NODE_ENV: process.env.NODE_ENV
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@lit-labs/motion': '@lit-labs/motion/dist/motion.min.js',
      '@lit-labs/observers': '@lit-labs/observers/dist/observers.min.js'
    };
    return config;
  }
};

export default nextConfig;