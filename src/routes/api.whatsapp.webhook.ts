import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramText, BENY_CHAT_ID } from "@/lib/telegram.server";
import { sendWhatsAppText } from "@/lib/whatsapp.server";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const BENY_PHONE = "972548739473";

// ── Types ────────────────────────────────────────────────────────────────────

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

interface WaConversation {
  id: string;
  phone: string;
  step: number;
  language: "he" | "am" | "ru";
  answers: { age?: string; license?: string; availability?: string };
  candidate_id: string | null;
  grade: "A" | "B" | "C" | null;
  last_message_at: string;
  reminder_24h_sent_at: string | null;
  reminder_72h_sent_at: string | null;
  flagged_no_reply: boolean;
}

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
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

          // Log every inbound message
          await supabaseAdmin.from("operation_logs").insert({
            candidate_id: fromCandidateId,
            operator_name: "WhatsApp Inbound",
            interaction_type: "whatsapp_inbound_received",
            notes_hebrew: `[התקבל ${receivedAt}] מ-${message.from}: ${text}`,
            source_message: text,
            follow_up_required: false,
          });

          // Beny's command interface
          if (message.from === BENY_PHONE) {
            const reply = await handleCommand(text);
            const sendResult = await sendWhatsAppText(BENY_PHONE, reply);
            const sentAt = new Date().toISOString();
            await supabaseAdmin.from("operation_logs").insert({
              candidate_id: fromCandidateId,
              operator_name: "WhatsApp Webhook",
              interaction_type: sendResult.ok ? "whatsapp_reply_sent" : "whatsapp_reply_failed",
              notes_hebrew: sendResult.ok
                ? `[נשלח ${sentAt}] ${reply}${sendResult.messageId ? ` (msg id: ${sendResult.messageId})` : ""}`
                : `[נכשל ${sentAt}] ${sendResult.error} | ${reply}`,
              translated_hebrew: reply,
              source_message: reply,
              follow_up_required: !sendResult.ok,
            });
            return json({ ok: true });
          }

          // All other phones: run candidate screening flow
          await handleScreening(message.from, text, fromCandidateId);
          return json({ ok: true });
        } catch (err) {
          console.error("[whatsapp webhook] error processing message", err);
          return json({ ok: false, error: "Internal error" }, 500);
        }
      },
    },
  },
});

// ── Screening flow ───────────────────────────────────────────────────────────

