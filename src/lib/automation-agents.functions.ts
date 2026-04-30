import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

type AppRole = "super_admin" | "operator" | "viewer";

export type AutomationAgentStatus = {
  key: "gmail" | "calendar" | "docs" | "sheets" | "drive" | "twilio_whatsapp" | "haile_ai";
  label: string;
  ready: boolean;
  detail: string;
  latencyMs?: number;
};

const VERIFY_URL = "https://connector-gateway.lovable.dev/api/v1/verify_credentials";
const TWILIO_GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

async function getAuthorizedUser(accessToken: string, allowedRoles: AppRole[]) {
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !userData.user) return { ok: false as const, message: "יש להתחבר עם משתמש מורשה." };

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

function normalizeWhatsAppPhone(phone: string) {
  const cleaned = phone.replace(/[^+\d]/g, "");
  if (cleaned.startsWith("+")) return `whatsapp:${cleaned}`;
  if (cleaned.startsWith("0")) return `whatsapp:+972${cleaned.slice(1)}`;
  return `whatsapp:${cleaned}`;
}

function twilioFromNumber() {
  const from = process.env.TWILIO_WHATSAPP_FROM ?? process.env.TWILIO_FROM_WHATSAPP ?? "";
  if (!from) return "";
  return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

function hasMissingDocuments(documents: unknown) {
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) return true;
  const record = documents as Record<string, { received?: boolean } | undefined>;
  return !record.id?.received || !(record.green_form ?? record.green)?.received;
}

async function verifyConnection(key: string | undefined, label: string, statusKey: AutomationAgentStatus["key"]) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return { key: statusKey, label, ready: false, detail: "LOVABLE_API_KEY חסר." };
  if (!key) return { key: statusKey, label, ready: false, detail: "החיבור לא מקושר לפרויקט." };

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": key,
      },
    });
    const json = (await response.json()) as { outcome?: string; latency_ms?: number; error?: string };
    return {
      key: statusKey,
      label,
      ready: response.ok && (json.outcome === "verified" || json.outcome === "skipped"),
      detail: response.ok ? `סטטוס: ${json.outcome ?? "verified"}` : json.error ?? "בדיקת החיבור נכשלה.",
      latencyMs: json.latency_ms,
    };
  } catch {
    return { key: statusKey, label, ready: false, detail: "לא ניתן לבדוק את החיבור כרגע." };
  }
}

export const checkAutomationAgents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, statuses: [] as AutomationAgentStatus[] };

    const statuses = await Promise.all([
      verifyConnection(process.env.GOOGLE_MAIL_API_KEY, "Gmail / SOL", "gmail"),
      verifyConnection(process.env.GOOGLE_CALENDAR_API_KEY, "Google Calendar / SOL", "calendar"),
      verifyConnection(process.env.GOOGLE_DOCS_API_KEY, "Google Docs", "docs"),
      verifyConnection(process.env.GOOGLE_SHEETS_API_KEY, "Google Sheets", "sheets"),
      verifyConnection(process.env.GOOGLE_DRIVE_API_KEY, "Google Drive", "drive"),
      verifyConnection(process.env.TWILIO_API_KEY, "Twilio WhatsApp", "twilio_whatsapp"),
    ]);

    statuses.push({
      key: "haile_ai",
      label: "Haile AI Gateway",
      ready: Boolean(process.env.LOVABLE_API_KEY),
      detail: process.env.LOVABLE_API_KEY ? "מודל AI זמין להפעלה." : "חיבור AI חסר.",
    });

    const twilio = statuses.find((status) => status.key === "twilio_whatsapp");
    if (twilio?.ready && !twilioFromNumber()) {
      twilio.ready = false;
      twilio.detail = "Twilio מחובר, אבל חסר מספר שולח TWILIO_WHATSAPP_FROM.";
    }

    return { ok: true as const, message: "בדיקת סוכנים הושלמה.", statuses };
  });

export const sendMissingDocsWhatsAppReminders = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, sent: 0, skipped: 0 };

    const lovableKey = process.env.LOVABLE_API_KEY;
    const twilioKey = process.env.TWILIO_API_KEY;
    const from = twilioFromNumber();
    if (!lovableKey || !twilioKey || !from) {
      return { ok: false as const, message: "Twilio WhatsApp עדיין לא מחובר במלואו להפעלה.", sent: 0, skipped: 0 };
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

      const body = `שלום ${candidate.name}, חסרים לנו עדיין מסמכים לפתיחת התהליך. נא לשלוח היום צילום תעודת זהות וטופס ירוק ב-WhatsApp. תודה, היילה AI`;
      const response = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": twilioKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: normalizeWhatsAppPhone(candidate.phone), From: from, Body: body }),
      });

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
        await supabaseAdmin.from("candidates").update({ last_contacted_at: new Date().toISOString() }).eq("id", candidate.id);
      } else {
        skipped += 1;
      }
    }

    return { ok: true as const, message: `נשלחו ${sent} תזכורות WhatsApp. דולגו ${skipped}.`, sent, skipped };
  });