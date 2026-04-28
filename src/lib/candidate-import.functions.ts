import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, TablesInsert } from "@/integrations/supabase/types";

type CandidateInsert = TablesInsert<"candidates">;
type CandidateImportDraft = Omit<CandidateInsert, "city"> & { city?: CandidateInsert["city"] };
type Language = Database["public"]["Enums"]["preferred_language"];

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
} as const;

export const importCandidatesFromRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      return { inserted: 0, skipped: data.rows.length, errors: ["Backend is not configured."] };
    }

    const supabase = createClient<Database>(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(data.accessToken);
    if (authError || !userData.user) {
      return { inserted: 0, skipped: data.rows.length, errors: ["יש להתחבר לפני ייבוא מועמדים."] };
    }

    const errors: string[] = [];
    const candidates: CandidateInsert[] = data.rows.flatMap((row, index) => {
      const mapped = mapImportRow(row);
      const rowNumber = index + 2;

      if (!mapped.phone) {
        errors.push(`שורה ${rowNumber}: חסר מספר טלפון.`);
        return [];
      }

      if (!mapped.city) {
        errors.push(`שורה ${rowNumber}: עיר חייבת להיות Ashkelon או Kiryat Gat.`);
        return [];
      }

      return [mapped as CandidateInsert];
    });

    if (candidates.length === 0) {
      return { inserted: 0, skipped: data.rows.length, errors };
    }

    const { data: insertedRows, error } = await supabase.from("candidates").insert(candidates).select("id");
    if (error) {
      return { inserted: 0, skipped: data.rows.length, errors: [error.message, ...errors] };
    }

    return {
      inserted: insertedRows?.length ?? candidates.length,
      skipped: data.rows.length - candidates.length,
      errors,
    };
  });

function mapImportRow(row: Record<string, string | number | boolean | null>): CandidateImportDraft {
  const nameHe = read(row, headerMap.nameHe) || read(row, headerMap.name);
  const nameAm = read(row, headerMap.nameAm) || nameHe;
  const nameRu = read(row, headerMap.nameRu) || nameHe;
  const phone = normalizePhone(read(row, headerMap.phone));
  const noteHe = read(row, headerMap.notesHe);
  const noteAm = read(row, headerMap.notesAm);
  const noteRu = read(row, headerMap.notesRu);

  return {
    full_name: { he: nameHe || phone, am: nameAm || nameHe || phone, ru: nameRu || nameHe || phone },
    age: normalizeAge(read(row, headerMap.age)),
    city: normalizeCity(read(row, headerMap.city)),
    phone,
    license_status: normalizeLicense(read(row, headerMap.license)),
    stage: normalizeStage(read(row, headerMap.stage)),
    preferred_language: normalizeLanguage(read(row, headerMap.language)),
    documents: {
      id: { received: normalizeBoolean(read(row, headerMap.idDoc)), url: null },
      green_form: { received: normalizeBoolean(read(row, headerMap.greenDoc)), url: null },
    },
    localized_profile: {
      he: noteHe ? { note: noteHe } : {},
      am: noteAm ? { note: noteAm } : {},
      ru: noteRu ? { note: noteRu } : {},
    },
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

function normalizeCity(value: string): CandidateInsert["city"] | undefined {
  const normalized = normalizeHeader(value);
  if (["ashkelon", "אשקלון"].includes(normalized)) return "Ashkelon";
  if (["kiryatgat", "קריתגת", "קרייתגת"].includes(normalized)) return "Kiryat Gat";
  return undefined;
}

function normalizeLanguage(value: string): Language {
  const normalized = normalizeHeader(value);
  if (["he", "heb", "hebrew", "עברית"].includes(normalized)) return "he";
  if (["ru", "rus", "russian", "רוסית", "русский"].includes(normalized)) return "ru";
  return "am";
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

function normalizeBoolean(value: string) {
  return ["true", "yes", "y", "1", "כן", "קיים", "received", "יש"].includes(normalizeHeader(value));
}