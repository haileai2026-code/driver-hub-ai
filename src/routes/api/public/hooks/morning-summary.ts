import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { sendTelegramText } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/public/hooks/morning-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const expectedSecret = process.env.MORNING_SUMMARY_SECRET;
          if (!expectedSecret) {
            console.error("MORNING_SUMMARY_SECRET not configured");
            return json({ ok: false, error: "Unauthorized" }, 401);
          }
          const provided =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            request.headers.get("x-morning-summary-secret") ??
            "";
          if (provided !== expectedSecret) {
            return json({ ok: false, error: "Unauthorized" }, 401);
          }
          const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceKey) {
            return json({ ok: false, error: "Missing Supabase credentials." }, 500);
          }

          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          const { data: settingsRows, error: settingsError } = await admin
            .from("app_settings")
            .select("key,value")
            .in("key", ["beny_telegram", "morning_summary"]);

          if (settingsError) {
            console.error("[morning-summary] settings fetch failed:", settingsError.message);
            return json({ ok: false, error: "Failed to load settings" }, 500);
          }

          const map = new Map(settingsRows?.map((r) => [r.key, r.value]) ?? []);
          const beny = (map.get("beny_telegram") ?? {}) as { chat_id?: string };
          const summary = (map.get("morning_summary") ?? {}) as {
            time_il?: string;
            enabled?: boolean;
          };

          if (summary.enabled === false) {
            return json({ ok: true, skipped: "summary disabled" });
          }
          if (!beny.chat_id) {
            return json({ ok: false, error: "Beny Telegram chat_id not configured." }, 400);
          }

          // Only send within a 5-minute window of the configured Asia/Jerusalem time.
          const targetTime = (summary.time_il ?? "08:00").trim();
          const nowIl = new Date().toLocaleTimeString("en-GB", {
            timeZone: "Asia/Jerusalem",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }); // "HH:MM"
          const [th, tm] = targetTime.split(":").map(Number);
          const [nh, nm] = nowIl.split(":").map(Number);
          const diff = Math.abs((nh * 60 + nm) - (th * 60 + tm));
          if (diff > 5) {
            return json({ ok: true, skipped: `outside window (now ${nowIl}, target ${targetTime})` });
          }

          // Build the morning summary
          const since = new Date();
          since.setHours(since.getHours() - 24);

          const [{ count: newCandidates }, { count: newLogs }, { data: stages }] =
            await Promise.all([
              admin
                .from("candidates")
                .select("*", { count: "exact", head: true })
                .gte("created_at", since.toISOString()),
              admin
                .from("operation_logs")
                .select("*", { count: "exact", head: true })
                .gte("created_at", since.toISOString()),
              admin.from("candidates").select("stage"),
            ]);

          const stageCounts = (stages ?? []).reduce<Record<string, number>>((acc, r) => {
            const s = (r as { stage: string }).stage;
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {});

          const today = new Date().toLocaleDateString("he-IL", {
            timeZone: "Asia/Jerusalem",
          });

          const lines = [
            `☀️ סיכום בוקר – ${today}`,
            "",
            `מועמדים חדשים (24 שעות אחרונות): ${newCandidates ?? 0}`,
            `אינטראקציות חדשות: ${newLogs ?? 0}`,
            "",
            "סטטוס מועמדים:",
            ...Object.entries(stageCounts).map(([k, v]) => `• ${k}: ${v}`),
          ];

          const result = await sendWhatsAppText(beny.phone, lines.join("\n"));
          if (!result.ok) {
            console.error("[morning-summary] WhatsApp send failed:", result.error);
            return json({ ok: false, error: "Notification delivery failed" }, 502);
          }

          return json({ ok: true, messageId: result.messageId });
        } catch (err) {
          console.error("[morning-summary] handler failed:", err);
          return json({ ok: false, error: "Internal server error" }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
