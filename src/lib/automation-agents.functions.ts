import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSavedBenyTelegramChatId } from "@/lib/app-settings.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

type AppRole = "super_admin" | "operator" | "viewer";

export type AutomationAgentStatus = {
  key:
    | "gmail"
    | "calendar"
    | "docs"
    | "sheets"
    | "drive"
    | "meta_whatsapp"
    | "haile_ai"
    | "slack"
    | "telegram";
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
  let digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
  return digits;
}

function isValidE164Phone(digits: string): boolean {
  return /^[1-9]\d{7,14}$/.test(digits);
}

function isValidTelegramChatId(value: string): boolean {
  // Telegram chat_id must be a numeric ID (positive for users, negative for groups/channels).
  // Usernames like "@bot" or phone numbers are NOT valid for sendMessage.
  return /^-?\d{4,}$/.test(value.trim());
}

function friendlyWhatsAppError(raw: string): string {
  if (/133010/.test(raw)) return "המספר אינו רשום ב-WhatsApp או לא אושר כנמען בסביבת הבדיקה של Meta.";
  if (/Authentication|OAuthException|expired|invalid token/i.test(raw))
    return "WHATSAPP_ACCESS_TOKEN פג תוקף או לא תקין. צור טוקן חדש ב-Meta Business.";
  if (/recipient phone number not in allowed list/i.test(raw))
    return "המספר לא אושר כנמען. הוסף אותו ב-WhatsApp Manager → API Setup → To.";
  return raw;
}

function friendlyTelegramError(raw: string): string {
  if (/chat not found/i.test(raw))
    return "Chat ID לא נמצא. השתמש ב-chat_id מספרי (לא username/טלפון). שלח /start לבוט וקח את chat.id מ-getUpdates.";
  if (/bot was blocked/i.test(raw)) return "המשתמש חסם את הבוט בטלגרם.";
  if (/unauthorized/i.test(raw)) return "TELEGRAM_API_KEY לא תקין.";
  return raw;
}

async function verifyConnector(connectorApiKey: string | undefined): Promise<{
  ready: boolean;
  detail: string;
  latencyMs?: number;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return { ready: false, detail: "LOVABLE_API_KEY חסר." };
  if (!connectorApiKey) return { ready: false, detail: "החיבור לא מקושר לפרויקט." };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectorApiKey,
      },
    });
    const json = (await res.json().catch(() => ({}))) as {
      outcome?: string;
      latency_ms?: number;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return { ready: false, detail: json.message ?? `שגיאת gateway (${res.status}).` };
    }
    if (json.outcome === "verified") {
      return { ready: true, detail: "מאומת דרך Connector Gateway.", latencyMs: json.latency_ms };
    }
    if (json.outcome === "skipped") {
      return { ready: true, detail: "מחובר (ללא בדיקת אימות).", latencyMs: json.latency_ms };
    }
    return { ready: false, detail: json.error ?? "אימות נכשל." };
  } catch (err) {
    return {
      ready: false,
      detail: err instanceof Error ? err.message : "שגיאה לא ידועה בבדיקת חיבור.",
    };
  }
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

export const checkAutomationAgents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok)
      return { ok: false as const, message: auth.message, statuses: [] as AutomationAgentStatus[] };

    // Verify Google connectors and Slack/Telegram in parallel via gateway.
    const [gmail, calendar, docs, sheets, drive, slack, telegram] = await Promise.all([
      verifyConnector(process.env.GOOGLE_MAIL_API_KEY),
      verifyConnector(process.env.GOOGLE_CALENDAR_API_KEY),
      verifyConnector(process.env.GOOGLE_DOCS_API_KEY),
      verifyConnector(process.env.GOOGLE_SHEETS_API_KEY),
      verifyConnector(process.env.GOOGLE_DRIVE_API_KEY),
      verifyConnector(process.env.SLACK_API_KEY),
      verifyConnector(process.env.TELEGRAM_API_KEY),
    ]);

    const statuses: AutomationAgentStatus[] = [
      { key: "gmail", label: "Gmail / SOL", ...gmail },
      { key: "calendar", label: "Google Calendar / SOL", ...calendar },
      { key: "docs", label: "Google Docs", ...docs },
      { key: "sheets", label: "Google Sheets", ...sheets },
      { key: "drive", label: "Google Drive", ...drive },
      { key: "slack", label: "Slack (התראות צוות)", ...slack },
      { key: "telegram", label: "Telegram (התראות בני)", ...telegram },
      metaWhatsAppStatus(),
      {
        key: "haile_ai",
        label: "Haile AI Gateway",
        ready: Boolean(process.env.LOVABLE_API_KEY),
        detail: process.env.LOVABLE_API_KEY ? "מודל AI זמין להפעלה." : "חיבור AI חסר.",
      },
    ];

    return { ok: true as const, message: "בדיקת סוכנים הושלמה.", statuses };
  });

