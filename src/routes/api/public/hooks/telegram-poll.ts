import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramUpdates, sendTelegramText } from "@/lib/telegram.server";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

export const Route = createFileRoute("/api/public/hooks/telegram-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env.MORNING_SUMMARY_SECRET;
        if (!expectedSecret) {
          return json({ ok: false, error: "Server not configured" }, 500);
        }
        const provided =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          request.headers.get("x-telegram-poll-secret") ??
          "";
        if (provided !== expectedSecret) {
          return json({ ok: false, error: "Unauthorized" }, 401);
        }

        // Find authorized chat_id (Beny) — only commands from this chat are honored.
        const { data: settingsRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "beny_telegram")
          .maybeSingle();
        const benyChatId = (settingsRow?.value as { chat_id?: string } | null)?.chat_id ?? "";

        const { data: state, error: stateErr } = await supabaseAdmin
          .from("telegram_bot_state")
          .select("update_offset")
          .eq("id", 1)
          .maybeSingle();

        if (stateErr) {
          console.error("[telegram-poll] state read failed", stateErr);
          return json({ ok: false, error: "State read failed" }, 500);
        }

        let currentOffset = state?.update_offset ?? 0;
        let processed = 0;
        const startTime = Date.now();

        while (true) {
          const elapsed = Date.now() - startTime;
          const remainingMs = MAX_RUNTIME_MS - elapsed;
          if (remainingMs < MIN_REMAINING_MS) break;
          const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
          if (timeout < 1) break;

          const result = await getTelegramUpdates(currentOffset, timeout);
          if (!result.ok) {
            console.error("[telegram-poll] getUpdates failed:", result.error);
            break;
          }
          if (result.updates.length === 0) continue;

          for (const u of result.updates) {
            const msg = u.message;
            if (!msg?.text) continue;
            const text = msg.text.trim();
            const chatIdStr = String(msg.chat.id);

            // Log inbound
            await supabaseAdmin.from("operation_logs").insert({
              candidate_id: null,
              operator_name: "Telegram Inbound",
              interaction_type: "telegram_inbound_received",
              notes_hebrew: `[התקבל] מ-${chatIdStr}: ${text}`,
              source_message: text,
              follow_up_required: false,
            });

            // Only honor commands from Beny
            if (!benyChatId || chatIdStr !== benyChatId) {
              continue;
            }

            const reply = await handleCommand(text);
            const sent = await sendTelegramText(chatIdStr, reply);
            const sentAt = new Date().toISOString();
            await supabaseAdmin.from("operation_logs").insert({
              candidate_id: null,
              operator_name: "Telegram Bot",
              interaction_type: sent.ok ? "telegram_reply_sent" : "telegram_reply_failed",
              notes_hebrew: sent.ok
                ? `[נשלח ${sentAt}] ${reply} (msg id: ${sent.messageId})`
                : `[נכשל ${sentAt}] ${sent.error} | ${reply}`,
              translated_hebrew: reply,
              source_message: reply,
              follow_up_required: !sent.ok,
            });

            processed += 1;
          }

          const newOffset = Math.max(...result.updates.map((u) => u.update_id)) + 1;
          await supabaseAdmin
            .from("telegram_bot_state")
            .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
            .eq("id", 1);
          currentOffset = newOffset;
        }

        return json({ ok: true, processed, finalOffset: currentOffset });
      },
    },
  },
});

async function handleCommand(text: string): Promise<string> {
  if (text === "מועמדים" || text === "/candidates") {
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .select("name,stage")
      .order("created_at", { ascending: false });
    if (error) return "שגיאה בשליפת הנתונים";
    if (!data?.length) return "אין מועמדים במערכת.";
    const lines = data.map((c) => `• ${c.name} — ${c.stage}`);
    return `מועמדים (${data.length}):\n${lines.join("\n")}`;
  }

  if (text === "חדשים" || text === "/new") {
    const todayIL = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
    const from = new Date(`${todayIL}T00:00:00+03:00`).toISOString();
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .select("name,stage,created_at")
      .gte("created_at", from)
      .order("created_at", { ascending: false });
    if (error) return "שגיאה בשליפת הנתונים";
    if (!data?.length) return "אין מועמדים חדשים היום.";
    const lines = data.map((c) => `• ${c.name} — ${c.stage}`);
    return `מועמדים חדשים היום (${data.length}):\n${lines.join("\n")}`;
  }

  if (text === "סיכום" || text === "/summary") {
    const { data, error } = await supabaseAdmin.from("candidates").select("stage");
    if (error) return "שגיאה בשליפת הנתונים";
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

  if (text === "עזרה" || text === "/help" || text === "/start") {
    return [
      "פקודות זמינות:",
      "• מועמדים — רשימת כל המועמדים",
      "• חדשים — מועמדים שנוספו היום",
      "• סיכום — ספירה לפי שלב",
      "• עזרה — רשימת פקודות",
      "",
      "כל הודעה אחרת תועבר ל-AI.",
    ].join("\n");
  }

  return await askAi(text);
}

async function askAi(question: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "מצטערים, שירות ה-AI אינו זמין כעת.";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "אתה עוזר AI של פלטפורמת גיוס נהגים Haile AI לקהילה האתיופית בישראל. ענה תמיד בעברית, בצורה קצרה ומעשית.",
          },
          { role: "user", content: question },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? "לא הצלחתי לקבל תשובה מה-AI.";
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
