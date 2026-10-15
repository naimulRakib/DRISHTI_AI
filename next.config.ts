import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "deep-signs-doubt.loca.lt",
    "*.loca.lt",
    "*.ngrok-free.app",
    "*.trycloudflare.com",
    "10.18.128.108",
  ],
};

export default nextConfig;
