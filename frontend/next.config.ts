import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.104",
    "localhost",
    "127.0.0.1",
  ],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
