import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/week-summary", destination: "/resumo-periodo", permanent: true }
    ];
  }
};

export default nextConfig;
