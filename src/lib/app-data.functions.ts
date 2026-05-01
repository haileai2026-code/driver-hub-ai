import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CITY_OPTIONS } from "@/lib/cities";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

const CandidateSchema = AccessTokenSchema.extend({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(5).max(30),
  age: z.number().int().min(16).max(90).nullable(),
  city: z.enum(CITY_OPTIONS),
  stage: z.enum(["Lead", "Learning", "Test", "Placed"]),
  license: z.enum(["Not Started", "Learning", "Theory Ready", "Test Scheduled", "Licensed"]),
  notes: z.string().trim().max(2000).nullable(),
  language: z.enum(["he", "am", "ru"]).optional(),
  partner: z.enum(["Egged", "Afikim", "Other"]).nullable().optional(),
});

const CandidateUpdateSchema = CandidateSchema.extend({
  id: z.string().uuid(),
});

const UpdateStageSchema = AccessTokenSchema.extend({
  id: z.string().uuid(),
  stage: z.enum(["Lead", "Learning", "Test", "Placed"]),
});

const CandidateIdSchema = AccessTokenSchema.extend({
  id: z.string().uuid(),
});

type AppRole = "super_admin" | "operator" | "viewer";

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

  return { ok: true as const, userId: userData.user.id, email: userData.user.email ?? "", role };
}

export const getAuthorizedSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) =>
    getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]),
  );

export const getLiveAppData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AccessTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) return { ok: false as const, message: auth.message, candidates: [], logs: [], users: [] };

    const [candidateResult, logResult, roleResult] = await Promise.all([
      supabaseAdmin.from("candidates").select("*").order("created_at", { ascending: false }),
      supabaseAdmin
        .from("operation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
      auth.role === "super_admin"
        ? supabaseAdmin.from("user_roles").select("id,user_id,role,created_at").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (candidateResult.error || logResult.error || roleResult.error) {
      console.error("[getLiveAppData] db error", {
        candidate: candidateResult.error,
        log: logResult.error,
        role: roleResult.error,
      });
      return {
        ok: false as const,
        message: "טעינת הנתונים נכשלה.",
        candidates: [],
        logs: [],
        users: [],
      };
    }

    const roleRows = roleResult.data ?? [];
    const users = auth.role === "super_admin" && roleRows.length
      ? (await supabaseAdmin.auth.admin.listUsers()).data.users.map((user) => {
          const roleRow = roleRows.find((row) => row.user_id === user.id);
          return {
            id: user.id,
            email: user.email ?? "",
            role: roleRow?.role ?? "viewer",
            created_at: roleRow?.created_at ?? user.created_at,
          };
        }).filter((user) => roleRows.some((row) => row.user_id === user.id))
      : [];

    return {
      ok: true as const,
      candidates: candidateResult.data ?? [],
      logs: logResult.data ?? [],
      users,
    };
  });

export const createCandidate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CandidateSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { error } = await supabaseAdmin.from("candidates").insert({
      name: data.name,
      phone: data.phone,
      age: data.age,
      city: data.city,
      stage: data.stage,
      license: data.license,
      license_status: data.license,
      notes: data.notes,
      created_by: auth.userId,
    });

    if (error) {
      console.error("[app-data] db error", error);
      return { ok: false as const, message: "הפעולה נכשלה. אנא נסה שוב." };
    }
    return { ok: true as const, message: "המועמד נשמר בהצלחה." };
  });

export const updateCandidate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CandidateUpdateSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const updatePayload: Record<string, unknown> = {
      name: data.name,
      phone: data.phone,
      age: data.age,
      city: data.city,
      stage: data.stage,
      license: data.license,
      license_status: data.license,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    };
    if (data.language) updatePayload.preferred_language = data.language;
    if (data.partner !== undefined) updatePayload.assigned_to = data.partner;

    const { error } = await supabaseAdmin
      .from("candidates")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updatePayload as any)
      .eq("id", data.id);

    if (error) {
      console.error("[app-data] db error", error);
      return { ok: false as const, message: "הפעולה נכשלה. אנא נסה שוב." };
    }
    return { ok: true as const, message: "פרטי המועמד עודכנו." };
  });

