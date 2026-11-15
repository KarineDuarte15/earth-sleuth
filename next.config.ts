import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    // Local: /api/* vai para o FastAPI na porta 8000. Na Vercel, quem roteia é o vercel.json.
    if (process.env.NODE_ENV === "development") {
      return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
    }
    return [];
  },
};

export default nextConfig;