async function handleScreening(
  phone: string,
  text: string,
  existingCandidateId: string | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: conv } = (await db
    .from("wa_conversations")
    .select("*")
    .eq("phone", phone)
    .maybeSingle()) as { data: WaConversation | null };

  // Reset reminder flags on any new reply
  if (conv) {
    await db.from("wa_conversations").update({
      last_message_at: new Date().toISOString(),
      reminder_24h_sent_at: null,
      reminder_72h_sent_at: null,
      flagged_no_reply: false,
    }).eq("phone", phone);
  }

  if (!conv) {
    const lang = detectLanguage(text);
    await db.from("wa_conversations").insert({
      phone,
      step: 1,
      language: lang,
      answers: {},
      last_message_at: new Date().toISOString(),
    });
    await sendWhatsAppText(phone, greetingQ1(lang));
    return;
  }

  if (conv.step === 4) {
    await sendWhatsAppText(phone, alreadyDone(conv.language));
    return;
  }

  const lang = conv.language;
  const answers = { ...conv.answers };

  if (conv.step === 1) {
    answers.age = text;
    await db.from("wa_conversations").update({ answers, step: 2 }).eq("phone", phone);
    await sendWhatsAppText(phone, questionLicense(lang));
    return;
  }

  if (conv.step === 2) {
    answers.license = text;
    await db.from("wa_conversations").update({ answers, step: 3 }).eq("phone", phone);
    await sendWhatsAppText(phone, questionAvailability(lang));
    return;
  }

  if (conv.step === 3) {
    answers.availability = text;
    const grade = gradeCandidate(answers);
    const candidateId =
      existingCandidateId ?? (await createCandidate(phone, lang, answers, grade));

    await db.from("wa_conversations").update({
      answers,
      step: 4,
      grade,
      candidate_id: candidateId,
    }).eq("phone", phone);

    await sendWhatsAppText(phone, thankYou(lang));

    if (grade === "A") {
      const langLabel: Record<string, string> = { he: "עברית", am: "אמהרית", ru: "רוסית" };
      const alert =
        `🚨 מועמד דרגה A חדש!\n` +
        `טלפון: ${phone}\n` +
        `גיל: ${answers.age ?? "?"}\n` +
        `רישיון: ${answers.license ?? "?"}\n` +
        `זמינות: ${answers.availability ?? "?"}\n` +
        `שפה: ${langLabel[lang] ?? lang}`;
      await sendTelegramText(BENY_CHAT_ID, alert);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectLanguage(text: string): "he" | "am" | "ru" {
  if (/[ሀ-፿]/.test(text)) return "am";
  if (/[Ѐ-ӿ]/.test(text)) return "ru";
  return "he";
}

function gradeCandidate(answers: {
  age?: string;
  license?: string;
  availability?: string;
}): "A" | "B" | "C" {
  let score = 0;

  const ageNum = parseInt(answers.age ?? "0", 10);
  if (ageNum >= 25 && ageNum <= 55) score += 2;
  else if ((ageNum >= 21 && ageNum < 25) || (ageNum > 55 && ageNum <= 65)) score += 1;

  const lic = (answers.license ?? "").toUpperCase();
  const hasProfessional = /\bD\b|\bE\b|ד|ה/.test(lic);
  const hasAnyLicense = hasProfessional || /\bC\b|\bA\b|\bB\b|ג|א|ב/.test(lic);
  if (hasProfessional) score += 3;
  else if (hasAnyLicense) score += 1;

  const avail = (answers.availability ?? "").toLowerCase();
  if (/מיד|immediately|ወዲያው|сразу|now/.test(avail)) score += 2;
  else if (/שבועיים|2.?week|ሳምንት|недел/.test(avail)) score += 1;

  if (score >= 5) return "A";
  if (score >= 2) return "B";
  return "C";
}

async function createCandidate(
  phone: string,
  lang: "he" | "am" | "ru",
  answers: { age?: string; license?: string; availability?: string },
  grade: "A" | "B" | "C",
): Promise<string | null> {
  const ageNum = parseInt(answers.age ?? "0", 10);
  const { data, error } = await supabaseAdmin
    .from("candidates")
    .insert({
      name: phone,
      phone,
      age: isNaN(ageNum) || ageNum === 0 ? null : ageNum,
      preferred_language: lang,
      stage: "Lead",
      notes: `גויס דרך WhatsApp | דרגה: ${grade} | רישיון: ${answers.license ?? "-"} | זמינות: ${answers.availability ?? "-"}`,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

// ── Multilingual message strings ─────────────────────────────────────────────

const STRINGS = {
  greetingQ1: {
    he: "שלום! אני הבוט של Haile AI לגיוס נהגים.\nאשאל 3 שאלות קצרות כדי להתחיל.\n\nשאלה 1: כמה שנים יש לך? (שלח מספר)",
    am: "ሰላም! እኔ ሃይሌ AI ሹፌር ቅጥር ቦት ነኝ።\n3 አጭር ጥያቄዎች ልጠይቅ።\n\nጥያቄ 1: እድሜዎ ስንት ነው? (ቁጥር ይላኩ)",
    ru: "Привет! Я бот Haile AI по набору водителей.\nЗадам 3 коротких вопроса.\n\nВопрос 1: Сколько вам лет? (напишите число)",
  },
  questionLicense: {
    he: "תודה! שאלה 2: איזה סוג רישיון נהיגה יש לך?\n(למשל: ד׳, ה׳, ג׳ — או אין לי רישיון)",
    am: "አመሰግናለሁ! ጥያቄ 2: ምን ዓይነት መንጃ ፈቃድ አለዎት?\n(ለምሳሌ: D, E, C — ወይም ፈቃድ የለኝም)",
    ru: "Спасибо! Вопрос 2: Какой у вас тип водительских прав?\n(например: D, E, C — или нет прав)",
  },
  questionAvailability: {
    he: "שאלה 3: מתי תוכל להתחיל לעבוד?\n(מיד / תוך שבועיים / תוך חודש)",
    am: "ጥያቄ 3: መቼ መስራት መጀመር ትችላለህ?\n(ወዲያው / ከ2 ሳምንት በኋላ / ከወር በኋላ)",
    ru: "Вопрос 3: Когда вы можете начать работать?\n(сразу / через 2 недели / через месяц)",
  },
  thankYou: {
    he: "תודה! קיבלנו את הפרטים שלך.\nצוות Haile AI יצור איתך קשר בקרוב. 🙏",
    am: "አመሰግናለሁ! ዝርዝሮቻቸውን ተቀብለናል።\nየሃይሌ AI ቡድን በቅርቡ ያነጋግርዎታል። 🙏",
    ru: "Спасибо! Мы получили ваши данные.\nКоманда Haile AI свяжется с вами в ближайшее время. 🙏",
  },
  alreadyDone: {
    he: "כבר קיבלנו את הפרטים שלך. צוות Haile AI יצור איתך קשר בקרוב.",
    am: "ዝርዝሮቻቸውን ቀድሞ ተቀብለናል። የሃይሌ AI ቡድን በቅርቡ ያነጋግርዎታል።",
    ru: "Мы уже получили ваши данные. Команда Haile AI свяжется с вами в ближайшее время.",
  },
} as const;

type Lang = "he" | "am" | "ru";
const greetingQ1 = (l: Lang) => STRINGS.greetingQ1[l];
const questionLicense = (l: Lang) => STRINGS.questionLicense[l];
const questionAvailability = (l: Lang) => STRINGS.questionAvailability[l];
const thankYou = (l: Lang) => STRINGS.thankYou[l];
const alreadyDone = (l: Lang) => STRINGS.alreadyDone[l];

// ── Beny command handler ─────────────────────────────────────────────────────

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
    const todayIL = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Jerusalem",
    });
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
    const { data, error } = await supabaseAdmin.from("candidates").select("stage");
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

// Match a Meta E.164 phone (e.g. "972548739473") to a candidate row.
async function findCandidateIdByPhone(
  phone: string | undefined | null,
): Promise<string | null> {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  const variants = [digits, `+${digits}`];
  if (digits.startsWith("972")) variants.push(`0${digits.slice(3)}`);

  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select("id,phone")
    .in("phone", variants)
    .limit(1);

  if (error || !data?.length) return null;
  return data[0].id;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