const TestNotificationSchema = AccessTokenSchema.extend({
  channel: z.enum(["slack", "telegram", "whatsapp"]),
  target: z.string().trim().max(200).default(""),
  message: z.string().trim().min(1).max(2000),
});

async function logIntegrationEvent(params: {
  channel: string;
  target: string;
  message: string;
  status: "sent" | "failed";
  error?: string;
}) {
  await supabaseAdmin.from("operation_logs").insert({
    candidate_id: null,
    operator_name: `Integration:${params.channel}`,
    interaction_type: `integration_test_${params.status}`,
    notes_hebrew: `[${params.status === "sent" ? "נשלח" : "נכשל"} ${new Date().toISOString()}] ערוץ ${params.channel} → ${params.target}${
      params.error ? ` | ${params.error}` : ""
    }`,
    translated_hebrew: params.message,
    source_message: params.message,
    follow_up_required: params.status === "failed",
  });
}

export const sendTestNotification = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TestNotificationSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const lovableKey = process.env.LOVABLE_API_KEY;

    try {
      if (data.channel === "slack") {
        const slackKey = process.env.SLACK_API_KEY;
        if (!lovableKey || !slackKey)
          throw new Error("Slack לא מחובר.");
        const res = await fetch(
          "https://connector-gateway.lovable.dev/slack/api/chat.postMessage",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": slackKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel: data.target, text: data.message }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false)
          throw new Error(json.error ?? `Slack שגיאה ${res.status}`);
        await logIntegrationEvent({
          channel: "slack",
          target: data.target,
          message: data.message,
          status: "sent",
        });
        return { ok: true as const, message: `הודעה נשלחה ל-Slack (${data.target}).` };
      }

      if (data.channel === "telegram") {
        const tgKey = process.env.TELEGRAM_API_KEY;
        if (!lovableKey || !tgKey) throw new Error("Telegram לא מחובר.");
        const chatId = data.target.trim() || (await getSavedBenyTelegramChatId());
        if (!chatId)
          throw new Error("לא הוגדר Telegram Chat ID. הזן יעד או שמור Chat ID בהגדרות פרופיל מנכ״ל.");
        const res = await fetch(
          "https://connector-gateway.lovable.dev/telegram/sendMessage",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": tgKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ chat_id: chatId, text: data.message }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          description?: string;
        };
        if (!res.ok || json.ok === false)
          throw new Error(json.description ?? `Telegram שגיאה ${res.status}`);
        await logIntegrationEvent({
          channel: "telegram",
          target: chatId,
          message: data.message,
          status: "sent",
        });
        return { ok: true as const, message: `הודעה נשלחה ל-Telegram (${chatId}).` };
      }

      // whatsapp
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneId) throw new Error("WhatsApp לא מחובר.");
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizeMetaPhone(data.target),
            type: "text",
            text: { body: data.message },
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        messages?: Array<{ id: string }>;
      };
      if (!res.ok)
        throw new Error(json.error?.message ?? `WhatsApp שגיאה ${res.status}`);
      await logIntegrationEvent({
        channel: "whatsapp",
        target: data.target,
        message: data.message,
        status: "sent",
      });
      return {
        ok: true as const,
        message: `הודעה נשלחה ב-WhatsApp (msg id: ${json.messages?.[0]?.id ?? ""}).`,
      };
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[automation-agents] sendTestNotification failed:", rawMsg);
      await logIntegrationEvent({
        channel: data.channel,
        target: data.target,
        message: data.message,
        status: "failed",
        error: rawMsg,
      });
      return { ok: false as const, message: "שליחת ההודעה נכשלה. בדקו את הגדרות הערוץ ונסו שוב." };
    }
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

    if (error) {
      console.error("[automation-agents] candidates query failed", error);
      return { ok: false as const, message: "טעינת מועמדים נכשלה. אנא נסה שוב.", sent: 0, skipped: 0 };
    }

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

      const sentAt = new Date().toISOString();
      const responseJson = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (response.ok) {
        sent += 1;
        const messageId = responseJson.messages?.[0]?.id ?? "";
        await supabaseAdmin.from("operation_logs").insert({
          candidate_id: candidate.id,
          operator_name: "WhatsApp Automation Agent",
          interaction_type: "whatsapp_reminder_sent",
          notes_hebrew: `[נשלח ${sentAt}] ${body}${messageId ? ` (msg id: ${messageId})` : ""}`,
          translated_hebrew: body,
          source_message: body,
          follow_up_required: true,
        });
        await supabaseAdmin
          .from("candidates")
          .update({ last_contacted_at: sentAt })
          .eq("id", candidate.id);
      } else {
        skipped += 1;
        const errMsg = responseJson?.error?.message ?? `HTTP ${response.status}`;
        await supabaseAdmin.from("operation_logs").insert({
          candidate_id: candidate.id,
          operator_name: "WhatsApp Automation Agent",
          interaction_type: "whatsapp_reminder_failed",
          notes_hebrew: `[נכשל ${sentAt}] ${errMsg} | ${body}`,
          translated_hebrew: body,
          source_message: body,
          follow_up_required: true,
        });
      }
    }

    return {
      ok: true as const,
      message: `נשלחו ${sent} תזכורות WhatsApp. דולגו ${skipped}.`,
      sent,
      skipped,
    };
  });