export const updateCandidateStage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateStageSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { error } = await supabaseAdmin
      .from("candidates")
      .update({ stage: data.stage })
      .eq("id", data.id);
    if (error) {
      console.error("[app-data] db error", error);
      return { ok: false as const, message: "הפעולה נכשלה. אנא נסה שוב." };
    }
    return { ok: true as const, message: "סטטוס המועמד עודכן." };
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CandidateIdSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { error } = await supabaseAdmin.from("candidates").delete().eq("id", data.id);
    if (error) {
      console.error("[app-data] db error", error);
      return { ok: false as const, message: "הפעולה נכשלה. אנא נסה שוב." };
    }
    return { ok: true as const, message: "המועמד נמחק." };
  });

const ReminderStatsSchema = AccessTokenSchema.extend({
  days: z.number().int().min(1).max(60).optional(),
});

export type ReminderDailyPoint = {
  date: string; // YYYY-MM-DD
  sent: number;
  delivered: number;
  read: number;
  failed: number;
};

export type ReminderFailureEntry = {
  id: string;
  createdAt: string;
  interactionType: string;
  reason: string;
  rawNotes: string;
  candidateId: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
};

export type ReminderFailureReason = {
  reason: string;
  count: number;
  entries: ReminderFailureEntry[];
};

export type ReminderDelayCorrelation = {
  reason: string;
  failureCount: number;
  retryCount: number; // additional sends to same candidate after failure
  avgRetryGapMs: number | null; // avg time from failure -> next send to same candidate
  avgDeliveryDelayMs: number | null; // avg sent->delivered for related messages
  delayedDeliveries: number; // # related messages whose sent->delivered exceeded threshold
  delayThresholdMs: number;
};

export type ReminderStats = {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  successRate: number; // 0..1 — sent / (sent + failed)
  deliveryRate: number; // 0..1 — delivered / sent
  daily: ReminderDailyPoint[];
  failureReasons: ReminderFailureReason[];
  delayCorrelations: ReminderDelayCorrelation[];
};

function extractFailureReason(notes: string | null): string {
  if (!notes) return "לא צוינה סיבה";
  // Format from automation/webhook: "[נכשל <ts>] <reason> | <body>"
  const match = notes.match(/\[נכשל[^\]]*\]\s*([^|]+)/);
  const raw = match?.[1]?.trim() ?? notes.trim();
  // Normalize HTTP status / common patterns to keep buckets tight
  const httpMatch = raw.match(/HTTP\s*(\d{3})/i);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  // Trim very long reasons
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

