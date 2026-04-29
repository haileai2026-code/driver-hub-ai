-- Ensure user_roles has the requested role model
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_roles
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;

UPDATE public.user_roles
SET role = CASE role
  WHEN 'admin' THEN 'super_admin'
  WHEN 'ceo' THEN 'super_admin'
  WHEN 'evp' THEN 'operator'
  WHEN 'coo' THEN 'operator'
  WHEN 'cfo' THEN 'operator'
  WHEN 'recruiter' THEN 'operator'
  WHEN 'viewer' THEN 'viewer'
  WHEN 'super_admin' THEN 'super_admin'
  WHEN 'operator' THEN 'operator'
  ELSE 'viewer'
END
WHERE role NOT IN ('super_admin', 'operator', 'viewer');

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%user_id%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id
  AND a.created_at > b.created_at;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'operator', 'viewer'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND conname = 'user_roles_user_id_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Role helper functions avoid recursive RLS on user_roles.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
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

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = _user_id
            AND role = _role::text
        )
      $body$
    $fn$;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = _user_id
            AND role = ANY(ARRAY(SELECT unnest(_roles)::text))
        )
      $body$
    $fn$;
  END IF;
END $$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "SUPER_ADMIN can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles and SUPER_ADMIN can view all" ON public.user_roles;
DROP POLICY IF EXISTS "Only SUPER_ADMIN can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only SUPER_ADMIN can write roles" ON public.user_roles;

CREATE POLICY "Only SUPER_ADMIN can read roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Only SUPER_ADMIN can write roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Ensure candidates has the requested candidate fields.
CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  age int,
  license text,
  stage text DEFAULT 'חדש',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS age int,
  ADD COLUMN IF NOT EXISTS license text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.candidates
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'stage'
      AND udt_name <> 'text'
  ) THEN
    ALTER TABLE public.candidates ALTER COLUMN stage DROP DEFAULT;
    ALTER TABLE public.candidates ALTER COLUMN stage TYPE text USING stage::text;
  END IF;
END $$;

ALTER TABLE public.candidates
  ALTER COLUMN stage SET DEFAULT 'חדש';

UPDATE public.candidates
SET name = COALESCE(
  NULLIF(name, ''),
  NULLIF(full_name->>'he', ''),
  NULLIF(full_name->>'am', ''),
  NULLIF(full_name->>'ru', ''),
  'מועמד ללא שם'
)
WHERE name IS NULL OR name = '';

UPDATE public.candidates
SET license = COALESCE(license, license_status::text)
WHERE license IS NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'license_status'
  );

ALTER TABLE public.candidates
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN phone SET NOT NULL;

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executives can delete candidates" ON public.candidates;
DROP POLICY IF EXISTS "Operations can create candidates" ON public.candidates;
DROP POLICY IF EXISTS "Operations can update candidates" ON public.candidates;
DROP POLICY IF EXISTS "Staff can view candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN can delete candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can create candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can update candidates" ON public.candidates;
DROP POLICY IF EXISTS "Authorized users can view candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can read candidates" ON public.candidates;
DROP POLICY IF EXISTS "VIEWER can read candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can insert candidates" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can update candidates rows" ON public.candidates;
DROP POLICY IF EXISTS "SUPER_ADMIN and OPERATOR can delete candidates rows" ON public.candidates;

CREATE POLICY "SUPER_ADMIN OPERATOR VIEWER can read candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'operator', 'viewer']));

CREATE POLICY "SUPER_ADMIN and OPERATOR can insert candidates"
ON public.candidates
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'operator']));

CREATE POLICY "SUPER_ADMIN and OPERATOR can update candidates rows"
ON public.candidates
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'operator']))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'operator']));

CREATE POLICY "SUPER_ADMIN and OPERATOR can delete candidates rows"
ON public.candidates
FOR DELETE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'operator']));