export type IntegrationFailure = {
  id: string;
  channel: "slack" | "telegram" | "whatsapp" | "other";
  target: string;
  message: string;
  error: string;
  createdAt: string;
};

function parseIntegrationFailureRow(row: {
  id: string;
  operator_name: string | null;
  notes_hebrew: string | null;
  translated_hebrew: string | null;
  source_message: string | null;
  created_at: string;
}): IntegrationFailure {
  const channelRaw = (row.operator_name ?? "").replace(/^Integration:/, "").trim();
  const channel: IntegrationFailure["channel"] =
    channelRaw === "slack" || channelRaw === "telegram" || channelRaw === "whatsapp"
      ? channelRaw
      : "other";
  const notes = row.notes_hebrew ?? "";
  // notes format: [נכשל <iso>] ערוץ <ch> → <target> | <error>
  const arrowIdx = notes.indexOf("→");
  let target = "";
  let error = "";
  if (arrowIdx >= 0) {
    const tail = notes.slice(arrowIdx + 1).trim();
    const pipeIdx = tail.indexOf("|");
    if (pipeIdx >= 0) {
      target = tail.slice(0, pipeIdx).trim();
      error = tail.slice(pipeIdx + 1).trim();
    } else {
      target = tail;
    }
  }
  return {
    id: row.id,
    channel,
    target,
    message: row.translated_hebrew ?? row.source_message ?? "",
    error: error || "שגיאה לא מתועדת.",
    createdAt: row.created_at,
  };
}

export const getRecentIntegrationFailures = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, failures: [] };

    const { data: rows, error } = await supabaseAdmin
      .from("operation_logs")
      .select("id,operator_name,notes_hebrew,translated_hebrew,source_message,created_at,interaction_type")
      .in("interaction_type", [
        "integration_test_failed",
        "whatsapp_reminder_failed",
        "whatsapp_status_failed",
        "whatsapp_reply_failed",
      ])
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[automation-agents] failures query failed", error);
      return { ok: false as const, message: "טעינת השגיאות נכשלה. אנא נסה שוב.", failures: [] };
    }

    const failures = (rows ?? []).map(parseIntegrationFailureRow);
    return { ok: true as const, failures };
  });
