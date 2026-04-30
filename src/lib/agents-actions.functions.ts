import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

const AgentName = z.enum(["סוכן גיוס", "Voice Agent", "CIEL", "SOL"]);
const ActionType = z.enum([
  "open_message",
  "interview_questions",
  "rating",
  "status_update",
  "reminder",
  "follow_up",
  "note",
]);

const RecordSchema = AccessTokenSchema.extend({
  candidateId: z.string().uuid(),
  agentName: AgentName,
  actionType: ActionType,
  content: z.string().trim().min(1).max(4000),
  language: z.enum(["he", "am", "ru"]).default("he"),
  followUpRequired: z.boolean().optional(),
  followUpAt: z.string().datetime().optional(),
});

const RatingSchema = AccessTokenSchema.extend({
  candidateId: z.string().uuid(),
  rating: z.enum(["A", "B", "C"]),
  note: z.string().trim().min(1).max(2000),
});

type AppRole = "super_admin" | "operator" | "viewer";

async function authorize(accessToken: string, allowed: AppRole[]) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !userData.user) return { ok: false as const, message: "יש להתחבר עם משתמש מורשה." };
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const role = roleRow?.role as AppRole | undefined;
  if (!role || !allowed.includes(role)) {
    return { ok: false as const, message: "למשתמש הזה אין הרשאה לפעולה." };
  }
  return { ok: true as const, userId: userData.user.id, role };
}

export const recordAgentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await authorize(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const { error } = await supabaseAdmin.from("operation_logs").insert({
      candidate_id: data.candidateId,
      operator_name: data.agentName,
      interaction_type: data.actionType,
      notes_hebrew: data.language === "he" ? data.content : null,
      notes_amharic: data.language === "am" ? data.content : null,
      notes_russian: data.language === "ru" ? data.content : null,
      translated_hebrew: data.language === "he" ? data.content : null,
      source_message: data.content,
      follow_up_required: data.followUpRequired ?? false,
    });

    if (error) return { ok: false as const, message: error.message };

    if (data.followUpAt) {
      await supabaseAdmin
        .from("candidates")
        .update({ next_step_due_at: data.followUpAt, last_contacted_at: new Date().toISOString() })
        .eq("id", data.candidateId);
    } else {
      await supabaseAdmin
        .from("candidates")
        .update({ last_contacted_at: new Date().toISOString() })
        .eq("id", data.candidateId);
    }

    return { ok: true as const, message: `הפעולה של ${data.agentName} נרשמה ביומן.` };
  });

export const saveCandidateRating = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RatingSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await authorize(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) return { ok: false as const, message: auth.message };

    const score = data.rating === "A" ? 9 : data.rating === "B" ? 6 : 3;

    const { data: candidate, error: readError } = await supabaseAdmin
      .from("candidates")
      .select("localized_profile")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (readError || !candidate) {
      return { ok: false as const, message: readError?.message ?? "מועמד לא נמצא." };
    }

    const profile =
      candidate.localized_profile && typeof candidate.localized_profile === "object" && !Array.isArray(candidate.localized_profile)
        ? (candidate.localized_profile as Record<string, unknown>)
        : {};

    const updatedProfile = { ...profile, score, rating: data.rating };

    const { error: updateError } = await supabaseAdmin
      .from("candidates")
      .update({
        localized_profile: updatedProfile,
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.candidateId);
    if (updateError) return { ok: false as const, message: updateError.message };

    await supabaseAdmin.from("operation_logs").insert({
      candidate_id: data.candidateId,
      operator_name: "Voice Agent",
      interaction_type: "rating",
      notes_hebrew: `דירוג ראיון: ${data.rating} (ציון ${score}). ${data.note}`,
      translated_hebrew: `דירוג ראיון: ${data.rating} (ציון ${score}). ${data.note}`,
      source_message: data.note,
      follow_up_required: data.rating !== "A",
    });

    return { ok: true as const, message: `דירוג ${data.rating} נשמר עבור המועמד.` };
  });
