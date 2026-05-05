import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { sendTelegramText, BENY_CHAT_ID } from "@/lib/telegram.server";
import { sendWhatsAppText } from "@/lib/whatsapp.server";

interface WaConversation {
  id: string;
  phone: string;
  step: number;
  language: "he" | "am" | "ru";
  last_message_at: string;
  reminder_24h_sent_at: string | null;
  reminder_72h_sent_at: string | null;
  flagged_no_reply: boolean;
}

export const Route = createFileRoute("/api/public/hooks/wa-reminders")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const supabaseUrl =
            process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceKey) {
            return json({ ok: false, error: "Missing Supabase credentials." }, 500);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          }) as any;

          const now = new Date();
          const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          const h72ago = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

          // Fetch incomplete conversations (step 1–3)
          const { data: convs, error } = (await admin
            .from("wa_conversations")
            .select(
              "id,phone,step,language,last_message_at,reminder_24h_sent_at,reminder_72h_sent_at,flagged_no_reply",
            )
            .lt("step", 4)) as { data: WaConversation[] | null; error: unknown };

          if (error) {
            return json({ ok: false, error: String(error) }, 500);
          }

          let sent24 = 0;
          let sent72 = 0;

          for (const conv of convs ?? []) {
            const lastMsg = conv.last_message_at;

            // 72-hour final reminder (checked first so it won't also trigger 24h)
            if (
              lastMsg < h72ago &&
              conv.reminder_72h_sent_at === null &&
              !conv.flagged_no_reply
            ) {
              await sendWhatsAppText(conv.phone, reminder72(conv.language));
              await admin
                .from("wa_conversations")
                .update({
                  reminder_72h_sent_at: now.toISOString(),
                  flagged_no_reply: true,
                })
                .eq("id", conv.id);

              // Notify Beny on Telegram
              await sendTelegramText(
                BENY_CHAT_ID,
                `⚠️ מועמד לא ענה 72 שעות — מסומן בדשבורד\nטלפון: ${conv.phone}`,
              );
              sent72 += 1;
              continue;
            }

            // 24-hour reminder
            if (lastMsg < h24ago && conv.reminder_24h_sent_at === null) {
              await sendWhatsAppText(conv.phone, reminder24(conv.language));
              await admin
                .from("wa_conversations")
                .update({ reminder_24h_sent_at: now.toISOString() })
                .eq("id", conv.id);
              sent24 += 1;
            }
          }

          return json({ ok: true, sent24, sent72 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return json({ ok: false, error: message }, 500);
        }
      },
    },
  },
});

// ── Reminder message strings ──────────────────────────────────────────────────

const REMINDER_24: Record<string, string> = {
  he: "שלום! ראינו שלא ענית לשאלותינו. נשמח לדעת עוד עליך כדי לעזור לך להתחיל לעבוד כנהג. 😊",
  am: "ሰላም! ለጥያቄዎቻችን ምላሽ እንዳልሰጡ አስተዋልን። ሾፌር ሆኖ ለመስራት ለማገዝ ስለርስዎ ተጨማሪ ማወቅ ደስ ይለናል። 😊",
  ru: "Привет! Мы заметили, что вы не ответили. Мы хотели бы узнать о вас больше, чтобы помочь стать водителем. 😊",
};

const REMINDER_72: Record<string, string> = {
  he: "זו ההודעה האחרונה שלנו. אם אתה מעוניין לעבוד כנהג — ענה לנו וצוות Haile AI ישמח לעזור. 🙏",
  am: "ይህ የመጨረሻ መልዕክታችን ነው። ሾፌር ሆኖ ለመስራት ፍላጎት ካለዎት ይጠሩን — የሃይሌ AI ቡድን ደስ ብሎት ይረዳዎታል። 🙏",
  ru: "Это наше последнее сообщение. Если хотите работать водителем — ответьте нам, и команда Haile AI с радостью поможет. 🙏",
};

const reminder24 = (l: string) => REMINDER_24[l] ?? REMINDER_24.he;
const reminder72 = (l: string) => REMINDER_72[l] ?? REMINDER_72.he;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
