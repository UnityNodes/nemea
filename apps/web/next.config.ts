import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";
const publicWebUrl = process.env.PUBLIC_WEB_URL?.trim() || undefined;

if (process.env.NEXT_PHASE === "phase-production-build" && !publicWebUrl) {
  throw new Error("PUBLIC_WEB_URL is required for a production build: link previews need an absolute image address.");
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@nemea/shared-types"],
  env: publicWebUrl ? { PUBLIC_WEB_URL: publicWebUrl } : {},
  async rewrites() {
    return [
      { source: "/api/internal/:path*", destination: "/404" },
      { source: "/api/:path*", destination: `${apiOrigin}/:path*` },
    ];
  },
};

export default config;
