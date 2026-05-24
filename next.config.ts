import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.178.94",
    "*.192.168.178.94",
    "localhost",
    "127.0.0.1",
    "sour-hairs-beg.loca.lt",

  ],
};

export default nextConfig;
