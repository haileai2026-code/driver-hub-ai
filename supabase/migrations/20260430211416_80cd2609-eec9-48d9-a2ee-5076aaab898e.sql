CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SUPER_ADMIN can read app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "SUPER_ADMIN can manage app settings"
ON public.app_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value) VALUES
  ('beny_whatsapp', '{"phone": ""}'::jsonb),
  ('morning_summary', '{"time_il": "08:00", "enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;