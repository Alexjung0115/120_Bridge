import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{
      source: "/api/ai/:path*",
      destination: `${(process.env.BACKEND_API_URL ?? "https://bridge-api-demo-129844172635.asia-northeast3.run.app").replace(/\/+$/, "")}/:path*`,
    }];
  },
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
