import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  async redirects() {
    return [
      { source: "/week-summary", destination: "/resumo-periodo", permanent: true },
      { source: "/flashcards/decks", destination: "/flashcards", permanent: false }
    ];
  }
};

export default nextConfig;
