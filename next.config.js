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
