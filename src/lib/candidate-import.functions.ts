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
  name: ["שם", "שם מלא", "name", "full name", "שם_מלא", "full_name", "driver", "candidate", "מועמד", "נהג", "שם מועמד"],
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

const positionalColumnMap = {
  name: "__col1",
  phone: "__col2",
  age: "__col3",
  license: "__col4",
  city: "__col5",
  stage: "__col6",
  partner: "__col7",
  notes: "__col8",
} as const;

export const importCandidatesFromRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    console.log("[candidate-import] Raw parsed rows:", data.rows);

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

    if (data.rows.length > 0) {
      const detectedHeaders = Object.keys(data.rows[0]);
      console.log("[candidate-import] Detected CSV headers:", detectedHeaders);
      console.log(
        "[candidate-import] Normalized headers:",
        detectedHeaders.map((h) => ({ raw: h, normalized: normalizeHeader(h) })),
      );
    }

    for (let index = 0; index < data.rows.length; index++) {
      const row = data.rows[index];
      const rowNumber = index + 2;
      const mapped = mapImportRow(row);
      console.log(`[candidate-import] Row ${rowNumber} keys:`, Object.keys(row), "mapped:", mapped);

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
        console.error(`[candidate-import] Supabase insert error for row ${rowNumber}:`, insertError);
        errors.push(
          `שורה ${rowNumber}: ${insertError.message}${insertError.details ? ` | details: ${insertError.details}` : ""}${insertError.hint ? ` | hint: ${insertError.hint}` : ""}${insertError.code ? ` | code: ${insertError.code}` : ""}`,
        );
        skipped++;
        continue;
      }
      inserted++;
    }

    return { inserted, skipped, errors };
  });

function mapImportRow(row: Record<string, string | number | boolean | null>): CandidateImportDraft {
  const name =
    readPosition(row, positionalColumnMap.name) ||
    read(row, headerMap.nameHe) ||
    read(row, headerMap.name) ||
    read(row, headerMap.nameAm) ||
    read(row, headerMap.nameRu);
  const phone = normalizePhone(readPosition(row, positionalColumnMap.phone) || read(row, headerMap.phone));
  const notes =
    readPosition(row, positionalColumnMap.notes) ||
    read(row, headerMap.notesHe) ||
    read(row, headerMap.notesAm) ||
    read(row, headerMap.notesRu);
  const partner = readPosition(row, positionalColumnMap.partner) || read(row, headerMap.partner);

  return {
    name,
    age: normalizeAge(readPosition(row, positionalColumnMap.age) || read(row, headerMap.age)),
    city: normalizeCity(readPosition(row, positionalColumnMap.city) || read(row, headerMap.city)) ?? null,
    phone: phone || null,
    license: normalizeText(readPosition(row, positionalColumnMap.license) || read(row, headerMap.license)),
    stage: normalizeStage(readPosition(row, positionalColumnMap.stage) || read(row, headerMap.stage)),
    notes: normalizeText(notes),
    assigned_to: partner || null,
  };
}

function read(row: Record<string, string | number | boolean | null>, aliases: readonly string[]) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => aliases.some((alias) => normalizeHeader(key) === normalizeHeader(alias)));
  const value = match?.[1];
  return value === null || value === undefined ? "" : String(value).trim();
}

function readPosition(
  row: Record<string, string | number | boolean | null>,
  positionalKey: (typeof positionalColumnMap)[keyof typeof positionalColumnMap],
) {
  const value = row[positionalKey];
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
