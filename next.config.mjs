/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : "dist",
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb"
    }
  }
};

export default nextConfig;
