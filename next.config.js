/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'amino.nyc3.cdn.digitaloceanspaces.com',
        port: '',
        pathname: '/icons/**',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@zxing/library'],
  },
  webpack: (config, { isServer }) => {
    // Create alias for the `html-to-text` module if needed
    config.resolve.alias['html-to-text'] = require.resolve('html-to-text');

    // Handle the issue with ES module exports
    config.module.rules.push({
      test: /\.m?js/,
      resolve: {
        fullySpecified: false, // disable the behavior
      },
    });

    // Simplify externals configuration if not necessary
    if (!isServer) {
      config.externals = config.externals || [];
      config.externals.push('html-to-text');
    }

    return config;
  },
};

module.exports = nextConfig;
