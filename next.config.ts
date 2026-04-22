import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  typedRoutes: true,
  basePath: isGithubPages ? "/agentic-trading-bots" : undefined,
  assetPrefix: isGithubPages ? "/agentic-trading-bots/" : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
