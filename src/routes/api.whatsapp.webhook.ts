import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/whatsapp.server";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
// WhatsApp sends the sender phone in E.164 without "+": 0548739473 → 972548739473
const BENY_PHONE = "972548739473";

interface WaWebhookBody {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          id: string;
          timestamp?: string;
        }>;
        statuses?: Array<{
          id: string;
          status: string; // sent | delivered | read | failed
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta webhook verification handshake
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (!VERIFY_TOKEN) {
          console.error("WHATSAPP_VERIFY_TOKEN not configured");
          return new Response("Forbidden", { status: 403 });
        }
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }: { request: Request }) => {
        try {
          if (!APP_SECRET) {
            console.error("WHATSAPP_APP_SECRET not configured");
            return new Response("Forbidden", { status: 403 });
          }
          const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
          const rawBody = await request.text();
          const expected =
            "sha256=" +
            createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
          const sigBuf = Buffer.from(sigHeader);
          const expBuf = Buffer.from(expected);
          if (
            sigBuf.length !== expBuf.length ||
            !timingSafeEqual(sigBuf, expBuf)
          ) {
            return new Response("Forbidden", { status: 403 });
          }
          const body = JSON.parse(rawBody) as WaWebhookBody;
          const value = body.entry?.[0]?.changes?.[0]?.value;

          // Handle delivery status callbacks (sent / delivered / read / failed)
          const statuses = value?.statuses;
          if (statuses?.length) {
            for (const s of statuses) {
              const ts = s.timestamp
                ? new Date(Number(s.timestamp) * 1000).toISOString()
                : new Date().toISOString();
              const candidateId = await findCandidateIdByPhone(s.recipient_id);
              const errMsg = s.errors?.[0]?.message ?? s.errors?.[0]?.title;
              await supabaseAdmin.from("operation_logs").insert({
                candidate_id: candidateId,
                operator_name: "WhatsApp Webhook",
                interaction_type: `whatsapp_status_${s.status}`,
                notes_hebrew: `[${s.status} ${ts}] msg id: ${s.id}${errMsg ? ` | שגיאה: ${errMsg}` : ""}`,
                source_message: s.id,
                follow_up_required: s.status === "failed",
              });
            }
            return json({ ok: true });
          }

          const message = value?.messages?.[0];

          // Ignore non-text events
          if (!message || message.type !== "text" || !message.text) {
            return json({ ok: true });
          }

          const receivedAt = message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();
          const text = message.text.body.trim();
          const fromCandidateId = await findCandidateIdByPhone(message.from);

          // Log every inbound driver message
          await supabaseAdmin.from("operation_logs").insert({
            candidate_id: fromCandidateId,
            operator_name: "WhatsApp Inbound",
            interaction_type: "whatsapp_inbound_received",
            notes_hebrew: `[התקבל ${receivedAt}] מ-${message.from}: ${text}`,
            source_message: text,
            follow_up_required: false,
          });

          if (message.from !== BENY_PHONE) {
            return json({ ok: true, skipped: "unauthorized sender" });
          }

          const reply = await handleCommand(text);
          const sendResult = await sendWhatsAppText(BENY_PHONE, reply);
          const sentAt = new Date().toISOString();

          await supabaseAdmin.from("operation_logs").insert({
            candidate_id: fromCandidateId,
            operator_name: "WhatsApp Webhook",
            interaction_type: sendResult.ok
              ? "whatsapp_reply_sent"
              : "whatsapp_reply_failed",
            notes_hebrew: sendResult.ok
              ? `[נשלח ${sentAt}] ${reply}${sendResult.messageId ? ` (msg id: ${sendResult.messageId})` : ""}`
              : `[נכשל ${sentAt}] ${sendResult.error} | ${reply}`,
            translated_hebrew: reply,
            source_message: reply,
            follow_up_required: !sendResult.ok,
          });

          return json({ ok: true });
        } catch (err) {
          console.error("[whatsapp webhook] error processing message", err);
          return json({ ok: false, error: "Internal error" }, 500);
        }
      },
    },
  },
});

async function handleCommand(text: string): Promise<string> {
  if (text === "מועמדים") {
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .select("name,stage")
      .order("created_at", { ascending: false });

    if (error) return (console.error("[whatsapp webhook] db error", error), "שגיאה בשליפת הנתונים");
    if (!data?.length) return "אין מועמדים במערכת.";

    const lines = data.map((c) => `• ${c.name} — ${c.stage}`);
    return `מועמדים (${data.length}):\n${lines.join("\n")}`;
  }

  if (text === "חדשים") {
    // Midnight in Israel time (UTC+3 summer, UTC+2 winter — using +03:00 is correct for EEST)
    const todayIL = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Jerusalem",
    }); // "YYYY-MM-DD"
    const from = new Date(`${todayIL}T00:00:00+03:00`).toISOString();

    const { data, error } = await supabaseAdmin
      .from("candidates")
      .select("name,stage,created_at")
      .gte("created_at", from)
      .order("created_at", { ascending: false });

    if (error) return (console.error("[whatsapp webhook] db error", error), "שגיאה בשליפת הנתונים");
    if (!data?.length) return "אין מועמדים חדשים היום.";

    const lines = data.map((c) => `• ${c.name} — ${c.stage}`);
    return `מועמדים חדשים היום (${data.length}):\n${lines.join("\n")}`;
  }

  if (text === "סיכום") {
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .select("stage");

    if (error) return (console.error("[whatsapp webhook] db error", error), "שגיאה בשליפת הנתונים");

    const counts = (data ?? []).reduce<Record<string, number>>((acc, r) => {
      const s = (r as { stage: string }).stage ?? "לא ידוע";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    const total = (data ?? []).length;
    const lines = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([stage, count]) => `• ${stage}: ${count}`);

    return `סיכום מועמדים (סה"כ ${total}):\n${lines.join("\n")}`;
  }

  if (text === "עזרה") {
    return [
      "פקודות זמינות:",
      "• מועמדים — רשימת כל המועמדים ושלבם",
      "• חדשים — מועמדים שנוספו היום",
      "• סיכום — ספירה לפי שלב",
      "• עזרה — הצגת רשימת פקודות",
      "",
      "כל הודעה אחרת תועבר ל-AI ותקבל תשובה בעברית.",
    ].join("\n");
  }

  return await askAi(text);
}

async function askAi(question: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "מצטערים, שירות ה-AI אינו זמין כעת.";

  try {
    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "אתה עוזר AI של פלטפורמת גיוס נהגים Haile AI לקהילה האתיופית בישראל. ענה תמיד בעברית, בצורה קצרה ומעשית.",
            },
            { role: "user", content: question },
          ],
        }),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      data.choices?.[0]?.message?.content?.trim() ??
      "לא הצלחתי לקבל תשובה מה-AI."
    );
  } catch {
    return "שגיאה בפנייה ל-AI.";
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Match a Meta E.164 phone (e.g. "972548739473") to a candidate row.
// Tries exact, with leading "+", and the local "0..." form.
async function findCandidateIdByPhone(
  phone: string | undefined | null,
): Promise<string | null> {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  const candidates = [digits, `+${digits}`];
  if (digits.startsWith("972")) candidates.push(`0${digits.slice(3)}`);

  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select("id,phone")
    .in("phone", candidates)
    .limit(1);

  if (error || !data?.length) return null;
  return data[0].id;
}
