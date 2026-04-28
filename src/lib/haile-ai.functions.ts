import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AiInputSchema = z.object({
  mode: z.enum(["candidate_next_step", "translate_to_hebrew", "status_template"]),
  language: z.enum(["he", "am", "ru"]),
  candidateName: z.string().min(1).max(120).optional(),
  stage: z.string().min(1).max(80).optional(),
  licenseStatus: z.string().min(1).max(120).optional(),
  missingDocuments: z.array(z.string().min(1).max(80)).max(8).optional(),
  message: z.string().min(1).max(1200).optional(),
});

const fallbackByLanguage = {
  he: "השלב הבא: לוודא שכל המסמכים התקבלו, לקבוע יעד לימוד קצר ולסגור מועד קשר הבא עם המועמד.",
  am: "ቀጣዩ እርምጃ፦ ሰነዶቹን ያረጋግጡ፣ የትምህርት ግብ ያዘጋጁ እና የሚቀጥለውን የWhatsApp ክትትል ያቅዱ።",
  ru: "Следующий шаг: проверить документы, назначить учебную цель и запланировать следующий контакт с кандидатом.",
};

export const generateHaileAiText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AiInputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;

    if (!apiKey) {
      return { text: fallbackByLanguage[data.language], source: "fallback" as const };
    }

    const missing = data.missingDocuments?.length ? data.missingDocuments.join(", ") : "none";
    const prompt = [
      "You are Haile AI, an operations assistant for a driver recruitment company in Israel.",
      "Be concise, practical, culturally respectful, and never invent facts.",
      "If mode is translate_to_hebrew, translate the driver's message into clear Hebrew for management.",
      "If mode is status_template, write a short WhatsApp-ready status update in the requested language.",
      "If mode is candidate_next_step, suggest the next operational step in the requested language.",
      `Mode: ${data.mode}`,
      `Target language: ${data.language}`,
      `Candidate: ${data.candidateName ?? "unknown"}`,
      `Stage: ${data.stage ?? "unknown"}`,
      `License status: ${data.licenseStatus ?? "unknown"}`,
      `Missing documents: ${missing}`,
      `Driver message: ${data.message ?? ""}`,
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
        return { text: fallbackByLanguage[data.language], source: "fallback" as const };
      }

      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return {
        text: json.choices?.[0]?.message?.content?.trim() || fallbackByLanguage[data.language],
        source: "ai" as const,
      };
    } catch {
      return { text: fallbackByLanguage[data.language], source: "fallback" as const };
    }
  });