export const getWhatsAppReminderStats = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReminderStatsSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, [
      "super_admin",
      "operator",
      "viewer",
    ]);
    if (!auth.ok)
      return {
        ok: false as const,
        message: auth.message,
        stats: null as ReminderStats | null,
      };

    const days = data.days ?? 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("operation_logs")
      .select("id,interaction_type,notes_hebrew,created_at,candidate_id,source_message")
      .gte("created_at", since)
      .in("interaction_type", [
        "whatsapp_reminder_sent",
        "whatsapp_reminder_failed",
        "whatsapp_status_sent",
        "whatsapp_status_delivered",
        "whatsapp_status_read",
        "whatsapp_status_failed",
        "whatsapp_reply_sent",
        "whatsapp_reply_failed",
      ])
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) {
      console.error("[reminder-stats] db error", error);
      return {
        ok: false as const,
        message: "טעינת סטטיסטיקת תזכורות נכשלה.",
        stats: null,
      };
    }

    const buckets = new Map<string, ReminderDailyPoint>();
    // Seed every day in range so the chart shows continuous bars
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, sent: 0, delivered: 0, read: 0, failed: 0 });
    }

    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;
    const reasonCounts = new Map<string, number>();
    const reasonEntries = new Map<string, ReminderFailureEntry[]>();

    for (const row of rows ?? []) {
      const dayKey = (row.created_at ?? "").slice(0, 10);
      const bucket =
        buckets.get(dayKey) ??
        (() => {
          const seeded: ReminderDailyPoint = {
            date: dayKey,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
          };
          buckets.set(dayKey, seeded);
          return seeded;
        })();

      switch (row.interaction_type) {
        case "whatsapp_reminder_sent":
        case "whatsapp_reply_sent":
        case "whatsapp_status_sent":
          bucket.sent += 1;
          totalSent += 1;
          break;
        case "whatsapp_status_delivered":
          bucket.delivered += 1;
          totalDelivered += 1;
          break;
        case "whatsapp_status_read":
          bucket.read += 1;
          totalRead += 1;
          break;
        case "whatsapp_reminder_failed":
        case "whatsapp_reply_failed":
        case "whatsapp_status_failed": {
          bucket.failed += 1;
          totalFailed += 1;
          const reason = extractFailureReason(row.notes_hebrew);
          reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
          const list = reasonEntries.get(reason) ?? [];
          list.push({
            id: row.id,
            createdAt: row.created_at,
            interactionType: row.interaction_type,
            reason,
            rawNotes: row.notes_hebrew ?? "",
            candidateId: row.candidate_id ?? null,
            candidateName: null,
            candidatePhone: null,
          });
          reasonEntries.set(reason, list);
          break;
        }
        default:
          break;
      }
    }

    // Resolve candidate names/phones for the failure entries in one query
    const candidateIds = Array.from(
      new Set(
        Array.from(reasonEntries.values())
          .flat()
          .map((entry) => entry.candidateId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (candidateIds.length > 0) {
      const { data: candidateRows, error: candidateError } = await supabaseAdmin
        .from("candidates")
        .select("id,name,phone")
        .in("id", candidateIds);

      if (candidateError) {
        console.error("[reminder-stats] candidate lookup error", candidateError);
      } else {
        const lookup = new Map(
          (candidateRows ?? []).map((row) => [row.id, row]),
        );
        for (const list of reasonEntries.values()) {
          for (const entry of list) {
            if (!entry.candidateId) continue;
            const candidate = lookup.get(entry.candidateId);
            if (candidate) {
              entry.candidateName = candidate.name ?? null;
              entry.candidatePhone = candidate.phone ?? null;
            }
          }
        }
      }
    }

    const daily = Array.from(buckets.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const failureReasons: ReminderFailureReason[] = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        entries: (reasonEntries.get(reason) ?? [])
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 25),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sendAttempts = totalSent + totalFailed;
    const successRate = sendAttempts > 0 ? totalSent / sendAttempts : 0;
    const deliveryRate = totalSent > 0 ? totalDelivered / totalSent : 0;

    // ----- Correlate failure reasons with delivery delays / retries -----
    // 1) Build a wamid -> {sentAt, deliveredAt} map from status logs and
    //    reminder send logs (which embed "msg id: <wamid>" in notes_hebrew).
    const WAMID_RE = /msg id:\s*([A-Za-z0-9._\-=:+/]+)/i;
    type WamidTimeline = { sentAt?: number; deliveredAt?: number; candidateId: string | null };
    const wamidTimeline = new Map<string, WamidTimeline>();

    const upsertWamid = (
      wamid: string,
      patch: Partial<WamidTimeline> & { candidateId?: string | null },
    ) => {
      const existing = wamidTimeline.get(wamid) ?? { candidateId: patch.candidateId ?? null };
      wamidTimeline.set(wamid, {
        ...existing,
        ...patch,
        candidateId: existing.candidateId ?? patch.candidateId ?? null,
      });
    };

    for (const row of rows ?? []) {
      const tsMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (!Number.isFinite(tsMs)) continue;

      if (
        row.interaction_type === "whatsapp_reminder_sent" ||
        row.interaction_type === "whatsapp_reply_sent"
      ) {
        const m = row.notes_hebrew?.match(WAMID_RE);
        if (m?.[1]) upsertWamid(m[1], { sentAt: tsMs, candidateId: row.candidate_id ?? null });
      } else if (row.interaction_type === "whatsapp_status_sent" && row.source_message) {
        upsertWamid(row.source_message, {
          sentAt: tsMs,
          candidateId: row.candidate_id ?? null,
        });
      } else if (
        row.interaction_type === "whatsapp_status_delivered" &&
        row.source_message
      ) {
        upsertWamid(row.source_message, {
          deliveredAt: tsMs,
          candidateId: row.candidate_id ?? null,
        });
      }
    }

    // 2) Per-candidate timeline of sends (so we can detect retries after a failure).
    type SendEvent = { ts: number; candidateId: string };
    const sendsByCandidate = new Map<string, number[]>();
    for (const row of rows ?? []) {
      if (
        row.candidate_id &&
        (row.interaction_type === "whatsapp_reminder_sent" ||
          row.interaction_type === "whatsapp_reply_sent")
      ) {
        const tsMs = new Date(row.created_at).getTime();
        if (!Number.isFinite(tsMs)) continue;
        const arr = sendsByCandidate.get(row.candidate_id) ?? [];
        arr.push(tsMs);
        sendsByCandidate.set(row.candidate_id, arr);
      }
    }
    for (const arr of sendsByCandidate.values()) arr.sort((a, b) => a - b);

    const DELAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    const correlationMap = new Map<
      string,
      {
        failureCount: number;
        retryCount: number;
        retryGaps: number[];
        deliveryDelays: number[];
        delayedDeliveries: number;
      }
    >();

    for (const [reason, entries] of reasonEntries.entries()) {
      const slot = {
        failureCount: entries.length,
        retryCount: 0,
        retryGaps: [] as number[],
        deliveryDelays: [] as number[],
        delayedDeliveries: 0,
      };

      for (const entry of entries) {
        const failureTs = new Date(entry.createdAt).getTime();
        if (!Number.isFinite(failureTs)) continue;

        // Retry detection: count sends to this candidate strictly AFTER the failure
        if (entry.candidateId) {
          const sends = sendsByCandidate.get(entry.candidateId) ?? [];
          const nextSend = sends.find((ts) => ts > failureTs);
          const retriesAfter = sends.filter((ts) => ts > failureTs).length;
          slot.retryCount += retriesAfter;
          if (nextSend) slot.retryGaps.push(nextSend - failureTs);

          // Delivery delay: any wamid for this candidate where sentAt > failureTs
          // and we have a deliveredAt — measures how long retries took to land.
          for (const timeline of wamidTimeline.values()) {
            if (
              timeline.candidateId === entry.candidateId &&
              timeline.sentAt &&
              timeline.deliveredAt &&
              timeline.sentAt > failureTs
            ) {
              const delay = timeline.deliveredAt - timeline.sentAt;
              slot.deliveryDelays.push(delay);
              if (delay >= DELAY_THRESHOLD_MS) slot.delayedDeliveries += 1;
            }
          }
        }
      }

      correlationMap.set(reason, slot);
    }

    const avg = (arr: number[]) =>
      arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    const delayCorrelations: ReminderDelayCorrelation[] = Array.from(
      correlationMap.entries(),
    )
      .map(([reason, slot]) => ({
        reason,
        failureCount: slot.failureCount,
        retryCount: slot.retryCount,
        avgRetryGapMs: avg(slot.retryGaps),
        avgDeliveryDelayMs: avg(slot.deliveryDelays),
        delayedDeliveries: slot.delayedDeliveries,
        delayThresholdMs: DELAY_THRESHOLD_MS,
      }))
      // Surface reasons that actually correlate with retries or delays
      .filter(
        (c) =>
          c.retryCount > 0 ||
          (c.avgDeliveryDelayMs ?? 0) > 0 ||
          c.delayedDeliveries > 0,
      )
      .sort((a, b) => {
        // Rank by delayed deliveries, then retry count, then avg delay
        if (b.delayedDeliveries !== a.delayedDeliveries)
          return b.delayedDeliveries - a.delayedDeliveries;
        if (b.retryCount !== a.retryCount) return b.retryCount - a.retryCount;
        return (b.avgDeliveryDelayMs ?? 0) - (a.avgDeliveryDelayMs ?? 0);
      })
      .slice(0, 5);

    return {
      ok: true as const,
      message: "OK",
      stats: {
        totalSent,
        totalDelivered,
        totalRead,
        totalFailed,
        successRate,
        deliveryRate,
        daily,
        failureReasons,
        delayCorrelations,
      } satisfies ReminderStats,
    };
  });
