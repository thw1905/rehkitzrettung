import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.178.94",
    "*.192.168.178.94",
    "localhost",
    "127.0.0.1",
    "obligations-while-beats-causing.trycloudflare.com ",
  ],
};

export default nextConfig;
