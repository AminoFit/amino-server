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
  // The old admin pages were replaced by the /admin dashboard.
  async redirects() {
    return [
      { source: '/admin/debug', destination: '/admin/meals', permanent: false },
      { source: '/admin/viewas', destination: '/admin/users', permanent: false },
      { source: '/admin/bad-icons', destination: '/admin/foods?filter=no_icon', permanent: false },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ['zxing-wasm'],
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
