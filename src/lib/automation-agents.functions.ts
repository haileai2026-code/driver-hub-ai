import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

type AppRole = "super_admin" | "operator" | "viewer";

export type AutomationAgentStatus = {
  key: "gmail" | "calendar" | "docs" | "sheets" | "drive" | "meta_whatsapp" | "haile_ai";
  label: string;
  ready: boolean;
  detail: string;
  latencyMs?: number;
};

const VERIFY_URL = "https://connector-gateway.lovable.dev/api/v1/verify_credentials";
const META_API_VERSION = "v21.0";

async function getAuthorizedUser(accessToken: string, allowedRoles: AppRole[]) {
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !userData.user)
    return { ok: false as const, message: "יש להתחבר עם משתמש מורשה." };

  const { data: roleRow, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const role = roleRow?.role as AppRole | undefined;
  if (roleError || !role || !allowedRoles.includes(role)) {
    return { ok: false as const, message: "למשתמש הזה אין הרשאה לפעולה." };
  }

  return { ok: true as const, userId: userData.user.id, role };
}

function normalizeMetaPhone(phone: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function metaWhatsAppStatus(): AutomationAgentStatus {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneId) {
    return {
      key: "meta_whatsapp",
      label: "Meta WhatsApp Cloud API",
      ready: true,
      detail: "מחובר דרך Meta Cloud API.",
    };
  }
  return {
    key: "meta_whatsapp",
    label: "Meta WhatsApp Cloud API",
    ready: false,
    detail: "חסרים WHATSAPP_ACCESS_TOKEN או WHATSAPP_PHONE_NUMBER_ID.",
  };
}

function hasMissingDocuments(documents: unknown) {
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) return true;
  const record = documents as Record<string, { received?: boolean } | undefined>;
  return !record.id?.received || !(record.green_form ?? record.green)?.received;
}

function checkConnection(
  key: string | undefined,
  label: string,
  statusKey: AutomationAgentStatus["key"],
): AutomationAgentStatus {
  if (key) {
    return { key: statusKey, label, ready: true, detail: "מחובר." };
  }
  return { key: statusKey, label, ready: false, detail: "החיבור לא מקושר לפרויקט." };
}

export const checkAutomationAgents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok)
      return { ok: false as const, message: auth.message, statuses: [] as AutomationAgentStatus[] };

    const statuses: AutomationAgentStatus[] = [
      checkConnection(process.env.GOOGLE_MAIL_API_KEY, "Gmail / SOL", "gmail"),
      checkConnection(process.env.GOOGLE_CALENDAR_API_KEY, "Google Calendar / SOL", "calendar"),
      checkConnection(process.env.GOOGLE_DOCS_API_KEY, "Google Docs", "docs"),
      checkConnection(process.env.GOOGLE_SHEETS_API_KEY, "Google Sheets", "sheets"),
      checkConnection(process.env.GOOGLE_DRIVE_API_KEY, "Google Drive", "drive"),
    ];

    statuses.push(metaWhatsAppStatus());

    statuses.push({
      key: "haile_ai",
      label: "Haile AI Gateway",
      ready: Boolean(process.env.LOVABLE_API_KEY),
      detail: process.env.LOVABLE_API_KEY ? "מודל AI זמין להפעלה." : "חיבור AI חסר.",
    });

    return { ok: true as const, message: "בדיקת סוכנים הושלמה.", statuses };
  });

export const sendMissingDocsWhatsAppReminders = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, sent: 0, skipped: 0 };

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return {
        ok: false as const,
        message: "Meta WhatsApp Cloud API עדיין לא מחובר במלואו להפעלה.",
        sent: 0,
        skipped: 0,
      };
    }

    const { data: candidates, error } = await supabaseAdmin
      .from("candidates")
      .select("id,name,phone,documents,preferred_language")
      .neq("stage", "Placed")
      .limit(50);

    if (error) return { ok: false as const, message: error.message, sent: 0, skipped: 0 };

    let sent = 0;
    let skipped = 0;
    for (const candidate of candidates ?? []) {
      if (!hasMissingDocuments(candidate.documents)) {
        skipped += 1;
        continue;
      }

      if (!candidate.phone) {
        skipped += 1;
        continue;
      }

      const body = `שלום ${candidate.name}, חסרים לנו עדיין מסמכים לפתיחת התהליך. נא לשלוח היום צילום תעודת זהות וטופס ירוק ב-WhatsApp. תודה, היילה AI`;
      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizeMetaPhone(candidate.phone),
            type: "text",
            text: { body },
          }),
        },
      );

      if (response.ok) {
        sent += 1;
        await supabaseAdmin.from("operation_logs").insert({
          candidate_id: candidate.id,
          operator_name: "WhatsApp Automation Agent",
          interaction_type: "whatsapp_reminder",
          notes_hebrew: body,
          translated_hebrew: body,
          source_message: body,
          follow_up_required: true,
        });
        await supabaseAdmin
          .from("candidates")
          .update({ last_contacted_at: new Date().toISOString() })
          .eq("id", candidate.id);
      } else {
        skipped += 1;
      }
    }

    return {
      ok: true as const,
      message: `נשלחו ${sent} תזכורות WhatsApp. דולגו ${skipped}.`,
      sent,
      skipped,
    };
  });
