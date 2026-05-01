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

    return error
      ? { ok: false as const, message: error.message }
      : { ok: true as const, message: "המועמד נשמר בהצלחה." };
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

    return error
      ? { ok: false as const, message: error.message }
      : { ok: true as const, message: "פרטי המועמד עודכנו." };
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
    return error
      ? { ok: false as const, message: error.message }
      : { ok: true as const, message: "סטטוס המועמד עודכן." };
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CandidateIdSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { error } = await supabaseAdmin.from("candidates").delete().eq("id", data.id);
    return error
      ? { ok: false as const, message: error.message }
      : { ok: true as const, message: "המועמד נמחק." };
  });
