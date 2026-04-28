CREATE TYPE public.app_role AS ENUM ('admin', 'ceo', 'evp', 'coo', 'cfo', 'recruiter', 'viewer');
CREATE TYPE public.candidate_city AS ENUM ('Ashkelon', 'Kiryat Gat');
CREATE TYPE public.candidate_stage AS ENUM ('Lead', 'Learning', 'Test', 'Placed');
CREATE TYPE public.license_status AS ENUM ('Not Started', 'Learning', 'Theory Ready', 'Test Scheduled', 'Licensed');
CREATE TYPE public.preferred_language AS ENUM ('he', 'am', 'ru');
CREATE TYPE public.bus_company AS ENUM ('Egged', 'Afikim');
CREATE TYPE public.finance_entry_type AS ENUM ('revenue_pending', 'revenue_received', 'maintenance_expense', 'other_expense');
CREATE TYPE public.finance_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.asset_status AS ENUM ('active', 'service_due', 'in_service', 'inactive');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name jsonb NOT NULL DEFAULT '{"he":"","am":"","ru":""}'::jsonb,
  age integer,
  city public.candidate_city NOT NULL,
  phone text NOT NULL,
  license_status public.license_status NOT NULL DEFAULT 'Not Started',
  documents jsonb NOT NULL DEFAULT '{"id":{"received":false,"url":null},"green_form":{"received":false,"url":null}}'::jsonb,
  stage public.candidate_stage NOT NULL DEFAULT 'Lead',
  preferred_language public.preferred_language NOT NULL DEFAULT 'am',
  localized_profile jsonb NOT NULL DEFAULT '{"he":{},"am":{},"ru":{}}'::jsonb,
  last_contacted_at timestamptz,
  next_step_due_at timestamptz,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  operator_name text NOT NULL DEFAULT 'Ciel',
  interaction_type text NOT NULL DEFAULT 'whatsapp',
  notes_amharic text,
  notes_hebrew text,
  notes_russian text,
  source_message text,
  translated_hebrew text,
  sentiment text,
  follow_up_required boolean NOT NULL DEFAULT false,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  company public.bus_company,
  city public.candidate_city,
  entry_type public.finance_entry_type NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  status public.finance_status NOT NULL DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_name text NOT NULL,
  plate_number text NOT NULL UNIQUE,
  fleet_group text NOT NULL DEFAULT 'Arrizo 8',
  mileage integer NOT NULL DEFAULT 0,
  last_service_date date,
  next_service_date date,
  status public.asset_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  audience_language public.preferred_language NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  role_owner public.app_role NOT NULL DEFAULT 'coo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, audience_language)
);

CREATE TABLE public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  language public.preferred_language NOT NULL DEFAULT 'am',
  recommendation text NOT NULL,
  recommended_action text,
  created_by_role public.app_role NOT NULL DEFAULT 'coo',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view candidates" ON public.candidates
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','cfo','recruiter','viewer']::public.app_role[]));

CREATE POLICY "Operations can create candidates" ON public.candidates
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]));

CREATE POLICY "Operations can update candidates" ON public.candidates
FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]));

CREATE POLICY "Executives can delete candidates" ON public.candidates
FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo']::public.app_role[]));

CREATE POLICY "Staff can view operation logs" ON public.operation_logs
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','cfo','recruiter','viewer']::public.app_role[]));

CREATE POLICY "Operations can manage operation logs" ON public.operation_logs
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]));

CREATE POLICY "Finance leaders can view finance entries" ON public.finance_entries
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]));

CREATE POLICY "Finance leaders can manage finance entries" ON public.finance_entries
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]));

CREATE POLICY "Finance leaders can view company assets" ON public.company_assets
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]));

CREATE POLICY "Finance leaders can manage company assets" ON public.company_assets
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','cfo']::public.app_role[]));

CREATE POLICY "Staff can view message templates" ON public.message_templates
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','cfo','recruiter','viewer']::public.app_role[]));

CREATE POLICY "Operations can manage message templates" ON public.message_templates
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo']::public.app_role[]));

CREATE POLICY "Staff can view AI recommendations" ON public.ai_recommendations
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','cfo','recruiter','viewer']::public.app_role[]));

CREATE POLICY "Operations can create AI recommendations" ON public.ai_recommendations
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','ceo','evp','coo','recruiter']::public.app_role[]));

CREATE POLICY "Executives can delete AI recommendations" ON public.ai_recommendations
FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','ceo']::public.app_role[]));

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_operation_logs_updated_at BEFORE UPDATE ON public.operation_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_finance_entries_updated_at BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_company_assets_updated_at BEFORE UPDATE ON public.company_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_candidates_stage ON public.candidates(stage);
CREATE INDEX idx_candidates_city ON public.candidates(city);
CREATE INDEX idx_candidates_language ON public.candidates(preferred_language);
CREATE INDEX idx_operation_logs_candidate_id ON public.operation_logs(candidate_id);
CREATE INDEX idx_operation_logs_log_date ON public.operation_logs(log_date);
CREATE INDEX idx_finance_entries_city_status ON public.finance_entries(city, status);
CREATE INDEX idx_finance_entries_company ON public.finance_entries(company);
CREATE INDEX idx_company_assets_status ON public.company_assets(status);
CREATE INDEX idx_ai_recommendations_candidate_id ON public.ai_recommendations(candidate_id);