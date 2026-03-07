/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  turbopack: {},
  transpilePackages: [
    "resium",
  ],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "d3",
      "@blueprintjs/core",
      "@blueprintjs/icons",
      "@blueprintjs/select",
      "@blueprintjs/table",
      "@blueprintjs/datetime2",
      "@blueprintjs/popover2",
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Optimize chunk splitting for Cesium
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          chunks: 'all',
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            // Separate Cesium into its own chunk
            cesium: {
              test: /[\\/]node_modules[\\/]cesium[\\/]/,
              name: 'cesium',
              priority: 20,
              chunks: 'all',
              reuseExistingChunk: true,
            },
            // Separate resium into its own chunk
            resium: {
              test: /[\\/]node_modules[\\/]resium[\\/]/,
              name: 'resium',
              priority: 15,
              chunks: 'all',
              reuseExistingChunk: true,
            },
            // Vendor chunk for other large libraries
            vendor: {
              test: /[\\/]node_modules[\\/](?!cesium|resium)/,
              name: 'vendors',
              priority: 10,
              chunks: 'all',
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    // Set global object for Cesium workers
    config.output.globalObject = 'this';

    // Docker dev: use polling for file watching
    if (process.env.DOCKER_ENV === '1') {
      config.watchOptions = {
        poll: 500,
        aggregateTimeout: 300,
      };
    }

    return config;
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
