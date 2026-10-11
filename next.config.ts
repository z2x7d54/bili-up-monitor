import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Match DATA_FILE_LIMIT: proxy otherwise truncates JSON uploads at 10 MB.
    proxyClientMaxBodySize: 100 * 1024 * 1024,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.hdslb.com",
      },
    ],
  },
};

export default nextConfig;
