import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que as variáveis públicas do Supabase entrem no bundle do cliente no build da Vercel
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Garante que pdf-parse vá no artefato da função na Vercel (não usar serverExternalPackages aqui)
  outputFileTracingIncludes: {
    "/api/questions/import/pdf": ["./node_modules/pdf-parse/**/*"],
    "/api/questions/import/preview": ["./node_modules/pdf-parse/**/*"],
    "/api/questions/import/batch": ["./node_modules/pdf-parse/**/*"],
    "/api/coach/documents/upload": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/xlsx/**/*",
    ],
    "/api/coach/jobs/run": ["./node_modules/pdf-parse/**/*"],
  },
  async redirects() {
    return [
      { source: "/week-summary", destination: "/resumo-periodo", permanent: true },
      { source: "/flashcards/decks", destination: "/flashcards", permanent: false }
    ];
  }
};

export default nextConfig;
