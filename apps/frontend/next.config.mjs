/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mintbot/shared"],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
