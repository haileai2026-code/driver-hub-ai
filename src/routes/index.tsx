import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  Bot,
  Building2,
  Car,
  CheckCircle2,
  Clock3,
  FileWarning,
  Languages,
  LineChart,
  MessageSquareText,
  RadioTower,
  Send,
  ShieldCheck,
  UploadCloud,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { importCandidatesFromRows } from "@/lib/candidate-import.functions";
import { generateHaileAiText } from "@/lib/haile-ai.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Haile AI Recruitment Command" },
      {
        name: "description",
        content:
          "Haile AI dashboard for multilingual driver recruitment, operations, finance, fleet assets and AI intelligence.",
      },
      { property: "og:title", content: "Haile AI Recruitment Command" },
      {
        property: "og:description",
        content:
          "Hebrew, Amharic and Russian command center for candidate pipeline and management.",
      },
    ],
  }),
  component: Index,
});

type Language = "he" | "am" | "ru";
type Stage = Tables<"candidates">["stage"];
type CandidateRow = Tables<"candidates">;
type FinanceRow = Tables<"finance_entries">;
type AssetRow = Tables<"company_assets">;
type LogRow = Tables<"operation_logs">;

type Candidate = {
  id: string;
  name: Record<Language, string>;
  age: number | null;
  city: CandidateRow["city"];
  phone: string;
  language: Language;
  licenseStatus: CandidateRow["license_status"];
  stage: Stage;
  documents: { id: boolean; green: boolean };
  nextStep: string;
  note: string;
};

type FinanceSummary = {
  key: string;
  city: string;
  company: string;
  pending: number;
  paid: number;
};

const emptyName: Record<Language, string> = { he: "", am: "", ru: "" };

const copy = {
  he: {
    nav: ["פיקוד", "תפעול", "כספים", "AI ושפות"],
    title: "Haile AI",
    subtitle: "מערכת גיוס וניהול נהגים רב-לשונית",
    command: "מרכז פיקוד",
    ciel: "סיאל · COO",
    scat: "סקט · CFO",
    exec: "בני CEO · סול EVP",
    placements: "השמות",
    growth: "מועמדים פעילים",
    pending: "גבייה פתוחה",
    missing: "חסרי מסמכים",
    pipeline: "Pipeline נהגים",
    reminder: "צור תזכורת WhatsApp",
    revenue: "הכנסות לפי עיר",
    assets: "נכסי חברה · Arrizo 8",
    feed: "Intelligence Feed",
    profile: "פרופיל מועמד + AI",
    translate: "תרגום ניהול לעברית",
    template: "סטטוס בשפת הנהג",
    askAi: "הצע צעד הבא",
    importTitle: "ייבוא מועמדים",
    importAction: "ייבא CSV / Excel",
    importReady: "הקובץ מוכן לייבוא",
    importDone: "ייבוא הושלם",
    emptyCandidates: "אין עדיין מועמדים במסד הנתונים.",
    emptyFinance: "אין עדיין רשומות כספים אמיתיות.",
    emptyAssets: "אין עדיין רכבי חברה במערכת.",
    emptyLogs: "אין עדיין יומן פעילות אמיתי.",
    authNotice: "כדי לראות נתונים אמיתיים יש להתחבר עם משתמש שקיבל הרשאה במערכת.",
  },
  am: {
    nav: ["ትእዛዝ", "ኦፕሬሽን", "ፋይናንስ", "AI ቋንቋዎች"],
    title: "Haile AI",
    subtitle: "ብዙ ቋንቋ የአሽከርካሪ ምልመላ እና አስተዳደር",
    command: "የትእዛዝ ማዕከል",
    ciel: "ሲኤል · COO",
    scat: "ስካት · CFO",
    exec: "ቤኒ CEO · ሶል EVP",
    placements: "ቦታ ማስያዝ",
    growth: "ንቁ እጩዎች",
    pending: "ያልተከፈለ",
    missing: "ሰነድ የጎደላቸው",
    pipeline: "የአሽከርካሪዎች Pipeline",
    reminder: "WhatsApp ማስታወሻ ፍጠር",
    revenue: "ገቢ በከተማ",
    assets: "የኩባንያ ንብረቶች · Arrizo 8",
    feed: "የመረጃ ፍሰት",
    profile: "የእጩ ፕሮፋይል + AI",
    translate: "ወደ ዕብራይስጥ ትርጉም",
    template: "በሹፌሩ ቋንቋ ሁኔታ",
    askAi: "ቀጣይ እርምጃ",
    importTitle: "እጩዎችን አስመጣ",
    importAction: "CSV / Excel አስመጣ",
    importReady: "ፋይሉ ለማስመጣት ዝግጁ ነው",
    importDone: "ማስመጣት ተጠናቋል",
    emptyCandidates: "በዳታቤዝ ውስጥ እጩዎች አልተገኙም።",
    emptyFinance: "የፋይናንስ መዝገቦች አልተገኙም።",
    emptyAssets: "የኩባንያ ተሽከርካሪዎች አልተገኙም።",
    emptyLogs: "የኦፕሬሽን መዝገቦች አልተገኙም።",
    authNotice: "እውነተኛ ዳታ ለማየት የተፈቀደ ተጠቃሚ መግባት አለበት።",
  },
  ru: {
    nav: ["Командование", "Операции", "Финансы", "AI и языки"],
    title: "Haile AI",
    subtitle: "Многоязычная система найма и управления водителями",
    command: "Командный центр",
    ciel: "Ciel · COO",
    scat: "Scat · CFO",
    exec: "Beny CEO · Sol EVP",
    placements: "Трудоустройства",
    growth: "Активные кандидаты",
    pending: "Ожидает оплаты",
    missing: "Нет документов",
    pipeline: "Pipeline водителей",
    reminder: "Создать WhatsApp",
    revenue: "Доход по городам",
    assets: "Активы компании · Arrizo 8",
    feed: "Intelligence Feed",
    profile: "Профиль кандидата + AI",
    translate: "Перевод на иврит",
    template: "Статус на языке водителя",
    askAi: "Следующий шаг",
    importTitle: "Импорт кандидатов",
    importAction: "Импорт CSV / Excel",
    importReady: "Файл готов к импорту",
    importDone: "Импорт завершен",
    emptyCandidates: "В базе пока нет кандидатов.",
    emptyFinance: "Финансовых записей пока нет.",
    emptyAssets: "Автомобилей компании пока нет.",
    emptyLogs: "Операционных записей пока нет.",
    authNotice: "Чтобы видеть реальные данные, войдите пользователем с доступом.",
  },
};

