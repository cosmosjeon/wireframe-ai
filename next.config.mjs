/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@excalidraw/excalidraw'],
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      }
    ]
  },
}

export default nextConfig
