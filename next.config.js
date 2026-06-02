/** @type {import('next').NextConfig} */
const nextConfig = { typescript: { ignoreBuildErrors: true },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'xlsx'],
  },
}

module.exports = nextConfig

