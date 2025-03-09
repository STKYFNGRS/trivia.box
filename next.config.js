/** @type {import('next').NextConfig} */
const nextConfig = {
  // Simple configuration focused on performance
  reactStrictMode: true,
  // Transpile packages if needed
  transpilePackages: ['ethereum-identity-kit'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'metadata.ens.domains',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'gateway.ipfs.io',
      },
      {
        protocol: 'https',
        hostname: '*.ipfs.dweb.link',
      },
      {
        protocol: 'https',
        hostname: 'ef.xyz',
      },
      {
        protocol: 'https',
        hostname: 'api.my.box',
      },
      // Add more image hosts for ENS avatars
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.infura.io',
      },
      {
        protocol: 'https',
        hostname: '*.arweave.net',
      }
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack: (config, { dev }) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    
    // Add cache optimization
    config.cache = true;
    
    // Remove console.log in production
    if (!dev) {
      // Find the terser plugin
      const terserPluginIndex = config.optimization.minimizer.findIndex(
        (minimizer) => minimizer.constructor.name === 'TerserPlugin'
      );
      
      if (terserPluginIndex > -1) {
        // Extract the terser plugin
        const terserPlugin = config.optimization.minimizer[terserPluginIndex];
        
        // Modify the options
        terserPlugin.options.terserOptions = {
          ...terserPlugin.options.terserOptions,
          compress: {
            ...terserPlugin.options.terserOptions?.compress,
            drop_console: true, // Remove all console.* calls
            pure_funcs: [
              'console.debug',
              'console.log',
              'console.info',
              // Keep error and warn for critical issues
              // 'console.error',
              // 'console.warn',
            ],
          },
        };
        
        // Replace the plugin
        config.optimization.minimizer[terserPluginIndex] = terserPlugin;
      }
    }
    
    return config
  },
  swcMinify: true,
  // Add option to suppress URL warnings during build
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },
}

module.exports = nextConfig