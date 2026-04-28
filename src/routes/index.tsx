import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Gauge,
  Headphones,
  Home,
  KeyRound,
  Languages,
  Mail,
  Menu,
  Mic,
  PanelRightClose,
  Phone,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserPlus,
  UsersRound,
  X,
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
      { title: "היילה AI — מערכת גיוס נהגים" },
      {
        name: "description",
        content: "מערכת ניהול גיוס נהגים בעברית, RTL, עם מועמדים, סוכני AI, דוחות וניהול גישה.",
      },
      { property: "og:title", content: "היילה AI — מערכת גיוס נהגים" },
      {
        property: "og:description",
        content: "לוח בקרה מבצעי לניהול מועמדים, לידים, סוכני AI ודוחות לקוחות.",
      },
    ],
  }),
  component: HaileApp,
});

type PageKey =
  | "dashboard"
  | "candidates"
  | "agents"
  | "reports"
  | "sol"
  | "ciel"
  | "voice"
  | "settings"
  | "admin";
type CandidateRow = Tables<"candidates">;
type LogRow = Tables<"operation_logs">;
type Candidate = {
  id: string;
  name: string;
  phone: string;
  city: string;
  language: string;
  licenseStatus: string;
  stage: string;
  grade: "A" | "B" | "C" | "—";
  score: number | null;
  createdAt: string;
  documentsReady: boolean;
  note: string;
};

const navItems: Array<{
  key: PageKey;
  label: string;
  path: string;
  icon: typeof Home;
  superOnly?: boolean;
}> = [
  { key: "dashboard", label: "לוח בקרה", path: "/dashboard", icon: Home },
  { key: "candidates", label: "מועמדים", path: "/candidates", icon: UsersRound },
  { key: "agents", label: "סוכני AI", path: "/agents", icon: Bot },
  { key: "reports", label: "דוחות", path: "/reports", icon: BarChart3 },
  { key: "sol", label: "SOL", path: "/sol", icon: CalendarClock },
  { key: "ciel", label: "CIEL", path: "/ciel", icon: Activity },
  { key: "voice", label: "Voice", path: "/voice", icon: Mic },
  { key: "settings", label: "הגדרות", path: "/settings", icon: Settings },
  { key: "admin", label: "ניהול גישה", path: "/admin/users", icon: ShieldCheck, superOnly: true },
];

const stageLabels: Record<string, string> = {
  Lead: "ליד",
  Learning: "סינון",
  Test: "ראיון",
  Placed: "מועסק",
};

