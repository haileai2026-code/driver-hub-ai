-- WhatsApp screening conversations table
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone                 TEXT        NOT NULL UNIQUE,
  step                  SMALLINT    NOT NULL DEFAULT 1,
  language              TEXT        NOT NULL DEFAULT 'he' CHECK (language IN ('he', 'am', 'ru')),
  answers               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  candidate_id          UUID        REFERENCES public.candidates(id) ON DELETE SET NULL,
  grade                 TEXT        CHECK (grade IN ('A', 'B', 'C')),
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminder_24h_sent_at  TIMESTAMPTZ,
  reminder_72h_sent_at  TIMESTAMPTZ,
  flagged_no_reply      BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_conversations_last_message_idx
  ON public.wa_conversations(last_message_at);
CREATE INDEX IF NOT EXISTS wa_conversations_step_idx
  ON public.wa_conversations(step) WHERE step < 4;
CREATE INDEX IF NOT EXISTS wa_conversations_flagged_idx
  ON public.wa_conversations(flagged_no_reply) WHERE flagged_no_reply = true;

CREATE OR REPLACE FUNCTION public.update_wa_conversations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER wa_conversations_updated_at
BEFORE UPDATE ON public.wa_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_wa_conversations_updated_at();

ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on wa_conversations"
  ON public.wa_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Telegram settings in app_settings
-- beny_telegram.chat_id: Beny's Telegram chat ID for morning summary and grade-A alerts
INSERT INTO public.app_settings (key, value)
VALUES ('beny_telegram', '{"chat_id": "5039079360"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
