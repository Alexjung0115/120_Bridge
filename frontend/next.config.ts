import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BRIDGE_LOCAL_DEMO === "1" && {
    webpack(config) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "pretendard-gov/dist/web/static/PretendardGOV-Regular.css": false,
        "pretendard-gov/dist/web/static/PretendardGOV-Bold.css": false,
      };
      return config;
    },
  }),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
