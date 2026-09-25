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
    serverComponentsExternalPackages: ['@zxing/library', 'zxing-wasm'],
    // The barcode reader loads its WASM from disk; ship it with the meal worker.
    outputFileTracingIncludes: {
      '/api/queues/process-meal-operation': ['./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'],
    },
  },
  webpack: (config) => {
    // Allow extensionless imports from mixed ESM dependencies.
    config.module.rules.push({
      test: /\.m?js/,
      resolve: {
        fullySpecified: false,
      },
    });
    return config;
  },
};

module.exports = nextConfig;
