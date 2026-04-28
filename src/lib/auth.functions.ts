import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FirstAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(120),
  fullName: z.string().min(2).max(120),
});

const InviteSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  email: z.string().email(),
  password: z.string().min(8).max(120),
  role: z.enum(["operator", "viewer"]),
});

export const createFirstSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FirstAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: existingRole } = await supabaseAdmin.from("user_roles").select("id").limit(1).maybeSingle();
    if (existingRole) {
      return { ok: false, message: "כבר קיים מנהל ראשי במערכת. יש להתחבר או לבקש הזמנה." };
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (createError || !created.user) {
      return { ok: false, message: createError?.message ?? "לא ניתן ליצור מנהל ראשי." };
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: "super_admin",
    });

    if (roleError) {
      return { ok: false, message: roleError.message };
    }

    return { ok: true, message: "המנהל הראשי נוצר. אפשר להתחבר עכשיו." };
  });

export const inviteSystemUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !userData.user) {
      return { ok: false, message: "יש להתחבר כמנהל ראשי." };
    }

    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!role) {
      return { ok: false, message: "רק SUPER_ADMIN יכול להזמין משתמשים." };
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return { ok: false, message: createError?.message ?? "לא ניתן ליצור משתמש." };
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: data.role,
    });

    if (roleError) {
      return { ok: false, message: roleError.message };
    }

    return { ok: true, message: `המשתמש נוצר עם הרשאת ${data.role.toUpperCase()}.` };
  });