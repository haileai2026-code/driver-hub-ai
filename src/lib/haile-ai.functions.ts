import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AccessTokenSchema = z.object({
  accessToken: z.string().min(20).max(5000),
});

const AgentReadSchema = AccessTokenSchema.extend({
  candidateId: z.string().uuid(),
  mode: z.enum(["candidate_next_step", "translate_to_hebrew", "status_template"]),
});

const AgentWriteSchema = AccessTokenSchema.extend({
  candidateId: z.string().uuid(),
  note: z.string().trim().min(1).max(1200),
  stage: z.enum(["Lead", "Learning", "Test", "Placed"]).optional(),
  followUpRequired: z.boolean().optional(),
});

type AppRole = "super_admin" | "operator" | "viewer";

const fallbackByLanguage = {
  he: "השלב הבא: לוודא שכל המסמכים התקבלו, לקבוע יעד לימוד קצר ולסגור מועד קשר הבא עם המועמד.",
  am: "ቀጣዩ እርምጃ፦ ሰነዶቹን ያረጋግጡ፣ የትምህርት ግብ ያዘጋጁ እና የሚቀጥለውን የWhatsApp ክትትል ያቅዱ።",
  ru: "Следующий шаг: проверить документы, назначить учебную цель и запланировать следующий контакт с кандидатом.",
};

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

function detectMissingDocuments(documents: unknown) {
  const missing: string[] = [];
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
    return ["תעודת זהות", "טופס ירוק"];
  }

  const record = documents as Record<string, unknown>;
  const id = record.id as { received?: boolean } | undefined;
  const green = (record.green_form ?? record.green) as { received?: boolean } | undefined;

  if (!id?.received) missing.push("תעודת זהות");
  if (!green?.received) missing.push("טופס ירוק");
  return missing;
}

function languageLabel(value: string) {
  if (value === "he") return "he" as const;
  if (value === "ru") return "ru" as const;
  return "am" as const;
}

export const generateHaileAiText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AgentReadSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator", "viewer"]);
    if (!auth.ok) {
      return { text: auth.message, source: "auth" as const };
    }

    const [candidateResult, logResult] = await Promise.all([
      supabaseAdmin.from("candidates").select("*").eq("id", data.candidateId).maybeSingle(),
      supabaseAdmin
        .from("operation_logs")
        .select("notes_hebrew,translated_hebrew,source_message,interaction_type,created_at")
        .eq("candidate_id", data.candidateId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    if (candidateResult.error || !candidateResult.data) {
      return { text: "לא נמצא מועמד להצגת הקשר מלא.", source: "missing" as const };
    }

    const candidate = candidateResult.data;
    const apiKey = process.env.LOVABLE_API_KEY;
    const language = languageLabel(candidate.preferred_language);
    const missingDocuments = detectMissingDocuments(candidate.documents);
    const recentLogs = (logResult.data ?? [])
      .map((log) => log.translated_hebrew || log.notes_hebrew || log.source_message || log.interaction_type)
      .filter(Boolean)
      .join(" | ");

    if (!apiKey) {
      return { text: fallbackByLanguage[language], source: "fallback" as const };
    }

    const prompt = [
      "You are Haile AI Human Coordinator for a driver recruitment operation in Israel.",
      "Your process is: Document upload -> Medicals -> Theory -> Training.",
      "You have live read access to the candidate record and recent operation logs.",
      "Answer concisely, only with practical next actions. Never invent missing facts.",
      "If mode is translate_to_hebrew, translate the latest candidate context into clear Hebrew for management.",
      "If mode is status_template, write a short status update for the team in the candidate's working language.",
      "If mode is candidate_next_step, recommend the exact next coordinator action.",
      `Mode: ${data.mode}`,
      `Candidate name: ${candidate.name}`,
      `Current stage: ${candidate.stage}`,
      `License status: ${candidate.license_status}`,
      `Phone: ${candidate.phone}`,
      `City: ${candidate.city}`,
      `Internal notes: ${candidate.notes ?? "none"}`,
      `Missing documents: ${missingDocuments.length ? missingDocuments.join(", ") : "none"}`,
      `Recent operation logs: ${recentLogs || "none"}`,
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
            { role: "system", content: "Return only the final user-facing text. No preamble." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (response.status === 429) {
        return { text: "עומס זמני על שירות ה-AI. נסה שוב בעוד רגע.", source: "rate-limit" as const };
      }

      if (response.status === 402) {
        return { text: "נדרשת טעינת קרדיטים לשירות ה-AI לפני המשך שימוש.", source: "billing" as const };
      }

      if (!response.ok) {
        return { text: fallbackByLanguage[language], source: "fallback" as const };
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return {
        text: json.choices?.[0]?.message?.content?.trim() || fallbackByLanguage[language],
        source: "ai" as const,
      };
    } catch {
      return { text: fallbackByLanguage[language], source: "fallback" as const };
    }
  });

export const applyHaileAiOperation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AgentWriteSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) {
      return { ok: false as const, message: auth.message };
    }

    if (data.stage) {
      const { error: candidateError } = await supabaseAdmin
        .from("candidates")
        .update({
          stage: data.stage,
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.candidateId);

      if (candidateError) {
        console.error("[haile-ai] candidate update failed", candidateError);
        return { ok: false as const, message: "עדכון המועמד נכשל. אנא נסה שוב." };
      }
    }

    const { error: logError } = await supabaseAdmin.from("operation_logs").insert({
      candidate_id: data.candidateId,
      operator_name: "Haile AI Human Coordinator",
      interaction_type: "ai_agent",
      notes_hebrew: data.note,
      translated_hebrew: data.note,
      source_message: data.note,
      follow_up_required: data.followUpRequired ?? false,
    });

    if (logError) {
      console.error("[haile-ai] log insert failed", logError);
      return { ok: false as const, message: "רישום הפעולה ביומן נכשל. אנא נסה שוב." };
    }

    return {
      ok: true as const,
      message: data.stage ? "הסוכן עדכן סטטוס ורשם פעולה ביומן." : "הסוכן רשם פעולה ביומן.",
    };
  });
