-- Bucket Supabase Storage para PDFs do Coach (edital, incidência, material)
-- Crie o bucket "coach-documents" no painel Storage (privado recomendado).
-- A API usa service role para upload; leitura via signed URL ou path interno.

-- Política opcional se usar upload direto do cliente:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('coach-documents', 'coach-documents', false)
-- ON CONFLICT DO NOTHING;
