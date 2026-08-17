-- Run in Supabase SQL Editor
-- Biblioteca global de tutoriais em vídeo
--
-- Gestores (criar/editar/excluir) são definidos no app pela env:
--   TUTORIALS_MANAGER_EMAILS=email1@dominio.com,email2@dominio.com
-- Configure no .env local e nas Environment Variables da Vercel, depois faça redeploy.
--
-- Storage: bucket público "tutorials" (vídeo + thumbnail). O banco guarda só path/URL.

CREATE TABLE IF NOT EXISTS tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  video_path TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_path TEXT,
  thumbnail_url TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  author_email TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutorials_status_created
  ON tutorials (status, created_at DESC);

ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tutorials_select_published" ON tutorials;
CREATE POLICY "tutorials_select_published"
  ON tutorials FOR SELECT
  TO authenticated
  USING (status = 'published');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tutorials',
  'tutorials',
  true,
  209715200,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "tutorials_public_read" ON storage.objects;
CREATE POLICY "tutorials_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tutorials');
