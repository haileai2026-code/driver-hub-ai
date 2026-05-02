import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

const SaveSettingsSchema = AccessTokenSchema.extend({
  benyWhatsapp: z.string().trim().max(40),
  benyTelegramChatId: z.string().trim().max(40).default(""),
  morningSummaryTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "פורמט שעה לא תקין (HH:MM).")
    .default("08:00"),
  morningSummaryEnabled: z.boolean().default(true),
});

async function requireSuperAdmin(accessToken: string) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !userData.user) {
    return { ok: false as const, message: "יש להתחבר עם מנהל ראשי." };
  }
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (!roleRow) {
    return { ok: false as const, message: "רק SUPER_ADMIN יכול לנהל הגדרות." };
  }
  return { ok: true as const, userId: userData.user.id };
}

export const getAppSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireSuperAdmin(data.accessToken);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { data: rows, error } = await supabaseAdmin
      .from("app_settings")
      .select("key,value,updated_at")
      .in("key", ["beny_whatsapp", "beny_telegram", "morning_summary"]);

    if (error) return { ok: false as const, message: error.message };

    const map = new Map(rows?.map((r) => [r.key, r]) ?? []);
    const beny = (map.get("beny_whatsapp")?.value ?? {}) as { phone?: string };
    const telegram = (map.get("beny_telegram")?.value ?? {}) as { chat_id?: string };
    const summary = (map.get("morning_summary")?.value ?? {}) as {
      time_il?: string;
      enabled?: boolean;
    };

    return {
      ok: true as const,
      settings: {
        benyWhatsapp: beny.phone ?? "",
        benyTelegramChatId: telegram.chat_id ?? "",
        morningSummaryTime: summary.time_il ?? "08:00",
        morningSummaryEnabled: summary.enabled ?? true,
        updatedAt:
          map.get("beny_whatsapp")?.updated_at ??
          map.get("beny_telegram")?.updated_at ??
          map.get("morning_summary")?.updated_at ??
          null,
      },
    };
  });

export const saveAppSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveSettingsSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await requireSuperAdmin(data.accessToken);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const updates = [
      {
        key: "beny_whatsapp",
        value: { phone: data.benyWhatsapp.replace(/[^\d+]/g, "") },
      },
      {
        key: "beny_telegram",
        value: { chat_id: data.benyTelegramChatId.replace(/[^\d-]/g, "") },
      },
      {
        key: "morning_summary",
        value: {
          time_il: data.morningSummaryTime,
          enabled: data.morningSummaryEnabled,
        },
      },
    ];

    for (const row of updates) {
      const { error } = await supabaseAdmin
        .from("app_settings")
        .upsert(row, { onConflict: "key" });
      if (error) return { ok: false as const, message: error.message };
    }

    return { ok: true as const, message: "ההגדרות נשמרו." };
  });
