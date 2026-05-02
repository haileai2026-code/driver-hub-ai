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

async function callGmail<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;

  if (!lovableKey || !gmailKey) {
    console.error("[google-agent] Missing Gmail gateway configuration");
    throw new Error("Gmail service unavailable");
  }

  const response = await fetch(`${GMAIL_GATEWAY_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[google-agent] Gmail API call failed [${response.status}]: ${text}`);
    throw new Error("Gmail request failed");
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
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
      console.error("[google-agent] generateGmailWhatsAppReminder failed:", error);
      return { ok: false as const, message: "חיבור Gmail נכשל." };
    }
  });
// =============================================================================
// SOL Gmail Integration: search candidate emails, draft follow-up, create draft
// =============================================================================

export type CandidateEmail = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  webLink: string;
};

const SearchEmailsSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  candidateName: z.string().trim().max(160).optional(),
  candidatePhone: z.string().trim().max(40).optional(),
  candidateEmail: z.string().trim().max(200).optional(),
  maxResults: z.number().int().min(1).max(10).optional(),
});

function buildCandidateQuery(input: {
  candidateName?: string;
  candidatePhone?: string;
  candidateEmail?: string;
}) {
  const terms: string[] = [];
  if (input.candidateEmail) terms.push(`"${input.candidateEmail}"`);
  if (input.candidatePhone) {
    const digits = input.candidatePhone.replace(/[^\d]/g, "");
    if (digits.length >= 6) terms.push(`"${digits.slice(-9)}"`);
  }
  if (input.candidateName) {
    const cleaned = input.candidateName.trim().replace(/"/g, "");
    if (cleaned) terms.push(`"${cleaned}"`);
  }
  if (terms.length === 0) return "";
  return terms.join(" OR ");
}

export const searchCandidateEmails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchEmailsSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, emails: [] as CandidateEmail[] };

    const query = buildCandidateQuery(data);
    if (!query) {
      return { ok: false as const, message: "חסרים פרטי מועמד לחיפוש.", emails: [] };
    }

    const max = data.maxResults ?? 3;
    try {
      const list = await callGmail<{ messages?: Array<{ id: string; threadId: string }> }>(
        `/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`,
      );
      const ids = list.messages ?? [];
      if (ids.length === 0) return { ok: true as const, emails: [] };

      const emails = await Promise.all(
        ids.map(async (m) => {
          const msg = await callGmail<{
            id: string;
            threadId: string;
            snippet?: string;
            internalDate?: string;
            payload?: { headers?: Array<{ name?: string; value?: string }> };
          }>(
            `/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          );
          const headers = msg.payload?.headers;
          const dateHeader = headerValue(headers, "Date");
          const internal = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : "";
          return {
            id: msg.id,
            threadId: msg.threadId,
            from: headerValue(headers, "From"),
            to: headerValue(headers, "To"),
            subject: headerValue(headers, "Subject") || "(ללא נושא)",
            snippet: msg.snippet ?? "",
            date: dateHeader || internal,
            webLink: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
          } satisfies CandidateEmail;
        }),
      );

      return { ok: true as const, emails };
    } catch (error) {
      console.error("[google-agent] searchCandidateEmails failed:", error);
      return { ok: false as const, message: "חיפוש Gmail נכשל.", emails: [] };
    }
  });

const DraftFollowUpSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  candidateName: z.string().trim().min(1).max(160),
  candidatePhone: z.string().trim().max(40).optional(),
  candidateEmail: z.string().trim().email().optional(),
  candidateCity: z.string().trim().max(80).optional(),
  candidateStage: z.string().trim().max(80).optional(),
  candidateLicense: z.string().trim().max(80).optional(),
  candidateLanguage: z.enum(["he", "am", "ru"]).optional(),
  recentEmailContext: z.string().trim().max(2000).optional(),
});

function fallbackFollowUpDraft(input: {
  candidateName: string;
  candidateStage?: string;
  candidateLicense?: string;
}) {
  const subject = `מעקב מ-Haile AI — ${input.candidateName}`;
  const body = [
    `שלום ${input.candidateName},`,
    "",
    `אנו ממשיכים את התהליך מולך${input.candidateStage ? ` בשלב ${input.candidateStage}` : ""}.`,
    input.candidateLicense ? `סטטוס רישיון נוכחי: ${input.candidateLicense}.` : "",
    "נשמח לעדכון קצר מצדך, ואם יש מסמכים חסרים — נא לשלוח עד מחר.",
    "",
    "תודה,",
    "צוות Haile AI",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, body };
}

export const draftCandidateFollowUpEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DraftFollowUpSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok)
      return { ok: false as const, message: auth.message, subject: "", body: "" };

    const fallback = fallbackFollowUpDraft({
      candidateName: data.candidateName,
      candidateStage: data.candidateStage,
      candidateLicense: data.candidateLicense,
    });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: true as const, ...fallback };

    const lang = data.candidateLanguage ?? "he";
    const langLabel = lang === "am" ? "Amharic" : lang === "ru" ? "Russian" : "Hebrew";
    const prompt = [
      `Draft a short, polite follow-up email to a driver candidate in ${langLabel}.`,
      "Tone: warm, professional, action-oriented. 4-7 sentences max.",
      "Do not invent facts. Reference the candidate stage and any context provided.",
      `Candidate name: ${data.candidateName}`,
      data.candidatePhone ? `Phone: ${data.candidatePhone}` : "",
      data.candidateEmail ? `Email: ${data.candidateEmail}` : "",
      data.candidateCity ? `City: ${data.candidateCity}` : "",
      data.candidateStage ? `Stage: ${data.candidateStage}` : "",
      data.candidateLicense ? `License status: ${data.candidateLicense}` : "",
      data.recentEmailContext ? `Recent email context:\n${data.recentEmailContext}` : "",
      "",
      'Return JSON ONLY with shape {"subject": "...", "body": "..."}. No code fences.',
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You write follow-up emails for a driver recruitment company (Haile AI). Return strict JSON." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) return { ok: true as const, ...fallback };
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      try {
        const parsed = JSON.parse(cleaned) as { subject?: string; body?: string };
        return {
          ok: true as const,
          subject: (parsed.subject || fallback.subject).slice(0, 200),
          body: parsed.body || fallback.body,
        };
      } catch {
        return { ok: true as const, subject: fallback.subject, body: cleaned || fallback.body };
      }
    } catch {
      return { ok: true as const, ...fallback };
    }
  });

const CreateDraftSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
});

function encodeBase64Url(input: string) {
  // Use Buffer (Node-compatible in Worker runtime via nodejs_compat)
  const b64 = Buffer.from(input, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRfc2822(to: string, subject: string, body: string) {
  // Encode subject as RFC 2047 to support UTF-8 (Hebrew/Amharic).
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  return [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64"),
  ].join("\r\n");
}

export const createGmailDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateDraftSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    try {
      const raw = encodeBase64Url(buildRfc2822(data.to, data.subject, data.body));
      const draft = await callGmail<{ id: string; message?: { id: string; threadId?: string } }>(
        "/users/me/drafts",
        { method: "POST", body: { message: { raw } } },
      );
      const threadId = draft.message?.threadId ?? draft.message?.id ?? "";
      const draftLink = threadId
        ? `https://mail.google.com/mail/u/0/#drafts/${threadId}`
        : "https://mail.google.com/mail/u/0/#drafts";
      return {
        ok: true as const,
        message: "טיוטה נוצרה ב-Gmail.",
        draftId: draft.id,
        draftLink,
      };
    } catch (error) {
      console.error("[google-agent] createGmailDraft failed:", error);
      return { ok: false as const, message: "יצירת טיוטה ב-Gmail נכשלה." };
    }
  });
