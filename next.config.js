/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
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
}

module.exports = nextConfig