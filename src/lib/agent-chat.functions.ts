import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AgentKey = z.enum(["recruiter", "voice", "ciel", "sol"]);

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const ChatSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  candidateId: z.string().uuid(),
  agent: AgentKey,
  messages: z.array(ChatMessage).min(1).max(40),
});

type AppRole = "super_admin" | "operator" | "viewer";

const AGENT_PROFILES: Record<
  z.infer<typeof AgentKey>,
  { displayName: string; persona: string }
> = {
  recruiter: {
    displayName: "סוכן גיוס",
    persona: [
      "אתה 'סוכן גיוס' של היילה AI – מתמחה בגיוס נהגי משאית/אוטובוס בישראל.",
      "סגנון: ענייני, מקצועי, חם. שואל שאלות מיון ברורות (גיל, ניסיון, רישיון, עיר, זמינות).",
      "תמיד מציע פעולה מעשית הבאה למתאם האנושי, ולא ממציא נתונים שאינם בפרופיל המועמד.",
    ].join(" "),
  },
  voice: {
    displayName: "Voice Agent",
    persona: [
      "אתה 'Voice Agent' – מנהל ראיון מובנה עם המועמד.",
      "מבנה: פתיחה → 4-6 שאלות מיון → דירוג A/B/C עם נימוק קצר.",
      "כל פלט שלך כולל: השאלה הבאה לראיון, וכשאפשר – דירוג מומלץ ונימוק קצר. ללא המצאת מידע.",
    ].join(" "),
  },
  ciel: {
    displayName: "CIEL",
    persona: [
      "אתה 'CIEL' – מנטר תפעול לחברת הסעות. מתמחה בדוחות, סטטוסים ועדכונים יומיים.",
      "תמיד מסכם בנקודות קצרות: מצב נוכחי, חריגות, פעולת המשך מומלצת.",
    ].join(" "),
  },
  sol: {
    displayName: "SOL",
    persona: [
      "אתה 'SOL' – מנהל יומן, תזכורות ומיילים של המנכ\"ל.",
      "ענה במשפטים קצרים. הצע ניסוח להודעת WhatsApp/מייל, או חלון זמן ביומן.",
      "אל תמציא פגישות שאינן בקונטקסט – הצע ניסוח טיוטה בלבד.",
    ].join(" "),
  },
};

async function getAuthorizedUser(accessToken: string, allowedRoles: AppRole[]) {
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !userData.user) {
    return { ok: false as const, message: "יש להתחבר עם משתמש מורשה." };
  }
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const role = roleRow?.role as AppRole | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false as const, message: "אין לך הרשאה לשוחח עם הסוכנים." };
  }
  return { ok: true as const, userId: userData.user.id, role };
}

function detectMissingDocuments(documents: unknown) {
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
    return ["תעודת זהות", "טופס ירוק"];
  }
  const record = documents as Record<string, unknown>;
  const id = record.id as { received?: boolean } | undefined;
  const green = (record.green_form ?? record.green) as { received?: boolean } | undefined;
  const missing: string[] = [];
  if (!id?.received) missing.push("תעודת זהות");
  if (!green?.received) missing.push("טופס ירוק");
  return missing;
}

export const chatWithAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChatSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await getAuthorizedUser(data.accessToken, ["super_admin", "operator"]);
    if (!auth.ok) {
      return { ok: false as const, message: auth.message, reply: "" };
    }

    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from("candidates")
      .select("*")
      .eq("id", data.candidateId)
      .maybeSingle();

    if (candidateError || !candidate) {
      return { ok: false as const, message: "לא נמצא מועמד לשיחה.", reply: "" };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, message: "חיבור ה-AI אינו זמין כעת.", reply: "" };
    }

    const profile = AGENT_PROFILES[data.agent];
    const missingDocuments = detectMissingDocuments(candidate.documents);

    const candidateContext = [
      `שם: ${candidate.name}`,
      `שלב: ${candidate.stage}`,
      `רישיון: ${candidate.license_status ?? "לא ידוע"}`,
      `טלפון: ${candidate.phone ?? "לא הוזן"}`,
      `עיר: ${candidate.city ?? "לא הוזנה"}`,
      `שפה מועדפת: ${candidate.preferred_language}`,
      `הערות פנימיות: ${candidate.notes ?? "אין"}`,
      `מסמכים חסרים: ${missingDocuments.length ? missingDocuments.join(", ") : "אין"}`,
    ].join("\n");

    const systemPrompt = [
      profile.persona,
      "ענה תמיד בעברית מקצועית, קצר וענייני, אלא אם המשתמש כתב בשפה אחרת.",
      "השתמש רק בנתוני המועמד שלהלן. אם חסר מידע – אמור זאת מפורשות.",
      "",
      "הקשר מועמד:",
      candidateContext,
    ].join("\n");

    let reply = "";
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
            { role: "system", content: systemPrompt },
            ...data.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (response.status === 429) {
        return {
          ok: false as const,
          message: "עומס זמני על שירות ה-AI. נסה שוב בעוד רגע.",
          reply: "",
        };
      }
      if (response.status === 402) {
        return {
          ok: false as const,
          message: "נדרשת טעינת קרדיטים לשירות ה-AI.",
          reply: "",
        };
      }
      if (!response.ok) {
        return {
          ok: false as const,
          message: "השירות אינו זמין כרגע. נסה שוב בעוד רגע.",
          reply: "",
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      reply = json.choices?.[0]?.message?.content?.trim() ?? "";
    } catch {
      return { ok: false as const, message: "שגיאת רשת בעת פנייה ל-AI.", reply: "" };
    }

    if (!reply) {
      return { ok: false as const, message: "לא התקבלה תשובה מהסוכן.", reply: "" };
    }

    const lastUser = [...data.messages].reverse().find((m) => m.role === "user");
    const rows = [];
    if (lastUser) {
      rows.push({
        candidate_id: data.candidateId,
        operator_name: `${profile.displayName} (משתמש)`,
        interaction_type: `agent_chat:${data.agent}`,
        notes_hebrew: lastUser.content,
        translated_hebrew: lastUser.content,
        source_message: lastUser.content,
        follow_up_required: false,
      });
    }
    rows.push({
      candidate_id: data.candidateId,
      operator_name: profile.displayName,
      interaction_type: `agent_chat:${data.agent}`,
      notes_hebrew: reply,
      translated_hebrew: reply,
      source_message: reply,
      follow_up_required: false,
    });

    const { error: logError } = await supabaseAdmin.from("operation_logs").insert(rows);
    if (logError) {
      console.error("agent_chat log error", logError.message);
    }

    return { ok: true as const, message: "הסוכן הגיב.", reply };
  });
