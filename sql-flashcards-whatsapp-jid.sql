-- Adiciona vínculo WhatsApp por JID (rodar após sql-flashcards.sql)

ALTER TABLE flashcard_bot_settings
  ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_display_label TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_link_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_authorized BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN flashcard_bot_settings.whatsapp_jid IS 'JID do privado (ex. 5511...@s.whatsapp.net ou @lid)';
COMMENT ON COLUMN flashcard_bot_settings.whatsapp_display_label IS 'Nome exibido na lista do grupo (sync-membros)';
COMMENT ON COLUMN flashcard_bot_settings.whatsapp_link_requested_at IS 'Último POST flashcards-link-request';
COMMENT ON COLUMN flashcard_bot_settings.whatsapp_authorized IS 'Usuário respondeu SIM no privado do bot';
