import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GmailReminderSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  candidateName: z.string().trim().max(160).optional(),
  candidatePhone: z.string().trim().max(40).optional(),
});

type AppRole = "super_admin" | "operator" | "viewer";

const GMAIL_GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

async function getAuthorizedUser(accessToken: string, allowedRoles: AppRole[]) {
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !userData.user) {
    return { ok: false as const, message: "יש להתחבר עם משתמש מורשה." };
  }

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

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function callGmail<T>(path: string): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;

  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY is not configured");

  const response = await fetch(`${GMAIL_GATEWAY_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Gmail API call failed [${response.status}]: ${text}`);
  return JSON.parse(text) as T;
}

async function buildAmharicReminder(input: {
  subject: string;
  from: string;
  snippet: string;
  candidateName?: string;
  candidatePhone?: string;
}) {
  const fallbackName = input.candidateName || "አሽከርካሪው";
  const fallback = `ሰላም ${fallbackName}, እባክዎ የተላከውን መልዕክት ይመልከቱ እና ዛሬ በWhatsApp ምላሽ ይስጡ።`;
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return fallback;

  const prompt = [
    "Create a short WhatsApp reminder in Amharic for a driver.",
    "Use simple respectful language, one or two sentences only.",
    "Do not invent facts. Base it on the Gmail message context.",
    `Driver name: ${input.candidateName || "unknown"}`,
    `Driver phone: ${input.candidatePhone || "unknown"}`,
    `Email from: ${input.from}`,
    `Email subject: ${input.subject}`,
    `Email snippet: ${input.snippet}`,
  ].join("\n");

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Return only the Amharic WhatsApp text." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) return fallback;
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export const generateGmailWhatsAppReminder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GmailReminderSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    try {
      const list = await callGmail<{ messages?: Array<{ id: string }> }>(
        "/users/me/messages?maxResults=1&q=in:inbox newer_than:7d",
      );
      const messageId = list.messages?.[0]?.id;
      if (!messageId) {
        return { ok: false as const, message: "לא נמצאה הודעת Gmail חדשה ליצירת תזכורת." };
      }

      const message = await callGmail<{
        snippet?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      }>(`/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);

      const headers = message.payload?.headers;
      const subject = headerValue(headers, "Subject") || "ללא נושא";
      const from = headerValue(headers, "From") || "Gmail";
      const snippet = message.snippet || "";
      const reminder = await buildAmharicReminder({
        subject,
        from,
        snippet,
        candidateName: data.candidateName,
        candidatePhone: data.candidatePhone,
      });

      return {
        ok: true as const,
        message: "נוצרה תזכורת WhatsApp באמהרית מהודעת Gmail האחרונה.",
        reminder,
        email: { from, subject, snippet },
      };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "חיבור Gmail נכשל.",
      };
    }
  });