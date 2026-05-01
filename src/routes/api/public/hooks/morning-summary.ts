import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { sendWhatsAppText } from "@/lib/whatsapp.server";

export const Route = createFileRoute("/api/public/hooks/morning-summary")({
  server: {
    handlers: {
      POST: async () => {
        try {
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
            .in("key", ["beny_whatsapp", "morning_summary"]);

          if (settingsError) {
            return json({ ok: false, error: settingsError.message }, 500);
          }

          const map = new Map(settingsRows?.map((r) => [r.key, r.value]) ?? []);
          const beny = (map.get("beny_whatsapp") ?? {}) as { phone?: string };
          const summary = (map.get("morning_summary") ?? {}) as {
            time_il?: string;
            enabled?: boolean;
          };

          if (summary.enabled === false) {
            return json({ ok: true, skipped: "summary disabled" });
          }
          if (!beny.phone) {
            return json({ ok: false, error: "Beny WhatsApp not configured." }, 400);
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
            return json({ ok: false, error: result.error }, 502);
          }

          return json({ ok: true, messageId: result.messageId });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return json({ ok: false, error: message }, 500);
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
