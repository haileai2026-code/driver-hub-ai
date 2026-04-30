import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesInsert } from "@/integrations/supabase/types";
import { normalizeCityValue } from "@/lib/cities";

type CandidateInsert = TablesInsert<"candidates">;
type CandidateImportDraft = Omit<CandidateInsert, "city" | "phone" | "license"> & {
  city?: CandidateInsert["city"] | null;
  phone?: CandidateInsert["phone"] | null;
  license?: CandidateInsert["license"] | null;
};

const CellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ImportSchema = z.object({
  accessToken: z.string().min(20).max(5000),
  rows: z.array(z.record(CellSchema)).min(1).max(500),
});

const headerMap = {
  nameHe: ["name_he", "hebrew_name", "full_name_he", "שם", "שם מלא", "שם בעברית", "שם_בעברית"],
  nameAm: ["name_am", "amharic_name", "full_name_am", "שם באמהרית", "אמהרית", "ስም"],
  nameRu: ["name_ru", "russian_name", "full_name_ru", "שם ברוסית", "רוסית", "имя"],
  name: ["full_name", "name", "driver", "candidate", "מועמד", "נהג", "שם מועמד"],
  age: ["age", "גיל", "возраст"],
  city: ["city", "עיר", "город"],
  phone: ["phone", "mobile", "whatsapp", "טלפון", "נייד", "וואטסאפ"],
  license: ["license", "license_status", "רישיון", "סטטוס רישיון", "סטטוס_רישיון"],
  stage: ["stage", "שלב", "status", "статус"],
  language: ["preferred_language", "language", "שפה", "שפת אם", "язык"],
  idDoc: ["id", "id_document", "תז", "תעודת זהות", "מסמך זהות"],
  greenDoc: ["green_form", "green", "טופס ירוק", "ירוק"],
  notesHe: ["notes_he", "note_he", "הערות", "הערות בעברית"],
  notesAm: ["notes_am", "note_am", "הערות באמהרית"],
  notesRu: ["notes_ru", "note_ru", "הערות ברוסית"],
  partner: ["partner", "assigned_to", "שותף", "מטפל", "אחראי"],
} as const;

export const importCandidatesFromRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !userData.user) {
      return { inserted: 0, skipped: data.rows.length, errors: ["יש להתחבר לפני ייבוא מועמדים."] };
    }

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!roleRow || !["super_admin", "operator"].includes(roleRow.role)) {
      return { inserted: 0, skipped: data.rows.length, errors: ["אין הרשאת עריכה לייבוא מועמדים."] };
    }

    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;

    for (let index = 0; index < data.rows.length; index++) {
      const row = data.rows[index];
      const rowNumber = index + 2;
      const mapped = mapImportRow(row);

      if (!mapped.name || !mapped.name.trim()) {
        errors.push(`שורה ${rowNumber}: חסר שם מועמד.`);
        skipped++;
        continue;
      }

      const candidate = mapped as CandidateInsert;
      candidate.created_by = userData.user.id;
      candidate.license_status = normalizeLicense(String(candidate.license ?? ""));

      const { error: insertError } = await supabaseAdmin.from("candidates").insert(candidate);
      if (insertError) {
        errors.push(`שורה ${rowNumber}: ${insertError.message}`);
        skipped++;
        continue;
      }
      inserted++;
    }

    return { inserted, skipped, errors };
  });

function mapImportRow(row: Record<string, string | number | boolean | null>): CandidateImportDraft {
  const nameHe = read(row, headerMap.nameHe) || read(row, headerMap.name);
  const nameAm = read(row, headerMap.nameAm) || nameHe;
  const nameRu = read(row, headerMap.nameRu) || nameHe;
  const phone = normalizePhone(read(row, headerMap.phone));
  const noteHe = read(row, headerMap.notesHe);
  const noteAm = read(row, headerMap.notesAm);
  const noteRu = read(row, headerMap.notesRu);
  const name = nameHe || nameAm || nameRu;

  const partner = read(row, headerMap.partner);
  return {
    name,
    age: normalizeAge(read(row, headerMap.age)),
    city: normalizeCity(read(row, headerMap.city)) ?? null,
    phone: phone || null,
    license: normalizeText(read(row, headerMap.license)),
    stage: normalizeStage(read(row, headerMap.stage)),
    notes: [noteHe, noteAm, noteRu].filter(Boolean).join("\n") || null,
    assigned_to: partner || null,
  };
}

function read(row: Record<string, string | number | boolean | null>, aliases: readonly string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => aliases.some((alias) => normalizeHeader(key) === normalizeHeader(alias)));
  const value = match?.[1];
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-:()]/g, "").trim();
}

function normalizePhone(value: string) {
  return value.replace(/[^+\d]/g, "");
}

function normalizeAge(value: string) {
  const age = Number.parseInt(value, 10);
  return Number.isFinite(age) && age >= 16 && age <= 85 ? age : null;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeCity(value: string): CandidateInsert["city"] | undefined {
  return normalizeCityValue(value) as CandidateInsert["city"] | undefined;
}

function normalizeStage(value: string): CandidateInsert["stage"] {
  const normalized = normalizeHeader(value);
  if (["learning", "לומד", "לימוד"].includes(normalized)) return "Learning";
  if (["test", "טסט", "מבחן"].includes(normalized)) return "Test";
  if (["placed", "הושם", "השמה"].includes(normalized)) return "Placed";
  return "Lead";
}

function normalizeLicense(value: string): CandidateInsert["license_status"] {
  const normalized = normalizeHeader(value);
  if (["learning", "לומד", "לימוד"].includes(normalized)) return "Learning";
  if (["theoryready", "תיאוריה", "מוכןלתיאוריה"].includes(normalized)) return "Theory Ready";
  if (["testscheduled", "טסטנקבע", "מבחןנקבע"].includes(normalized)) return "Test Scheduled";
  if (["licensed", "בעלרישיון", "רישיון"].includes(normalized)) return "Licensed";
  return "Not Started";
}
