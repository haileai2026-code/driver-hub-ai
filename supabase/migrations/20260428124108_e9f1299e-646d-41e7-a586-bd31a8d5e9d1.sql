ALTER TABLE public.ai_recommendations ALTER COLUMN created_by_role SET DEFAULT 'operator'::public.app_role;
ALTER TABLE public.message_templates ALTER COLUMN role_owner SET DEFAULT 'operator'::public.app_role;

DROP POLICY IF EXISTS "Executives can delete AI recommendations" ON public.ai_recommendations;
DROP POLICY IF EXISTS "Operations can create AI recommendations" ON public.ai_recommendations;
DROP POLICY IF EXISTS "Staff can view AI recommendations" ON public.ai_recommendations;

CREATE POLICY "SUPER_ADMIN can delete AI recommendations"
ON public.ai_recommendations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "SUPER_ADMIN and OPERATOR can create AI recommendations"
ON public.ai_recommendations
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]));

CREATE POLICY "Authorized users can view AI recommendations"
ON public.ai_recommendations
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Executives can delete candidates" ON public.candidates;
DROP POLICY IF EXISTS "Operations can create candidates" ON public.candidates;
DROP POLICY IF EXISTS "Operations can update candidates" ON public.candidates;
DROP POLICY IF EXISTS "Staff can view candidates" ON public.candidates;

CREATE POLICY "SUPER_ADMIN can delete candidates"
ON public.candidates
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "SUPER_ADMIN and OPERATOR can create candidates"
ON public.candidates
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]));

CREATE POLICY "SUPER_ADMIN and OPERATOR can update candidates"
ON public.candidates
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]));

CREATE POLICY "Authorized users can view candidates"
ON public.candidates
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Finance leaders can manage company assets" ON public.company_assets;
DROP POLICY IF EXISTS "Finance leaders can view company assets" ON public.company_assets;

CREATE POLICY "SUPER_ADMIN can manage company assets"
ON public.company_assets
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Authorized users can view company assets"
ON public.company_assets
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Finance leaders can manage finance entries" ON public.finance_entries;
DROP POLICY IF EXISTS "Finance leaders can view finance entries" ON public.finance_entries;

CREATE POLICY "SUPER_ADMIN can manage finance entries"
ON public.finance_entries
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Authorized users can view finance entries"
ON public.finance_entries
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Operations can manage message templates" ON public.message_templates;
DROP POLICY IF EXISTS "Staff can view message templates" ON public.message_templates;

CREATE POLICY "SUPER_ADMIN and OPERATOR can manage message templates"
ON public.message_templates
FOR ALL
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]));

CREATE POLICY "Authorized users can view message templates"
ON public.message_templates
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Operations can manage operation logs" ON public.operation_logs;
DROP POLICY IF EXISTS "Staff can view operation logs" ON public.operation_logs;

CREATE POLICY "SUPER_ADMIN and OPERATOR can manage operation logs"
ON public.operation_logs
FOR ALL
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role]));

CREATE POLICY "Authorized users can view operation logs"
ON public.operation_logs
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::public.app_role, 'operator'::public.app_role, 'viewer'::public.app_role]));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "SUPER_ADMIN can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Users can view own roles and SUPER_ADMIN can view all"
ON public.user_roles
FOR SELECT
TO authenticated
USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));