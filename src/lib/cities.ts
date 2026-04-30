export const CITY_OPTIONS = [
  "Ashkelon",
  "Kiryat Gat",
  "Ashdod",
  "Tel Aviv",
  "Jerusalem",
  "Haifa",
  "Beer Sheva",
  "Netanya",
  "Rishon LeZion",
  "Petah Tikva",
  "Holon",
  "Bnei Brak",
  "Ramat Gan",
  "Bat Yam",
  "Rehovot",
  "Herzliya",
  "Kfar Saba",
  "Modiin",
  "Eilat",
  "Tiberias",
  "Nazareth",
  "Acre",
  "Lod",
  "Ramla",
  "Afula",
  "Nahariya",
  "Nes Ziona",
  "Beit Shemesh",
  "Kiryat Ata",
  "Kiryat Bialik",
  "Rosh HaAyin",
  "Yavne",
  "Dimona",
  "Sderot",
  "Beit Shean",
  "Other",
] as const;

export type CityOption = (typeof CITY_OPTIONS)[number];

// Hebrew display labels for each city. Stored DB values stay in English (enum),
// but the UI always shows the Hebrew label.
export const CITY_LABELS_HE: Record<CityOption, string> = {
  Ashkelon: "אשקלון",
  "Kiryat Gat": "קרית גת",
  Ashdod: "אשדוד",
  "Tel Aviv": "תל אביב",
  Jerusalem: "ירושלים",
  Haifa: "חיפה",
  "Beer Sheva": "באר שבע",
  Netanya: "נתניה",
  "Rishon LeZion": "ראשון לציון",
  "Petah Tikva": "פתח תקווה",
  Holon: "חולון",
  "Bnei Brak": "בני ברק",
  "Ramat Gan": "רמת גן",
  "Bat Yam": "בת ים",
  Rehovot: "רחובות",
  Herzliya: "הרצליה",
  "Kfar Saba": "כפר סבא",
  Modiin: "מודיעין",
  Eilat: "אילת",
  Tiberias: "טבריה",
  Nazareth: "נצרת",
  Acre: "עכו",
  Lod: "לוד",
  Ramla: "רמלה",
  Afula: "עפולה",
  Nahariya: "נהריה",
  "Nes Ziona": "נס ציונה",
  "Beit Shemesh": "בית שמש",
  "Kiryat Ata": "קרית אתא",
  "Kiryat Bialik": "קרית ביאליק",
  "Rosh HaAyin": "ראש העין",
  Yavne: "יבנה",
  Dimona: "דימונה",
  Sderot: "שדרות",
  "Beit Shean": "בית שאן",
  Other: "אחר",
};

export function cityLabel(value: string | null | undefined): string {
  if (!value) return "";
  if ((CITY_LABELS_HE as Record<string, string>)[value]) return CITY_LABELS_HE[value as CityOption];
  const canonical = normalizeCityValue(value);
  return canonical ? CITY_LABELS_HE[canonical] : value;
}

// Map common Hebrew/English variants to canonical enum value.
const CITY_ALIASES: Record<string, CityOption> = {
  ashkelon: "Ashkelon", אשקלון: "Ashkelon",
  kiryatgat: "Kiryat Gat", קריתגת: "Kiryat Gat", קרייתגת: "Kiryat Gat",
  ashdod: "Ashdod", אשדוד: "Ashdod",
  telaviv: "Tel Aviv", תלאביב: "Tel Aviv", תלאביביפו: "Tel Aviv",
  jerusalem: "Jerusalem", ירושלים: "Jerusalem",
  haifa: "Haifa", חיפה: "Haifa",
  beersheva: "Beer Sheva", בארשבע: "Beer Sheva", beersheba: "Beer Sheva",
  netanya: "Netanya", נתניה: "Netanya",
  rishonlezion: "Rishon LeZion", ראשוןלציון: "Rishon LeZion",
  petahtikva: "Petah Tikva", פתחתקווה: "Petah Tikva", petachtikva: "Petah Tikva",
  holon: "Holon", חולון: "Holon",
  bneibrak: "Bnei Brak", בניברק: "Bnei Brak",
  ramatgan: "Ramat Gan", רמתגן: "Ramat Gan",
  batyam: "Bat Yam", בתים: "Bat Yam",
  rehovot: "Rehovot", רחובות: "Rehovot",
  herzliya: "Herzliya", הרצליה: "Herzliya",
  kfarsaba: "Kfar Saba", כפרסבא: "Kfar Saba",
  modiin: "Modiin", מודיעין: "Modiin",
  eilat: "Eilat", אילת: "Eilat",
  tiberias: "Tiberias", טבריה: "Tiberias",
  nazareth: "Nazareth", נצרת: "Nazareth",
  acre: "Acre", עכו: "Acre", akko: "Acre",
  lod: "Lod", לוד: "Lod",
  ramla: "Ramla", רמלה: "Ramla",
  afula: "Afula", עפולה: "Afula",
  nahariya: "Nahariya", נהריה: "Nahariya",
  nesziona: "Nes Ziona", נסציונה: "Nes Ziona",
  beitshemesh: "Beit Shemesh", ביתשמש: "Beit Shemesh",
  kiryatata: "Kiryat Ata", קריתאתא: "Kiryat Ata",
  kiryatbialik: "Kiryat Bialik", קריתביאליק: "Kiryat Bialik",
  roshhaayin: "Rosh HaAyin", ראשהעין: "Rosh HaAyin",
  yavne: "Yavne", יבנה: "Yavne",
  dimona: "Dimona", דימונה: "Dimona",
  sderot: "Sderot", שדרות: "Sderot",
  beitshean: "Beit Shean", ביתשאן: "Beit Shean",
  other: "Other", אחר: "Other",
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[\s_\-:()'"]/g, "").trim();
}

export function normalizeCityValue(value: string): CityOption | undefined {
  const key = normalizeKey(value);
  if (!key) return undefined;
  return CITY_ALIASES[key];
}
