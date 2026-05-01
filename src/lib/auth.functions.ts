import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FirstAdminInputSchema = z.object({
  email: z.string().trim().max(255).catch(""),
  password: z.string().max(120).catch(""),
  fullName: z.string().trim().max(120).catch(""),
});

const FirstAdminSchema = z.object({
  email: z.string().trim().email("כתובת אימייל לא תקינה."),
  password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים.").max(120),
  fullName: z.string().trim().min(2, "שם מלא חייב להכיל לפחות 2 תווים.").max(120),
});

const InviteInputSchema = z.object({
  accessToken: z.string().max(5000).catch(""),
  email: z.string().trim().max(255).catch(""),
  password: z.string().max(120).catch(""),
  role: z.enum(["operator", "viewer"]).catch("operator"),
});

const InviteSchema = z.object({
  accessToken: z.string().min(20, "יש להתחבר כמנהל ראשי.").max(5000),
  email: z.string().trim().email("כתובת אימייל לא תקינה."),
  password: z.string().min(8, "סיסמה זמנית חייבת להכיל לפחות 8 תווים.").max(120),
  role: z.enum(["operator", "viewer"]),
});

export const createFirstSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FirstAdminInputSchema.parse(input))
  .handler(async ({ data }) => {
    const parsed = FirstAdminSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "יש לבדוק את פרטי המנהל." };
    }

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
      console.error("[createFirstSuperAdmin] createUser failed", createError);
      return { ok: false, message: "לא ניתן ליצור מנהל ראשי." };
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: "super_admin",
    });

    if (roleError) {
      console.error("[createFirstSuperAdmin] role insert failed", roleError);
      return { ok: false, message: "לא ניתן ליצור מנהל ראשי." };
    }

    return { ok: true, message: "המנהל הראשי נוצר. אפשר להתחבר עכשיו." };
  });

export const inviteSystemUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InviteInputSchema.parse(input))
  .handler(async ({ data }) => {
    const parsed = InviteSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "יש לבדוק את פרטי ההזמנה." };
    }

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
      console.error("[inviteSystemUser] createUser failed", createError);
      return { ok: false, message: "לא ניתן ליצור משתמש." };
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role: data.role,
    });

    if (roleError) {
      console.error("[inviteSystemUser] role insert failed", roleError);
      return { ok: false, message: "לא ניתן להקצות הרשאה." };
    }

    return { ok: true, message: `המשתמש נוצר עם הרשאת ${data.role.toUpperCase()}.` };
  });