const stageTone: Record<Stage, string> = {
  Lead: "bg-muted text-muted-foreground",
  Learning: "bg-intel/20 text-intel-foreground",
  Test: "bg-warning/20 text-warning",
  Placed: "bg-success/20 text-success",
};

function Index() {
  const [language, setLanguage] = useState<Language>("he");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [finance, setFinance] = useState<FinanceSummary[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [aiText, setAiText] = useState(
    "בחר מועמד אמיתי מהרשימה כדי להפעיל את שכבת ה-AI הרב-לשונית.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string | number | boolean | null>[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("CSV / Excel: full_name, שם בעברית, שם באמהרית, שם ברוסית, phone, city.");
  const [isImporting, setIsImporting] = useState(false);
  const generateText = useServerFn(generateHaileAiText);
  const importCandidates = useServerFn(importCandidatesFromRows);
  const t = copy[language];

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsDataLoading(true);
      setLoadError(null);

      const [candidateResult, financeResult, assetResult, logResult] = await Promise.all([
        supabase.from("candidates").select("*").order("created_at", { ascending: false }),
        supabase.from("finance_entries").select("*").order("created_at", { ascending: false }),
        supabase.from("company_assets").select("*").order("created_at", { ascending: false }),
        supabase
          .from("operation_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (!active) return;

      const firstError =
        candidateResult.error ?? financeResult.error ?? assetResult.error ?? logResult.error;
      if (firstError) {
        setLoadError(firstError.message);
      }

      const realCandidates = (candidateResult.data ?? []).map(normalizeCandidate);
      setCandidates(realCandidates);
      setFinance(summarizeFinance(financeResult.data ?? []));
      setAssets(assetResult.data ?? []);
      setLogs(logResult.data ?? []);
      setSelectedId((current) => current ?? realCandidates[0]?.id ?? null);
      setIsDataLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  const refreshCandidates = async () => {
    const { data, error } = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
    if (error) {
      setImportStatus(error.message);
      return;
    }
    const realCandidates = (data ?? []).map(normalizeCandidate);
    setCandidates(realCandidates);
    setSelectedId(realCandidates[0]?.id ?? null);
  };

  const selected =
    candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;
  const missingCount = candidates.filter(
    (candidate) => !candidate.documents.id || !candidate.documents.green,
  ).length;
  const pendingTotal = finance.reduce((total, row) => total + row.pending, 0);
  const placedCount = candidates.filter((candidate) => candidate.stage === "Placed").length;
  const activeCount = candidates.filter((candidate) => candidate.stage !== "Placed").length;

  const metrics = useMemo(
    () => [
      { label: t.placements, value: String(placedCount), delta: "DB", icon: CheckCircle2 },
      { label: t.growth, value: String(activeCount), delta: "Live", icon: TrendingUp },
      { label: t.pending, value: formatCurrency(pendingTotal), delta: "Ledger", icon: Banknote },
      { label: t.missing, value: String(missingCount), delta: "Docs", icon: FileWarning },
    ],
    [activeCount, missingCount, pendingTotal, placedCount, t],
  );

  const runAi = async (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => {
    if (!selected) {
      setAiText("אין מועמד נבחר. הוסף או בחר מועמד אמיתי לפני הפעלת AI.");
      return;
    }

    setIsLoading(true);
    const missingDocuments = [
      !selected.documents.id ? "ID" : "",
      !selected.documents.green ? "Green Form" : "",
    ].filter(Boolean);

    try {
      const result = await generateText({
        data: {
          mode,
          language: mode === "translate_to_hebrew" ? "he" : selected.language,
          candidateName: selected.name.he || selected.name.am || selected.name.ru,
          stage: selected.stage,
          licenseStatus: selected.licenseStatus,
          missingDocuments,
          message: selected.note || "אין הודעה אחרונה שמורה למועמד.",
        },
      });
      setAiText(result.text);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseImportFile(file);
      setImportRows(rows);
      setImportFileName(file.name);
      setImportStatus(`${t.importReady}: ${rows.length} שורות זוהו עם מיפוי אוטומטי.`);
    } catch (error) {
      setImportRows([]);
      setImportFileName("");
      setImportStatus(error instanceof Error ? error.message : "לא ניתן לקרוא את הקובץ.");
    } finally {
      event.target.value = "";
    }
  };

  const runCandidateImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setImportStatus("יש להתחבר לפני ייבוא מועמדים.");
        return;
      }

      const result = await importCandidates({ data: { accessToken, rows: importRows } });
      setImportStatus(`${t.importDone}: ${result.inserted} נשמרו, ${result.skipped} דולגו${result.errors.length ? ` · ${result.errors.slice(0, 3).join(" · ")}` : ""}`);
      setImportRows([]);
      setImportFileName("");
      await refreshCandidates();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      dir={language === "he" ? "rtl" : "ltr"}
    >
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="glass-panel sticky top-4 z-10 flex flex-col gap-4 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-primary">
                {t.command}
              </p>
              <h1 className="font-display text-2xl font-black tracking-normal sm:text-3xl">
                {t.title}
              </h1>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t.nav.map((item) => (
              <span key={item} className="rounded-md border border-border bg-surface px-3 py-2">
                {item}
              </span>
            ))}
          </nav>
          <div className="flex rounded-md border border-border bg-surface p-1">
            {(["he", "am", "ru"] as Language[]).map((item) => (
              <button
                key={item}
                onClick={() => setLanguage(item)}
                className={`rounded-sm px-3 py-2 text-sm font-bold transition ${language === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {loadError && (
          <div className="rounded-lg border border-warning bg-warning/10 p-4 text-sm text-warning">
            {t.authNotice}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="glass-panel signal-scan rounded-lg p-6 sm:p-8">
            <div className="relative z-[1] max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-black text-accent-foreground">
                <RadioTower className="h-4 w-4" /> {t.exec}
              </p>
              <h2 className="font-display text-4xl font-black leading-tight tracking-normal sm:text-6xl">
                {t.subtitle}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                הנתונים במסך נטענים ישירות ממסד הנתונים של Haile AI בלבד.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article
                  key={metric.label}
                  className="glass-panel rounded-lg p-5 transition duration-300 hover:-translate-y-1"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="rounded-sm bg-success/20 px-2 py-1 text-xs font-black text-success">
                      {metric.delta}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <strong className="mt-1 block text-3xl font-black">
                    {isDataLoading ? "…" : metric.value}
                  </strong>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="glass-panel rounded-lg p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-primary">{t.ciel}</p>
                <h2 className="text-2xl font-black">{t.pipeline}</h2>
              </div>
              <Button
                variant="command"
                onClick={() => runAi("status_template")}
                disabled={isLoading || !selected}
              >
                <Send className="h-4 w-4" /> {t.reminder}
              </Button>
            </div>
            {candidates.length === 0 ? (
              <EmptyState text={isDataLoading ? "טוען נתונים אמיתיים..." : t.emptyCandidates} />
            ) : (
              <div className="grid gap-3">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => setSelectedId(candidate.id)}
                    className={`grid gap-4 rounded-lg border p-4 text-start transition duration-300 hover:-translate-y-0.5 sm:grid-cols-[1fr_auto_auto] sm:items-center ${selected?.id === candidate.id ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
                  >
                    <div>
                      <h3 className="text-lg font-black">{candidate.name[language]}</h3>
                      <p className="text-sm text-muted-foreground">
                        {candidate.city} · {candidate.phone} · {candidate.licenseStatus}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-sm px-3 py-1 text-xs font-black ${stageTone[candidate.stage]}`}
                    >
                      {candidate.stage}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {candidate.documents.id && candidate.documents.green ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <FileWarning className="h-4 w-4 text-warning" />
                      )}
                      ID {candidate.documents.id ? "✓" : "—"} · Green{" "}
                      {candidate.documents.green ? "✓" : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.feed}</p>
            <h2 className="mb-4 text-2xl font-black">Live command notes</h2>
            {logs.length === 0 ? (
              <EmptyState text={isDataLoading ? "טוען יומן פעילות..." : t.emptyLogs} />
            ) : (
              <div className="space-y-3">
                {logs.map((item) => (
                  <div key={item.id} className="rounded-md border border-border bg-surface p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Clock3 className="h-4 w-4 text-accent" /> {formatDate(item.created_at)} ·{" "}
                      {item.operator_name}
                    </div>
                    <p className="text-sm leading-6">
                      {item.translated_hebrew ||
                        item.notes_hebrew ||
                        item.source_message ||
                        item.interaction_type}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.scat}</p>
            <h2 className="mb-5 text-2xl font-black">{t.revenue}</h2>
            {finance.length === 0 ? (
              <EmptyState text={isDataLoading ? "טוען כספים..." : t.emptyFinance} />
            ) : (
              <div className="space-y-4">
                {finance.map((row) => (
                  <div key={row.key} className="rounded-md border border-border bg-surface p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <strong>
                        {row.city} · {row.company}
                      </strong>
                      <span className="text-xl font-black">{formatCurrency(row.pending)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-warning"
                        style={{ width: `${getPendingRatio(row)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Pending vs received ledger balance
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-lg p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary">Company Assets</p>
                <h2 className="text-2xl font-black">{t.assets}</h2>
              </div>
              <Car className="h-8 w-8 text-accent" />
            </div>
            {assets.length === 0 ? (
              <EmptyState text={isDataLoading ? "טוען רכבים..." : t.emptyAssets} />
            ) : (
              <div className="grid gap-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-surface p-4"
                  >
                    <div>
                      <strong>{asset.vehicle_name}</strong>
                      <p className="text-sm text-muted-foreground">
                        {asset.plate_number} · {asset.mileage.toLocaleString()} km
                      </p>
                    </div>
                    <span
                      className={`rounded-sm px-2 py-1 text-xs font-black ${asset.status === "service_due" ? "bg-warning/20 text-warning" : "bg-success/20 text-success"}`}
                    >
                      {asset.next_service_date ? formatDate(asset.next_service_date) : asset.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.profile}</p>
            {selected ? (
              <>
                <h2 className="mt-1 text-3xl font-black">{selected.name[language]}</h2>
                <div className="mt-5 grid gap-3 text-sm">
                  <Info icon={UsersRound} label="City" value={selected.city} />
                  <Info icon={Building2} label="Stage" value={selected.stage} />
                  <Info icon={Languages} label="Native" value={selected.language.toUpperCase()} />
                  <Info icon={LineChart} label="Next" value={selected.nextStep} />
                </div>
              </>
            ) : (
              <EmptyState text={t.emptyCandidates} />
            )}
          </div>

          <div className="glass-panel rounded-lg p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-primary">AI Translation Layer</p>
                <h2 className="text-2xl font-black">{t.translate}</h2>
              </div>
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-5 text-base leading-8 text-foreground">
              {isLoading ? "AI מנתח את המידע..." : aiText}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="command"
                onClick={() => runAi("candidate_next_step")}
                disabled={isLoading || !selected}
              >
                <Bot className="h-4 w-4" /> {t.askAi}
              </Button>
              <Button
                variant="intel"
                onClick={() => runAi("translate_to_hebrew")}
                disabled={isLoading || !selected}
              >
                <Languages className="h-4 w-4" /> {t.translate}
              </Button>
              <Button
                variant="tactical"
                onClick={() => runAi("status_template")}
                disabled={isLoading || !selected}
              >
                <MessageSquareText className="h-4 w-4" /> {t.template}
              </Button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function normalizeCandidate(row: CandidateRow): Candidate {
  const name = normalizeName(row.full_name, row.phone);
  const documents = normalizeDocuments(row.documents);
  const note =
    getLocalizedText(row.localized_profile, "he") ||
    getLocalizedText(row.localized_profile, row.preferred_language) ||
    "";

  return {
    id: row.id,
    name,
    age: row.age,
    city: row.city,
    phone: row.phone,
    language: row.preferred_language,
    licenseStatus: row.license_status,
    stage: row.stage,
    documents,
    nextStep: row.next_step_due_at ? formatDate(row.next_step_due_at) : "לא נקבע",
    note,
  };
}

function normalizeName(value: Json, fallback: string): Record<Language, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { he: fallback, am: fallback, ru: fallback };
  }

  const record = value as Partial<Record<Language, Json>>;
  const base = { ...emptyName };
  const firstText =
    [record.he, record.am, record.ru].find(
      (item): item is string => typeof item === "string" && item.length > 0,
    ) ?? fallback;

  return {
    he: typeof record.he === "string" && record.he.length > 0 ? record.he : firstText,
    am: typeof record.am === "string" && record.am.length > 0 ? record.am : firstText,
    ru: typeof record.ru === "string" && record.ru.length > 0 ? record.ru : firstText,
  } satisfies Record<Language, string>;
}

function normalizeDocuments(value: Json): Candidate["documents"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { id: false, green: false };
  }

  const record = value as Record<string, Json | undefined>;
  return {
    id: isReceived(record.id),
    green: isReceived(record.green_form) || isReceived(record.green),
  };
}

function isReceived(value: Json | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, Json | undefined>;
  return record.received === true;
}

function getLocalizedText(value: Json, language: Language): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, Json | undefined>;
  const languageValue = record[language];

  if (typeof languageValue === "string") return languageValue;
  if (languageValue && typeof languageValue === "object" && !Array.isArray(languageValue)) {
    const nested = languageValue as Record<string, Json | undefined>;
    const note = nested.note ?? nested.notes ?? nested.summary;
    return typeof note === "string" ? note : "";
  }

  return "";
}

function summarizeFinance(rows: FinanceRow[]): FinanceSummary[] {
  const map = new Map<string, FinanceSummary>();

  rows.forEach((row) => {
    const city = row.city ?? "General";
    const company = row.company ?? "General";
    const key = `${city}-${company}`;
    const current = map.get(key) ?? { key, city, company, pending: 0, paid: 0 };

    if (row.status === "paid" || row.entry_type === "revenue_received") {
      current.paid += Number(row.amount);
    } else if (row.entry_type === "revenue_pending") {
      current.pending += Number(row.amount);
    }

    map.set(key, current);
  });

  return Array.from(map.values()).filter((row) => row.pending > 0 || row.paid > 0);
}

function getPendingRatio(row: FinanceSummary) {
  const total = row.pending + row.paid;
  return total === 0 ? 0 : Math.round((row.pending / total) * 100);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-5 text-sm leading-7 text-muted-foreground">
      {text}
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
