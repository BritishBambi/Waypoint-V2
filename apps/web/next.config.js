/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@waypoint/ui", "@waypoint/api-client", "@waypoint/types"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.igdb.com",
        pathname: "/igdb/image/upload/**",
      },
    ],
  },
};

module.exports = nextConfig;