function HaileApp() {
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("הכל");
  const [importRows, setImportRows] = useState<Record<string, string | number | boolean | null>[]>(
    [],
  );
  const [importStatus, setImportStatus] = useState(
    "בחר קובץ CSV או Excel כדי לייבא מועמדים אמיתיים.",
  );
  const [isImporting, setIsImporting] = useState(false);
  const [aiText, setAiText] = useState("בחר מועמד כדי להפעיל תרגום או ניסוח הודעה.");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const importCandidates = useServerFn(importCandidatesFromRows);
  const generateText = useServerFn(generateHaileAiText);

  useEffect(() => {
    void loadLiveData();
  }, []);

  const loadLiveData = async () => {
    setIsLoadingData(true);
    setLoadError(null);

    const [candidateResult, logResult] = await Promise.all([
      supabase.from("candidates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("operation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (candidateResult.error || logResult.error) {
      setLoadError("כדי להציג נתונים אמיתיים צריך להתחבר עם משתמש מורשה.");
    }

    const normalized = (candidateResult.data ?? []).map(normalizeCandidate);
    setCandidates(normalized);
    setLogs(logResult.data ?? []);
    setSelectedId((current) => current ?? normalized[0]?.id ?? null);
    setIsLoadingData(false);
  };

  const selected =
    candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;
  const filteredCandidates = useMemo(() => {
    const term = searchTerm.trim();
    return candidates.filter((candidate) => {
      const matchesTerm =
        !term ||
        candidate.name.includes(term) ||
        candidate.phone.includes(term) ||
        candidate.city.includes(term);
      const matchesStatus = statusFilter === "הכל" || stageLabels[candidate.stage] === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [candidates, searchTerm, statusFilter]);

  const activeCandidates = candidates.filter((candidate) => candidate.stage !== "Placed").length;
  const placedCandidates = candidates.filter((candidate) => candidate.stage === "Placed").length;
  const avgScore = average(
    candidates
      .map((candidate) => candidate.score)
      .filter((score): score is number => score !== null),
  );
  const missingDocs = candidates.filter((candidate) => !candidate.documentsReady).length;

  const handleNavigation = (page: PageKey) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseImportFile(file);
      setImportRows(rows);
      setImportStatus(`${file.name}: זוהו ${rows.length} שורות מוכנות לייבוא.`);
    } catch (error) {
      setImportRows([]);
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
        setImportStatus("יש להתחבר עם משתמש מורשה לפני ייבוא מועמדים.");
        return;
      }
      const result = await importCandidates({ data: { accessToken, rows: importRows } });
      setImportStatus(`ייבוא הושלם: ${result.inserted} נשמרו, ${result.skipped} דולגו.`);
      setImportRows([]);
      await loadLiveData();
    } finally {
      setIsImporting(false);
    }
  };

  const runAi = async (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => {
    if (!selected) {
      setAiText("אין מועמד נבחר.");
      return;
    }

    setIsAiLoading(true);
    try {
      const result = await generateText({
        data: {
          mode,
          language:
            selected.language === "עברית" ? "he" : selected.language === "רוסית" ? "ru" : "am",
          candidateName: selected.name,
          stage: selected.stage,
          licenseStatus: selected.licenseStatus,
          missingDocuments: selected.documentsReady ? [] : ["מסמכים חסרים"],
          message: selected.note || "אין הודעה אחרונה שמורה למועמד.",
        },
      });
      setAiText(result.text);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 right-0 z-40 w-72 border-l border-sidebar-border bg-sidebar p-4 text-sidebar-foreground transition-transform duration-300 lg:sticky lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
        >
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <strong className="block text-lg">היילה AI</strong>
                <span className="text-xs text-muted-foreground">בני אספה · SUPER_ADMIN</span>
              </div>
            </div>
            <button
              className="lg:hidden"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="סגור ניווט"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigation(item.key)}
                  className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 py-2 text-right text-sm font-bold transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] opacity-80">
                    {item.superOnly && <KeyRound className="h-3 w-3" />}
                    {item.path}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-background/70 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="סגור תפריט"
          />
        )}

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-background/92 px-4 backdrop-blur lg:px-7">
            <div className="flex items-center gap-3">
              <Button
                variant="tactical"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="פתח ניווט"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-xs font-bold text-primary">
                  {navItems.find((item) => item.key === activePage)?.path}
                </p>
                <h1 className="text-xl font-black sm:text-2xl">
                  {navItems.find((item) => item.key === activePage)?.label}
                </h1>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              עברית · RTL · נתונים אמיתיים בלבד
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-7">
            {loadError && <Notice tone="warning" text={loadError} />}
            {activePage === "dashboard" && (
              <DashboardPage
                activeCandidates={activeCandidates}
                placedCandidates={placedCandidates}
                avgScore={avgScore}
                missingDocs={missingDocs}
                candidates={candidates}
                logs={logs}
                isLoading={isLoadingData}
                onOpenCandidates={() => setActivePage("candidates")}
              />
            )}
            {activePage === "candidates" && (
              <CandidatesPage
                candidates={filteredCandidates}
                selected={selected}
                searchTerm={searchTerm}
                statusFilter={statusFilter}
                importRows={importRows.length}
                importStatus={importStatus}
                isImporting={isImporting}
                onSearch={setSearchTerm}
                onFilter={setStatusFilter}
                onSelect={setSelectedId}
                onFile={handleImportFile}
                onImport={runCandidateImport}
                onAi={runAi}
                aiText={aiText}
                isAiLoading={isAiLoading}
              />
            )}
            {activePage === "agents" && <AgentsPage />}
            {activePage === "reports" && <ReportsPage />}
            {activePage === "sol" && <SolPage />}
            {activePage === "ciel" && <CielPage candidates={candidates} logs={logs} />}
            {activePage === "voice" && <VoicePage />}
            {activePage === "settings" && <SettingsPage />}
            {activePage === "admin" && <AdminUsersPage />}
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardPage({
  activeCandidates,
  placedCandidates,
  avgScore,
  missingDocs,
  candidates,
  logs,
  isLoading,
  onOpenCandidates,
}: {
  activeCandidates: number;
  placedCandidates: number;
  avgScore: number | null;
  missingDocs: number;
  candidates: Candidate[];
  logs: LogRow[];
  isLoading: boolean;
  onOpenCandidates: () => void;
}) {
  const metrics = [
    { label: "מועמדים פעילים", value: activeCandidates, icon: UsersRound, suffix: "" },
    { label: "מועסקים", value: placedCandidates, icon: CheckCircle2, suffix: "" },
    {
      label: "ממוצע ציון ראיון",
      value: avgScore ?? "—",
      icon: Gauge,
      suffix: avgScore ? "/10" : "",
    },
    { label: "חסרי מסמכים", value: missingDocs, icon: AlertTriangle, suffix: "" },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="glass-panel rounded-lg p-4">
              <div className="mb-5 flex items-center justify-between">
                <Icon className="h-5 w-5 text-primary" />
                <span className="rounded-sm bg-success/15 px-2 py-1 text-xs font-bold text-success">
                  חי
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <strong className="mt-1 block text-3xl font-black">
                {isLoading ? "…" : `${metric.value}${metric.suffix}`}
              </strong>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel
          title="מועמדים אחרונים"
          action={
            <Button variant="tactical" onClick={onOpenCandidates}>
              פתח מועמדים <ChevronLeft className="h-4 w-4" />
            </Button>
          }
        >
          {candidates.length === 0 ? (
            <EmptyState
              text={isLoading ? "טוען מועמדים..." : "אין עדיין מועמדים אמיתיים במערכת."}
            />
          ) : (
            <CandidateTable candidates={candidates.slice(0, 6)} onSelect={onOpenCandidates} />
          )}
        </Panel>
        <Panel title="התראות אחרונות">
          {logs.length === 0 ? (
            <EmptyState text="אין עדיין התראות או לוגים להצגה." />
          ) : (
            <ActivityList logs={logs} />
          )}
        </Panel>
      </section>

      <Panel title="גרף שבועי">
        <div className="grid h-56 place-items-center rounded-md border border-dashed border-border bg-surface text-center text-sm text-muted-foreground">
          הגרף יוצג לאחר שיצטברו לידים ופעולות אמת במערכת.
        </div>
      </Panel>
    </div>
  );
}

function CandidatesPage({
  candidates,
  selected,
  searchTerm,
  statusFilter,
  importRows,
  importStatus,
  isImporting,
  onSearch,
  onFilter,
  onSelect,
  onFile,
  onImport,
  onAi,
  aiText,
  isAiLoading,
}: {
  candidates: Candidate[];
  selected: Candidate | null;
  searchTerm: string;
  statusFilter: string;
  importRows: number;
  importStatus: string;
  isImporting: boolean;
  onSearch: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  onAi: (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => void;
  aiText: string;
  isAiLoading: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel
        title="רשימת מועמדים"
        action={
          <ImportControls
            importRows={importRows}
            importStatus={importStatus}
            isImporting={isImporting}
            onFile={onFile}
            onImport={onImport}
          />
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="חיפוש לפי שם, טלפון או עיר"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => onFilter(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm outline-none"
          >
            {["הכל", "ליד", "סינון", "ראיון", "מועסק"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {candidates.length === 0 ? (
          <EmptyState text="אין מועמדים להצגה לפי הסינון הנוכחי." />
        ) : (
          <div className="grid gap-3">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                active={selected?.id === candidate.id}
                onClick={() => onSelect(candidate.id)}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="פרופיל מועמד + CIEL">
        {!selected ? (
          <EmptyState text="בחר מועמד כדי לפתוח פרופיל." />
        ) : (
          <CandidateProfile
            candidate={selected}
            onAi={onAi}
            aiText={aiText}
            isAiLoading={isAiLoading}
          />
        )}
      </Panel>
    </div>
  );
}

function AgentsPage() {
  const agents = [
    { name: "סוכן גיוס", icon: Bot, description: "מסנן לידים ומנהל שיחה ראשונית", tone: "primary" },
    {
      name: "Voice Agent",
      icon: Mic,
      description: "מבצע ראיון קולי ודירוג A/B/C",
      tone: "success",
    },
    { name: "CIEL", icon: Activity, description: "מנטר לידים, פעולות ודוחות", tone: "intel" },
    {
      name: "SOL",
      icon: CalendarClock,
      description: "יומן, מיילים ותזכורות לבני",
      tone: "warning",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map((agent) => (
        <AgentCard key={agent.name} {...agent} />
      ))}
    </div>
  );
}

function SolPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="חיבורים">
        <ConnectionRow icon={CalendarClock} label="Google Calendar" />
        <ConnectionRow icon={Mail} label="Gmail" />
      </Panel>
      <Panel title="שיחה עם SOL">
        <EmptyState text="ממשק הצ׳אט יופעל לאחר חיבור יומן ומיילים." />
      </Panel>
      <Panel title="סיכום בוקר">
        <SettingsGrid
          items={[
            "שעת שליחה: 07:30",
            "WhatsApp לקבלה: לא הוגדר",
            "תוכן: פגישות, מיילים דחופים, מועמדים חדשים",
          ]}
        />
      </Panel>
      <Panel title="מיילים דחופים">
        <EmptyState text="אין מיילים מסוננים להצגה כרגע." />
      </Panel>
    </div>
  );
}

function CielPage({ candidates, logs }: { candidates: Candidate[]; logs: LogRow[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="ניטור לידים בזמן אמת">
        <EmptyState text="לידים חדשים יוצגו כאן בזמן אמת לאחר חיבור WhatsApp/SMS/Voice." />
      </Panel>
      <Panel title="מבצעי גיוס">
        <SettingsGrid
          items={[
            `מועמדים פעילים: ${candidates.length}`,
            "שיחות היום: לא מחובר",
            "מועמדי A השבוע: לפי נתוני אמת בלבד",
          ]}
        />
      </Panel>
      <Panel title="דוחות אוטומטיים">
        <SettingsGrid items={["תדירות: שבועי", "נמענים: אגד / אקסטרה", "פורמט: PDF"]} />
      </Panel>
      <Panel title="לוג פעולות">
        {logs.length ? <ActivityList logs={logs} /> : <EmptyState text="אין לוגים להצגה." />}
      </Panel>
    </div>
  );
}

function VoicePage() {
  return (
    <div className="space-y-5">
      <Panel title="סטטוס מרכזייה">
        <Notice tone="success" text="ממשק הניהול מוכן. חיבור Voice יוגדר בשלב אינטגרציה." />
      </Panel>
      <Panel title="שאלות סינון">
        <SettingsGrid items={["גיל: 21–65", "סוג רישיון: C / D / E", "עיר מגורים: רשימה מוגדרת"]} />
      </Panel>
      <Panel title="דירוג A/B/C">
        <SettingsGrid
          items={["A = עומד ב־3/3 קריטריונים", "B = עומד ב־2/3 קריטריונים", "C = 1/3 ומטה"]}
        />
      </Panel>
      <Panel title="לוג שיחות אחרונות">
        <EmptyState text="שיחות יוצגו כאן לאחר חיבור Twilio/Voice." />
      </Panel>
    </div>
  );
}

function ReportsPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="יצירת דוח ידני">
        <SettingsGrid
          items={["לקוח: אגד / אקסטרה / אחר", "טווח תאריכים", "תוכן: התקדמו / נשרו / הושמו"]}
        />
        <Button className="mt-4 min-h-11" variant="command">
          <FileText className="h-4 w-4" /> צור PDF
        </Button>
      </Panel>
      <Panel title="היסטוריית דוחות">
        <EmptyState text="אין דוחות שנוצרו עדיין." />
      </Panel>
      <Panel title="תצוגה מקדימה">
        <div className="grid h-72 place-items-center rounded-md border border-dashed border-border bg-surface text-muted-foreground">
          PDF יוצג כאן לאחר יצירה
        </div>
      </Panel>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="פרופיל מנכ״ל">
        <SettingsGrid items={["שם: בני אספה", "מייל: לא הוגדר", "טלפון WhatsApp: לא הוגדר"]} />
      </Panel>
      <Panel title="חיבורים">
        <SettingsGrid
          items={[
            "WhatsApp Business API",
            "Twilio SMS/Voice",
            "Google Calendar OAuth",
            "Gmail OAuth",
            "Claude API Key",
          ]}
        />
      </Panel>
      <Panel title="הגדרות מערכת">
        <SettingsGrid
          items={[
            "שעת סיכום בוקר: 07:30",
            "יעד מענה ללידים: 60 שניות",
            "שפות פעילות: עברית, אמהרית, רוסית, ערבית, צרפתית, אנגלית",
          ]}
        />
      </Panel>
      <Panel title="גיבוי נתונים">
        <Button variant="tactical">
          <UploadCloud className="h-4 w-4" /> ייצוא CSV של מועמדים
        </Button>
      </Panel>
    </div>
  );
}

function AdminUsersPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <Panel title="משתמשים פעילים">
        <EmptyState text="אין משתמשים פעילים להצגה עד שיוגדר מנהל ראשון." />
      </Panel>
      <Panel title="הזמנת משתמש חדש">
        <SettingsGrid items={["מייל", "תפקיד: OPERATOR / VIEWER", "תוקף הזמנה: עד 48 שעות"]} />
        <Button className="mt-4 min-h-11" variant="command">
          <UserPlus className="h-4 w-4" /> שלח הזמנה
        </Button>
      </Panel>
      <Panel title="הזמנות ממתינות">
        <EmptyState text="אין הזמנות ממתינות." />
      </Panel>
      <Panel title="לוג פעולות">
        <EmptyState text="לוג אבטחה יוצג לאחר הפעלת מערכת הזמנות." />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-lg p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CandidateCard({
  candidate,
  active,
  onClick,
}: {
  candidate: Candidate;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid gap-3 rounded-lg border p-4 text-right transition hover:-translate-y-0.5 md:grid-cols-[1fr_auto] ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
    >
      <div className="flex gap-3">
        <Initials name={candidate.name} />
        <div>
          <h3 className="font-black">{candidate.name}</h3>
          <p className="text-sm text-muted-foreground">
            {formatPhone(candidate.phone)} · {candidate.city} · {candidate.language}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge text={stageLabels[candidate.stage] ?? candidate.stage} />
        <GradeBadge grade={candidate.grade} />
      </div>
    </button>
  );
}

function CandidateProfile({
  candidate,
  onAi,
  aiText,
  isAiLoading,
}: {
  candidate: Candidate;
  onAi: (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => void;
  aiText: string;
  isAiLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Initials name={candidate.name} />
        <div>
          <h3 className="text-2xl font-black">{candidate.name}</h3>
          <p className="text-sm text-muted-foreground">
            {formatPhone(candidate.phone)} · {candidate.city}
          </p>
        </div>
      </div>
      <SettingsGrid
        items={[
          `רישיון: ${candidate.licenseStatus}`,
          `סטטוס: ${stageLabels[candidate.stage] ?? candidate.stage}`,
          `ציון ראיון: ${candidate.score ?? "—"}`,
          `דירוג: ${candidate.grade}`,
          `מסמכים: ${candidate.documentsReady ? "תקין" : "חסר"}`,
        ]}
      />
      <div className="rounded-md border border-border bg-background/60 p-4 text-sm leading-7">
        {isAiLoading ? "AI מנתח..." : aiText}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="command" onClick={() => onAi("candidate_next_step")}>
          <Bot className="h-4 w-4" /> הצע צעד הבא
        </Button>
        <Button variant="intel" onClick={() => onAi("translate_to_hebrew")}>
          <Languages className="h-4 w-4" /> תרגם לעברית
        </Button>
        <Button variant="tactical" onClick={() => onAi("status_template")}>
          <Phone className="h-4 w-4" /> הודעת סטטוס
        </Button>
      </div>
    </div>
  );
}

function CandidateTable({
  candidates,
  onSelect,
}: {
  candidates: Candidate[];
  onSelect: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="p-3 text-right">שם</th>
            <th className="p-3 text-right">טלפון</th>
            <th className="p-3 text-right">עיר</th>
            <th className="p-3 text-right">ציון</th>
            <th className="p-3 text-right">דירוג</th>
            <th className="p-3 text-right">סטטוס</th>
            <th className="p-3 text-right">תאריך</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.id} className="border-b border-border/70">
              <td className="p-3 font-bold">{candidate.name}</td>
              <td className="p-3">{formatPhone(candidate.phone)}</td>
              <td className="p-3">{candidate.city}</td>
              <td className="p-3">{candidate.score ?? "—"}</td>
              <td className="p-3">
                <GradeBadge grade={candidate.grade} />
              </td>
              <td className="p-3">
                <button onClick={onSelect}>
                  <StatusBadge text={stageLabels[candidate.stage] ?? candidate.stage} />
                </button>
              </td>
              <td className="p-3">{formatDate(candidate.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentCard({
  name,
  icon: Icon,
  description,
  tone,
}: {
  name: string;
  icon: typeof Bot;
  description: string;
  tone: string;
}) {
  return (
    <article className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-surface-strong">
            <Icon className={`h-5 w-5 text-${tone}`} />
          </div>
          <div>
            <h3 className="text-xl font-black">{name}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" /> לא מחובר
        </span>
      </div>
      <SettingsGrid items={["פעולות היום: 0", "פעולות השבוע: 0", "לוג אחרון: אין נתונים"]} />
      <Button className="mt-4" variant="tactical">
        <SlidersHorizontal className="h-4 w-4" /> הגדרות סוכן
      </Button>
    </article>
  );
}

function ImportControls({
  importRows,
  importStatus,
  isImporting,
  onFile,
  onImport,
}: {
  importRows: number;
  importStatus: string;
  isImporting: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="tactical" asChild>
        <label className="min-h-11 cursor-pointer">
          <UploadCloud className="h-4 w-4" /> בחר CSV / Excel
          <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={onFile} />
        </label>
      </Button>
      <Button
        variant="command"
        onClick={onImport}
        disabled={!importRows || isImporting}
        title={importStatus}
      >
        {isImporting ? "מייבא..." : `ייבא (${importRows})`}
      </Button>
    </div>
  );
}

function ActivityList({ logs }: { logs: LogRow[] }) {
  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-md border border-border bg-surface p-3">
          <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Bell className="h-3 w-3 text-primary" /> {formatDate(log.created_at)} ·{" "}
            {log.operator_name}
          </p>
          <p className="text-sm leading-6">
            {log.translated_hebrew ||
              log.notes_hebrew ||
              log.source_message ||
              log.interaction_type}
          </p>
        </div>
      ))}
    </div>
  );
}

function ConnectionRow({ icon: Icon, label }: { icon: typeof CalendarClock; label: string }) {
  return (
    <div className="mb-3 flex min-h-14 items-center justify-between rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2 font-bold">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </span>
      <Button variant="tactical" size="sm">
        התחבר
      </Button>
    </div>
  );
}

function SettingsGrid({ items }: { items: string[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item}
          className="rounded-md border border-border bg-surface p-3 text-sm text-muted-foreground"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function Notice({ tone, text }: { tone: "warning" | "success"; text: string }) {
  return (
    <div
      className={`mb-5 rounded-lg border p-4 text-sm ${tone === "success" ? "border-success bg-success/10 text-success" : "border-warning bg-warning/10 text-warning"}`}
    >
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-5 text-center text-sm leading-7 text-muted-foreground">
      {text}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?";
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-primary text-base font-black text-primary-foreground">
      {initials}
    </div>
  );
}

function StatusBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex rounded-sm bg-primary/15 px-2 py-1 text-xs font-bold text-primary">
      {text}
    </span>
  );
}

function GradeBadge({ grade }: { grade: Candidate["grade"] }) {
  const className =
    grade === "A"
      ? "bg-success/15 text-success"
      : grade === "B"
        ? "bg-warning/15 text-warning"
        : grade === "C"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-black ${className}`}>
      {grade}
    </span>
  );
}

function normalizeCandidate(row: CandidateRow): Candidate {
  const fullName = normalizeName(row.full_name, row.phone);
  const profile = normalizeProfile(row.localized_profile);
  const documentsReady = normalizeDocuments(row.documents);
  const score = typeof profile.score === "number" ? profile.score : null;
  return {
    id: row.id,
    name: fullName,
    phone: row.phone,
    city: String(row.city),
    language: languageLabel(row.preferred_language),
    licenseStatus: row.license_status,
    stage: row.stage,
    grade: gradeFromScore(score),
    score,
    createdAt: row.created_at,
    documentsReady,
    note: profile.note,
  };
}

function normalizeName(value: Json, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  return (
    [record.he, record.am, record.ru].find(
      (item): item is string => typeof item === "string" && item.length > 0,
    ) ?? fallback
  );
}

function normalizeProfile(value: Json): { note: string; score?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { note: "" };
  const record = value as Record<string, Json | undefined>;
  const he =
    record.he && typeof record.he === "object" && !Array.isArray(record.he)
      ? (record.he as Record<string, Json | undefined>)
      : {};
  const scoreValue = record.score ?? he.score;
  return {
    note:
      typeof he.note === "string" ? he.note : typeof record.note === "string" ? record.note : "",
    score: typeof scoreValue === "number" ? scoreValue : undefined,
  };
}

function normalizeDocuments(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, Json | undefined>;
  return isReceived(record.id) && (isReceived(record.green_form) || isReceived(record.green));
}

function isReceived(value: Json | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, Json | undefined>).received === true;
}

function languageLabel(value: string) {
  if (value === "he") return "עברית";
  if (value === "ru") return "רוסית";
  if (value === "am") return "אמהרית";
  return value;
}

function gradeFromScore(score: number | null): Candidate["grade"] {
  if (score === null) return "—";
  if (score >= 8) return "A";
  if (score >= 5) return "B";
  return "C";
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function parseImportFile(
  file: File,
): Promise<Record<string, string | number | boolean | null>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("הקובץ ריק או לא תקין.");
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false },
  );
  const cleanRows = rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.trim(),
          typeof value === "string" ? value.trim() : value,
        ]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));
  if (!cleanRows.length) throw new Error("לא נמצאו שורות מועמדים בקובץ.");
  return cleanRows.slice(0, 500);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  if (/^05\d{8}$/.test(local)) return `${local.slice(0, 3)}-${local.slice(3)}`;
  return value;
}
