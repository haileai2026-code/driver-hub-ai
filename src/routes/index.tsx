import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
  Database,
  Download,
  FileText,
  Gauge,
  Home,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  Menu,
  Mic,
  Pencil,
  Phone,
  Search,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  createCandidate,
  deleteCandidate,
  getAuthorizedSession,
  getLiveAppData,
  getWhatsAppReminderStats,
  updateCandidate,
  updateCandidateStage,
  type ReminderDelayCorrelation,
  type ReminderFailureReason,
  type ReminderStats,
} from "@/lib/app-data.functions";
import { cn } from "@/lib/utils";
import { createFirstSuperAdmin, inviteSystemUser } from "@/lib/auth.functions";
import { importCandidatesFromRows } from "@/lib/candidate-import.functions";
import {
  generateGmailWhatsAppReminder,
  searchCandidateEmails,
  draftCandidateFollowUpEmail,
  createGmailDraft,
  type CandidateEmail,
} from "@/lib/google-agent.functions";
import { applyHaileAiOperation, generateHaileAiText } from "@/lib/haile-ai.functions";
import {
  checkAutomationAgents,
  getRecentIntegrationFailures,
  sendMissingDocsWhatsAppReminders,
  sendTestNotification,
  type AutomationAgentStatus,
  type IntegrationFailure,
} from "@/lib/automation-agents.functions";
import { recordAgentAction, saveCandidateRating } from "@/lib/agents-actions.functions";
import { getAppSettings, saveAppSettings } from "@/lib/app-settings.functions";
import { chatWithAgent } from "@/lib/agent-chat.functions";
import { CITY_OPTIONS, CITY_LABELS_HE, cityLabel, type CityOption, normalizeCityValue } from "@/lib/cities";

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
  age: number | null;
  city: string;
  language: string;
  langCode: "he" | "am" | "ru";
  licenseStatus: string;
  stage: string;
  grade: "A" | "B" | "C" | "—";
  score: number | null;
  createdAt: string;
  updatedAt: string | null;
  documentsReady: boolean;
  note: string;
  partner: string | null;
  nextStepDueAt: string | null;
  lastContactedAt: string | null;
};
type AppRole = "super_admin" | "operator" | "viewer";
type AuthUser = { id: string; email: string; role: AppRole | null };
type SystemUser = { id: string; email: string; role: string; created_at: string };
type CandidateForm = {
  name: string;
  phone: string;
  age: string;
  city: CityOption;
  language: "he" | "am" | "ru";
  stage: "Lead" | "Learning" | "Test" | "Placed";
  licenseStatus: "Not Started" | "Learning" | "Theory Ready" | "Test Scheduled" | "Licensed";
  note: string;
  idDocument: boolean;
  greenForm: boolean;
};
type AuthMode = "login" | "firstAdmin";

type PartnerOption = "Egged" | "Afikim" | "Other";
type CandidateInlinePatch = {
  name: string;
  phone: string;
  age: string;
  city: CityOption;
  stage: "Lead" | "Learning" | "Test" | "Placed";
  license: "Not Started" | "Learning" | "Theory Ready" | "Test Scheduled" | "Licensed";
  language: "he" | "am" | "ru";
  partner: PartnerOption | null;
  notes: string;
};
const PARTNER_OPTIONS: PartnerOption[] = ["Egged", "Afikim", "Other"];
const LICENSE_OPTIONS = ["Not Started", "Learning", "Theory Ready", "Test Scheduled", "Licensed"] as const;
const LICENSE_LABELS: Record<(typeof LICENSE_OPTIONS)[number], string> = {
  "Not Started": "טרם החל",
  Learning: "לומד",
  "Theory Ready": "מוכן לתאוריה",
  "Test Scheduled": "טסט מתוזמן",
  Licensed: "מורשה",
};
const STAGE_OPTIONS = ["Lead", "Learning", "Test", "Placed"] as const;
const LANGUAGE_OPTIONS: Array<{ value: "he" | "am" | "ru"; label: string }> = [
  { value: "he", label: "עברית" },
  { value: "am", label: "אמהרית" },
  { value: "ru", label: "רוסית" },
];

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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authStatus, setAuthStatus] = useState("יש להתחבר כדי להפעיל את המערכת.");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [reminderStats, setReminderStats] = useState<ReminderStats | null>(null);
  const [isLoadingReminderStats, setIsLoadingReminderStats] = useState(false);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
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
  const [gmailReminder, setGmailReminder] = useState(
    "לחץ Generate WhatsApp Reminder כדי ליצור תזכורת באמהרית מהודעת Gmail אחרונה.",
  );
  const [isReminderLoading, setIsReminderLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState("המערכת מוכנה לפעולה.");
  const [agentStatuses, setAgentStatuses] = useState<AutomationAgentStatus[]>([]);
  const [isCheckingAgents, setIsCheckingAgents] = useState(false);
  const [isSendingWhatsAppReminders, setIsSendingWhatsAppReminders] = useState(false);
  const [candidateForm, setCandidateForm] = useState<CandidateForm>(emptyCandidateForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const importCandidates = useServerFn(importCandidatesFromRows);
  const generateText = useServerFn(generateHaileAiText);
  const generateReminder = useServerFn(generateGmailWhatsAppReminder);
  const applyAgentOperation = useServerFn(applyHaileAiOperation);
  const checkAgents = useServerFn(checkAutomationAgents);
  const sendDocsReminders = useServerFn(sendMissingDocsWhatsAppReminders);
  const recordAgent = useServerFn(recordAgentAction);
  const saveRating = useServerFn(saveCandidateRating);
  const createAdmin = useServerFn(createFirstSuperAdmin);
  const inviteUser = useServerFn(inviteSystemUser);
  const getSessionRole = useServerFn(getAuthorizedSession);
  const loadAppData = useServerFn(getLiveAppData);
  const saveCandidateRow = useServerFn(createCandidate);
  const editCandidateRow = useServerFn(updateCandidate);
  const updateStage = useServerFn(updateCandidateStage);
  const removeCandidateRow = useServerFn(deleteCandidate);
  const loadReminderStats = useServerFn(getWhatsAppReminderStats);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void refreshAuth(), 0);
    });
    void refreshAuth();
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authUser) void loadLiveData();
  }, [authUser?.id]);

  const refreshAuth = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setAuthUser(null);
      setAuthChecked(true);
      return;
    }

    const authorized = await getSessionRole({ data: { accessToken: session.access_token } });
    setAuthUser({
      id: session.user.id,
      email: session.user.email ?? (authorized.ok ? authorized.email : ""),
      role: authorized.ok ? authorized.role : null,
    });
    setAuthChecked(true);
  };

  const loadLiveData = async () => {
    setIsLoadingData(true);
    setLoadError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setLoadError("יש להתחבר עם משתמש מורשה כדי להציג נתונים אמיתיים.");
      setIsLoadingData(false);
      return;
    }

    const result = await loadAppData({ data: { accessToken } });
    if (!result.ok) setLoadError(result.message);

    const normalized = (result.candidates ?? []).map(normalizeCandidate);
    setCandidates(normalized);
    setLogs(result.logs ?? []);
    setSystemUsers(result.users ?? []);
    setSelectedId((current) => current ?? normalized[0]?.id ?? null);
    setIsLoadingData(false);

    setIsLoadingReminderStats(true);
    try {
      const statsResult = await loadReminderStats({ data: { accessToken, days: 14 } });
      if (statsResult.ok) setReminderStats(statsResult.stats);
    } finally {
      setIsLoadingReminderStats(false);
    }
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
        candidate.city.includes(term) ||
        cityLabel(candidate.city).includes(term);
      const matchesStatus = statusFilter === "הכל" || stageLabels[candidate.stage] === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [candidates, searchTerm, statusFilter]);

  const activeCandidates = candidates.filter((candidate) => candidate.stage !== "Placed").length;
  const placedCandidates = candidates.filter((candidate) => candidate.stage === "Placed").length;
  const canEdit = authUser?.role === "super_admin" || authUser?.role === "operator";
  const isSuperAdmin = authUser?.role === "super_admin";
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
    if (!canEdit) {
      setImportStatus("הרשאת VIEWER מאפשרת צפייה בלבד.");
      return;
    }
    if (importRows.length === 0) return;
    setIsImporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setImportStatus("יש להתחבר עם משתמש מורשה לפני ייבוא מועמדים.");
        return;
      }

      const BATCH = 100;
      let totalInserted = 0;
      let totalSkipped = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < importRows.length; i += BATCH) {
        const batch = importRows.slice(i, i + BATCH);
        try {
          const result = await importCandidates({ data: { accessToken, rows: batch } });
          totalInserted += result.inserted;
          totalSkipped += result.skipped;
          if (result.errors?.length) allErrors.push(...result.errors);
        } catch (err) {
          allErrors.push(err instanceof Error ? err.message : "שגיאה לא ידועה באצווה.");
          totalSkipped += batch.length;
        }
      }

      const summary = `ייבוא הושלם: ${totalInserted} נשמרו, ${totalSkipped} דולגו.`;
      const errorTail = allErrors.length ? `\n${allErrors.join("\n")}` : "";
      setImportStatus(summary + errorTail);
      if (totalInserted > 0) {
        setImportRows([]);
        await loadLiveData();
      }
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setAiText("יש להתחבר עם משתמש מורשה.");
        return;
      }

      const result = await generateText({
        data: {
          accessToken,
          candidateId: selected.id,
          mode,
        },
      });
      setAiText(result.text);
    } finally {
      setIsAiLoading(false);
    }
  };

  const runAgentStatusUpdate = async () => {
    if (!selected) {
      setActionStatus("אין מועמד נבחר.");
      return;
    }

    if (!canEdit) {
      setActionStatus("רק משתמש עם הרשאת עריכה יכול להפעיל עדכון סוכן.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setActionStatus("יש להתחבר עם משתמש מורשה.");
      return;
    }

    const nextStage =
      selected.stage === "Lead"
        ? "Learning"
        : selected.stage === "Learning"
          ? "Test"
          : selected.stage === "Test"
            ? "Placed"
            : "Placed";

    const result = await applyAgentOperation({
      data: {
        accessToken,
        candidateId: selected.id,
        stage: nextStage,
        followUpRequired: nextStage !== "Placed",
        note: `הסוכן קידם את ${selected.name} משלב ${stageLabels[selected.stage] ?? selected.stage} לשלב ${stageLabels[nextStage]}.`,
      },
    });

    setActionStatus(result.message);
    if (result.ok) {
      await loadLiveData();
      setAiText(`הסוכן מחובר לנתוני המועמד. סטטוס עודכן ל־${stageLabels[nextStage]}.`);
    }
  };

  const runGmailReminder = async () => {
    setIsReminderLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setGmailReminder("יש להתחבר עם משתמש מורשה כדי לקרוא Gmail.");
        return;
      }

      const result = await generateReminder({
        data: {
          accessToken,
          candidateName: selected?.name,
          candidatePhone: selected?.phone,
        },
      });

      setGmailReminder(result.ok ? result.reminder : result.message);
      setActionStatus(result.message);
    } finally {
      setIsReminderLoading(false);
    }
  };

  const runAgentConnectionCheck = async () => {
    setIsCheckingAgents(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setActionStatus("יש להתחבר עם משתמש מורשה כדי לבדוק סוכנים.");
        return;
      }
      const result = await checkAgents({ data: { accessToken } });
      setAgentStatuses(result.statuses);
      setActionStatus(result.message);
    } finally {
      setIsCheckingAgents(false);
    }
  };

  const runWhatsAppDocsReminders = async () => {
    if (!canEdit) {
      setActionStatus("רק משתמש עם הרשאת עריכה יכול להפעיל תזכורות WhatsApp.");
      return;
    }
    setIsSendingWhatsAppReminders(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setActionStatus("יש להתחבר עם משתמש מורשה כדי להפעיל אוטומציה.");
        return;
      }
      const result = await sendDocsReminders({ data: { accessToken } });
      setActionStatus(result.message);
      if (result.ok) await loadLiveData();
    } finally {
      setIsSendingWhatsAppReminders(false);
    }
  };

  const saveCandidate = async () => {
    if (!canEdit) {
      setActionStatus("הרשאת VIEWER מאפשרת צפייה בלבד.");
      return;
    }

    if (!candidateForm.name.trim() || !candidateForm.phone.trim()) {
      setActionStatus("שם וטלפון הם שדות חובה.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setActionStatus("יש להתחבר עם משתמש מורשה לפני שמירת מועמד.");
      return;
    }

    const payload = {
      accessToken,
      name: candidateForm.name,
      phone: candidateForm.phone.replace(/[^+\d]/g, ""),
      age: candidateForm.age ? Number(candidateForm.age) : null,
      city: candidateForm.city,
      stage: candidateForm.stage,
      license: candidateForm.licenseStatus,
      notes: candidateForm.note || null,
    };
    const result = editingId
      ? await editCandidateRow({ data: { ...payload, id: editingId } })
      : await saveCandidateRow({ data: payload });

    if (!result.ok) {
      setActionStatus(`שמירת מועמד נכשלה: ${result.message}`);
      return;
    }

    setCandidateForm(emptyCandidateForm());
    setEditingId(null);
    setActionStatus(result.message);
    await loadLiveData();
  };

  const startEditCandidate = (candidate: Candidate) => {
    if (!canEdit) {
      setActionStatus("הרשאת VIEWER מאפשרת צפייה בלבד.");
      return;
    }
    setSelectedId(candidate.id);
    setEditingId(candidate.id);
    setCandidateForm(candidateToForm(candidate));
    setActionStatus("מצב עריכה פעיל — שמירה תעדכן את המועמד הנבחר.");
  };

  const deleteSelectedCandidate = async () => {
    if (!selected) return;
    if (!canEdit) {
      setActionStatus("הרשאת VIEWER מאפשרת צפייה בלבד.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setActionStatus("יש להתחבר עם משתמש מורשה לפני מחיקה.");
      return;
    }
    const result = await removeCandidateRow({ data: { accessToken, id: selected.id } });
    setActionStatus(result.ok ? result.message : `מחיקה נכשלה: ${result.message}`);
    if (result.ok) {
      setSelectedId(null);
      setEditingId(null);
      setCandidateForm(emptyCandidateForm());
      await loadLiveData();
    }
  };

  const inlineEditCandidate = async (
    candidate: Candidate,
    patch: CandidateInlinePatch,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!canEdit) return { ok: false, message: "הרשאת VIEWER מאפשרת צפייה בלבד." };
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return { ok: false, message: "יש להתחבר עם משתמש מורשה." };

    const result = await editCandidateRow({
      data: {
        accessToken,
        id: candidate.id,
        name: patch.name.trim() || candidate.name,
        phone: patch.phone.replace(/[^+\d]/g, "") || candidate.phone,
        age: patch.age ? Number(patch.age) : null,
        city: patch.city,
        stage: patch.stage,
        license: patch.license,
        notes: patch.notes ? patch.notes : null,
        language: patch.language,
        partner: patch.partner,
      },
    });
    setActionStatus(result.ok ? result.message : `שמירת מועמד נכשלה: ${result.message}`);
    if (result.ok) await loadLiveData();
    return { ok: result.ok, message: result.message };
  };

  const inlineAddNote = async (
    candidate: Candidate,
    noteText: string,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!canEdit) return { ok: false, message: "הרשאת VIEWER מאפשרת צפייה בלבד." };
    const trimmed = noteText.trim();
    if (!trimmed) return { ok: false, message: "אין הערה לשמירה." };
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return { ok: false, message: "יש להתחבר עם משתמש מורשה." };
    const result = await recordAgent({
      data: {
        accessToken,
        candidateId: candidate.id,
        agentName: "סוכן גיוס",
        actionType: "note",
        content: trimmed,
        language: candidate.langCode,
      },
    });
    setActionStatus(result.ok ? result.message : `שמירת הערה נכשלה: ${result.message}`);
    if (result.ok) await loadLiveData();
    return { ok: result.ok, message: result.message };
  };

  const updateSelectedStage = async (stage: CandidateForm["stage"]) => {
    if (!selected) return;
    if (!canEdit) {
      setActionStatus("הרשאת VIEWER מאפשרת צפייה בלבד.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setActionStatus("יש להתחבר עם משתמש מורשה לפני עדכון סטטוס.");
      return;
    }
    const result = await updateStage({ data: { accessToken, id: selected.id, stage } });
    setActionStatus(result.ok ? result.message : `עדכון סטטוס נכשל: ${result.message}`);
    if (result.ok) await loadLiveData();
  };

  const exportCandidates = () => {
    const rows = candidates.map((candidate) => ({
      שם: candidate.name,
      טלפון: formatPhone(candidate.phone),
      עיר: cityLabel(candidate.city),
      שפה: candidate.language,
      סטטוס: stageLabels[candidate.stage] ?? candidate.stage,
      רישיון: candidate.licenseStatus,
      מסמכים: candidate.documentsReady ? "תקין" : "חסר",
      תאריך: formatDate(candidate.createdAt),
    }));
    downloadCsv("haile-candidates.csv", rows);
    setActionStatus("קובץ המועמדים ירד למחשב.");
  };

  const handleInvite = async (email: string, password: string, role: "operator" | "viewer") => {
    if (!email.trim() || !password.trim()) {
      setActionStatus("יש למלא מייל וסיסמה זמנית.");
      return;
    }

    if (password.length < 8) {
      setActionStatus("סיסמה זמנית חייבת להכיל לפחות 8 תווים.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setActionStatus("יש להתחבר כמנהל ראשי.");
      return;
    }
    const result = await inviteUser({ data: { accessToken, email, password, role } });
    setActionStatus(result.message);
    if (result.ok) await loadLiveData();
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthStatus("מתחבר...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthStatus(error ? "פרטי התחברות לא תקינים." : "התחברת בהצלחה.");
  };

  const handleFirstAdmin = async (email: string, password: string, fullName: string) => {
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setAuthStatus("יש למלא שם, אימייל וסיסמה.");
      return;
    }

    if (password.length < 8) {
      setAuthStatus("סיסמה חייבת להכיל לפחות 8 תווים.");
      return;
    }

    setAuthStatus("יוצר מנהל ראשי...");
    const result = await createAdmin({ data: { email, password, fullName } });
    setAuthStatus(result.message);
    if (result.ok) setAuthMode("login");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCandidates([]);
    setLogs([]);
    setReminderStats(null);
    setAuthStatus("התנתקת מהמערכת.");
  };

  if (!authChecked) {
    return <LoadingScreen text="בודק הרשאות..." />;
  }

  if (!authUser) {
    return (
      <AuthScreen
        mode={authMode}
        status={authStatus}
        onMode={setAuthMode}
        onLogin={handleLogin}
        onFirstAdmin={handleFirstAdmin}
      />
    );
  }

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
                <span className="text-xs text-muted-foreground">
                  {authUser.email} · {roleLabel(authUser.role)}
                </span>
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
            {navItems
              .filter((item) => !item.superOnly || isSuperAdmin)
              .map((item) => {
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
            <Button variant="tactical" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> יציאה
            </Button>
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
                reminderStats={reminderStats}
                isLoadingReminderStats={isLoadingReminderStats}
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
                onExport={exportCandidates}
                onAi={runAi}
                form={candidateForm}
                onFormChange={setCandidateForm}
                onSaveCandidate={saveCandidate}
                onEditCandidate={startEditCandidate}
                onDeleteCandidate={deleteSelectedCandidate}
                onStageChange={updateSelectedStage}
                actionStatus={actionStatus}
                aiText={aiText}
                isAiLoading={isAiLoading}
                canEdit={canEdit}
                isEditing={Boolean(editingId)}
                onInlineSave={inlineEditCandidate}
                onInlineNote={inlineAddNote}
              />
            )}
            {activePage === "agents" && (
              <AgentsPage
                candidates={candidates}
                logs={logs}
                selectedId={selectedId}
                onSelectCandidate={setSelectedId}
                canEdit={canEdit}
                onCheckConnections={runAgentConnectionCheck}
                onSendWhatsAppDocsReminders={runWhatsAppDocsReminders}
                agentStatuses={agentStatuses}
                isCheckingAgents={isCheckingAgents}
                isSendingWhatsAppReminders={isSendingWhatsAppReminders}
                actionStatus={actionStatus}
                setActionStatus={setActionStatus}
                onReload={loadLiveData}
                onRecordAction={async (input) => {
                  const { data: sessionData } = await supabase.auth.getSession();
                  const accessToken = sessionData.session?.access_token;
                  if (!accessToken) return { ok: false, message: "יש להתחבר עם משתמש מורשה." };
                  return await recordAgent({ data: { ...input, accessToken } });
                }}
                onSaveRating={async (input) => {
                  const { data: sessionData } = await supabase.auth.getSession();
                  const accessToken = sessionData.session?.access_token;
                  if (!accessToken) return { ok: false, message: "יש להתחבר עם משתמש מורשה." };
                  return await saveRating({ data: { ...input, accessToken } });
                }}
                onGenerateText={async (mode) => {
                  if (!selected) return null;
                  const { data: sessionData } = await supabase.auth.getSession();
                  const accessToken = sessionData.session?.access_token;
                  if (!accessToken) return null;
                  const result = await generateText({
                    data: { accessToken, candidateId: selected.id, mode },
                  });
                  return result.text;
                }}
                onUpdateStage={async (stage) => {
                  if (!selected) return { ok: false, message: "אין מועמד נבחר." };
                  const { data: sessionData } = await supabase.auth.getSession();
                  const accessToken = sessionData.session?.access_token;
                  if (!accessToken) return { ok: false, message: "יש להתחבר עם משתמש מורשה." };
                  const result = await updateStage({
                    data: { accessToken, id: selected.id, stage },
                  });
                  return result;
                }}
              />
            )}
            {activePage === "reports" && <ReportsPage />}
            {activePage === "sol" && (
              <SolPage
                selected={selected}
                reminder={gmailReminder}
                isLoading={isReminderLoading}
                onGenerateReminder={runGmailReminder}
              />
            )}
            {activePage === "ciel" && <CielPage candidates={candidates} logs={logs} />}
            {activePage === "voice" && <VoicePage />}
            {activePage === "settings" && (
              <SettingsPage
                onExport={exportCandidates}
                isSuperAdmin={isSuperAdmin}
                agentStatuses={agentStatuses}
              />
            )}
            {activePage === "admin" && isSuperAdmin && (
              <AdminUsersPage users={systemUsers} onInvite={handleInvite} status={actionStatus} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthScreen({
  mode,
  status,
  onMode,
  onLogin,
  onFirstAdmin,
}: {
  mode: AuthMode;
  status: string;
  onMode: (mode: AuthMode) => void;
  onLogin: (email: string, password: string) => void;
  onFirstAdmin: (email: string, password: string, fullName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("בני אספה");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "firstAdmin") onFirstAdmin(email, password, fullName);
    else onLogin(email, password);
  };

  return (
    <main
      className="grid min-h-screen place-items-center bg-background p-4 text-foreground"
      dir="rtl"
    >
      <form onSubmit={submit} className="glass-panel w-full max-w-md rounded-lg p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black">היילה AI</h1>
            <p className="text-sm text-muted-foreground">כניסה מאובטחת למערכת ניהול אמיתית</p>
          </div>
        </div>
        {mode === "firstAdmin" && (
          <Field label="שם מנהל ראשי" value={fullName} onChange={setFullName} />
        )}
        <Field label="אימייל" value={email} onChange={setEmail} type="email" />
        <Field
          label="סיסמה"
          value={password}
          onChange={setPassword}
          type="password"
          minLength={mode === "firstAdmin" ? 8 : undefined}
        />
        <Button className="mt-4 w-full min-h-11" variant="command" type="submit">
          <KeyRound className="h-4 w-4" /> {mode === "firstAdmin" ? "צור מנהל ראשי" : "כניסה"}
        </Button>
        <button
          type="button"
          onClick={() => onMode(mode === "login" ? "firstAdmin" : "login")}
          className="mt-4 w-full text-center text-sm font-bold text-primary"
        >
          {mode === "login" ? "אין משתמש? הגדרת מנהל ראשי ראשון" : "חזרה לכניסה"}
        </button>
        <p className="mt-4 rounded-md border border-border bg-surface p-3 text-sm text-muted-foreground">
          {status}
        </p>
      </form>
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground" dir="rtl">
      <div className="glass-panel rounded-lg p-6 text-sm text-muted-foreground">{text}</div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="mb-3 block text-sm font-bold">
      {label}
      <input
        required
        type={type}
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function SmallInput({
  label,
  value,
  onChange,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="block text-xs font-bold text-muted-foreground">
      {label}
      <input
        type={type}
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

type SmallSelectOption = string | { value: string; label: string };

function SmallSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SmallSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
      >
        {options.map((option) => {
          const v = typeof option === "string" ? option : option.value;
          const l = typeof option === "string" ? option : option.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
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
  reminderStats,
  isLoadingReminderStats,
  onOpenCandidates,
}: {
  activeCandidates: number;
  placedCandidates: number;
  avgScore: number | null;
  missingDocs: number;
  candidates: Candidate[];
  logs: LogRow[];
  isLoading: boolean;
  reminderStats: ReminderStats | null;
  isLoadingReminderStats: boolean;
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

      <WhatsAppRemindersWidget
        stats={reminderStats}
        isLoading={isLoadingReminderStats}
      />
    </div>
  );
}

function WhatsAppRemindersWidget({
  stats,
  isLoading,
}: {
  stats: ReminderStats | null;
  isLoading: boolean;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  if (isLoading && !stats) {
    return (
      <Panel title="תזכורות WhatsApp · 14 ימים">
        <EmptyState text="טוען נתוני שליחה..." />
      </Panel>
    );
  }

  if (!stats) {
    return (
      <Panel title="תזכורות WhatsApp · 14 ימים">
        <EmptyState text="אין עדיין נתוני שליחה לתצוגה." />
      </Panel>
    );
  }

  const activeReason =
    stats.failureReasons.find((r) => r.reason === selectedReason) ?? null;

  const successPct = Math.round(stats.successRate * 100);
  const deliveryPct = Math.round(stats.deliveryRate * 100);
  const maxDay = Math.max(
    1,
    ...stats.daily.map((d) => d.sent + d.failed),
  );
  const totalAttempts = stats.totalSent + stats.totalFailed;

  const dayFmt = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <Panel
      title="תזכורות WhatsApp · 14 ימים"
      action={
        <span className="text-xs text-muted-foreground">
          מבוסס על {totalAttempts} ניסיונות שליחה
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <article className="glass-panel rounded-md p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>אחוז הצלחה</span>
            <Send className="h-4 w-4 text-primary" />
          </div>
          <strong className="block text-2xl font-black">{successPct}%</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.totalSent} נשלחו · {stats.totalFailed} נכשלו
          </p>
        </article>
        <article className="glass-panel rounded-md p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>אחוז מסירה</span>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <strong className="block text-2xl font-black">{deliveryPct}%</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.totalDelivered} נמסרו ל-{stats.totalSent} שנשלחו
          </p>
        </article>
        <article className="glass-panel rounded-md p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>נקראו</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <strong className="block text-2xl font-black">{stats.totalRead}</strong>
          <p className="mt-1 text-xs text-muted-foreground">קריאות מאומתות מהנמען</p>
        </article>
        <article className="glass-panel rounded-md p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>כשלים</span>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <strong className="block text-2xl font-black">{stats.totalFailed}</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalAttempts > 0
              ? `${Math.round((stats.totalFailed / totalAttempts) * 100)}% מהניסיונות`
              : "אין נתונים"}
          </p>
        </article>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="mb-2 text-sm font-bold text-muted-foreground">
            מגמת שליחה (נשלח / נכשל)
          </h3>
          <div className="rounded-md border border-border bg-surface p-3">
            <div
              className="flex h-40 items-end gap-1"
              dir="ltr"
              role="img"
              aria-label="גרף עמודות יומי של תזכורות WhatsApp"
            >
              {stats.daily.map((day) => {
                const total = day.sent + day.failed;
                const sentPct = (day.sent / maxDay) * 100;
                const failPct = (day.failed / maxDay) * 100;
                return (
                  <div
                    key={day.date}
                    className="group relative flex flex-1 flex-col justify-end"
                    title={`${day.date}: ${day.sent} נשלחו, ${day.failed} נכשלו, ${day.delivered} נמסרו`}
                  >
                    <div
                      className="w-full bg-warning/70"
                      style={{ height: `${failPct}%` }}
                    />
                    <div
                      className="w-full bg-primary/80"
                      style={{ height: `${sentPct}%` }}
                    />
                    {total === 0 && (
                      <div className="h-px w-full bg-border" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground" dir="ltr">
              <span>{dayFmt.format(new Date(stats.daily[0]?.date ?? Date.now()))}</span>
              <span>
                {dayFmt.format(
                  new Date(stats.daily[stats.daily.length - 1]?.date ?? Date.now()),
                )}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 bg-primary/80" /> נשלח
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 bg-warning/70" /> נכשל
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold text-muted-foreground">
            סיבות כישלון מובילות
          </h3>
          {stats.failureReasons.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface p-4 text-center text-xs text-muted-foreground">
              אין כשלים בתקופה זו 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {stats.failureReasons.map((reason) => {
                const pct = stats.totalFailed
                  ? Math.round((reason.count / stats.totalFailed) * 100)
                  : 0;
                const isSelected = reason.reason === selectedReason;
                return (
                  <li key={reason.reason}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedReason(isSelected ? null : reason.reason)
                      }
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-md border bg-surface p-2 text-right transition-colors hover:border-primary/60",
                        isSelected ? "border-primary" : "border-border",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className="truncate font-medium text-foreground"
                          title={reason.reason}
                        >
                          {reason.reason}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {reason.count} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-warning"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ReminderDelayCorrelations
        correlations={stats.delayCorrelations}
        onSelect={(reason) => setSelectedReason(reason)}
        selectedReason={selectedReason}
      />

      {activeReason && (
        <ReminderFailureDrilldown
          reason={activeReason}
          onClose={() => setSelectedReason(null)}
        />
      )}
    </Panel>
  );
}

function ReminderFailureDrilldown({
  reason,
  onClose,
}: {
  reason: ReminderFailureReason;
  onClose: () => void;
}) {
  const tsFmt = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const interactionLabel: Record<string, string> = {
    whatsapp_reminder_failed: "תזכורת",
    whatsapp_reply_failed: "תשובה",
    whatsapp_status_failed: "סטטוס מסירה",
  };

  return (
    <div className="mt-5 rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">פירוט כישלונות עבור</p>
          <h4 className="truncate text-sm font-bold text-foreground" title={reason.reason}>
            {reason.reason}
          </h4>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" /> סגור
        </Button>
      </div>
      {reason.entries.length === 0 ? (
        <EmptyState text="אין רשומות זמינות עבור סיבה זו." />
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-surface text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">תאריך</th>
                <th className="px-3 py-2 font-medium">סוג</th>
                <th className="px-3 py-2 font-medium">מועמד</th>
                <th className="px-3 py-2 font-medium">טלפון</th>
                <th className="px-3 py-2 font-medium">פירוט</th>
              </tr>
            </thead>
            <tbody>
              {reason.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {tsFmt.format(new Date(entry.createdAt))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {interactionLabel[entry.interactionType] ?? entry.interactionType}
                  </td>
                  <td className="px-3 py-2">
                    {entry.candidateName ?? (
                      <span className="text-muted-foreground">לא משויך</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" dir="ltr">
                    {entry.candidatePhone ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="line-clamp-2" title={entry.rawNotes}>
                      {entry.rawNotes || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reason.count > reason.entries.length && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              מוצגות {reason.entries.length} מתוך {reason.count} רשומות (אחרונות).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} מ״ש`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} שנ׳`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec ? `${minutes}:${String(remSec).padStart(2, "0")} ד׳` : `${minutes} ד׳`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}:${String(remMin).padStart(2, "0")} שע׳` : `${hours} שע׳`;
}

function ReminderDelayCorrelations({
  correlations,
  onSelect,
  selectedReason,
}: {
  correlations: ReminderDelayCorrelation[];
  onSelect: (reason: string) => void;
  selectedReason: string | null;
}) {
  return (
    <section className="mt-5 rounded-md border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            מתאם בין סיבות כישלון לעיכובי Webhook ושליחות חוזרות
          </h3>
          <p className="text-[11px] text-muted-foreground">
            מבוסס על שליחות חוזרות לאותו מועמד ועיכוב בין שליחה למסירה (סף עיכוב: 5 ד׳).
          </p>
        </div>
        <CalendarClock className="h-4 w-4 text-primary" />
      </header>

      {correlations.length === 0 ? (
        <EmptyState text="אין כרגע סיבות כישלון שמשפיעות על עיכובים או שליחות חוזרות." />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">סיבה</th>
                <th className="px-3 py-2 font-medium">כשלים</th>
                <th className="px-3 py-2 font-medium">שליחות חוזרות</th>
                <th className="px-3 py-2 font-medium">זמן עד נסיון חוזר (ממוצע)</th>
                <th className="px-3 py-2 font-medium">עיכוב מסירה (ממוצע)</th>
                <th className="px-3 py-2 font-medium">מסירות איטיות</th>
              </tr>
            </thead>
            <tbody>
              {correlations.map((row) => {
                const isSelected = row.reason === selectedReason;
                const slowRatio = row.failureCount
                  ? Math.round((row.delayedDeliveries / row.failureCount) * 100)
                  : 0;
                return (
                  <tr
                    key={row.reason}
                    className={cn(
                      "cursor-pointer border-b border-border/50 last:border-0 hover:bg-primary/5",
                      isSelected && "bg-primary/5",
                    )}
                    onClick={() => onSelect(row.reason)}
                  >
                    <td className="max-w-[220px] truncate px-3 py-2 font-medium text-foreground" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.failureCount}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-bold",
                          row.retryCount > 0
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.retryCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDuration(row.avgRetryGapMs)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDuration(row.avgDeliveryDelayMs)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-bold",
                          row.delayedDeliveries > 0
                            ? "bg-destructive/15 text-destructive"
                            : "bg-success/15 text-success",
                        )}
                      >
                        {row.delayedDeliveries}
                        {row.failureCount > 0 ? ` · ${slowRatio}%` : ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  onExport,
  onAi,
  form,
  onFormChange,
  onSaveCandidate,
  onEditCandidate,
  onDeleteCandidate,
  onStageChange,
  actionStatus,
  aiText,
  isAiLoading,
  canEdit,
  isEditing,
  onInlineSave,
  onInlineNote,
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
  onExport: () => void;
  onAi: (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => void;
  form: CandidateForm;
  onFormChange: (form: CandidateForm) => void;
  onSaveCandidate: () => void;
  onEditCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: () => void;
  onStageChange: (stage: CandidateForm["stage"]) => void;
  actionStatus: string;
  aiText: string;
  isAiLoading: boolean;
  canEdit: boolean;
  isEditing: boolean;
  onInlineSave: (candidate: Candidate, patch: CandidateInlinePatch) => Promise<{ ok: boolean; message: string }>;
  onInlineNote: (candidate: Candidate, note: string) => Promise<{ ok: boolean; message: string }>;
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
            onExport={onExport}
            canEdit={canEdit}
          />
        }
      >
        {(importStatus || importRows > 0) ? (
          <div className="mb-4 space-y-1 rounded-md border border-border bg-surface p-3 text-xs">
            <p className="whitespace-pre-wrap text-muted-foreground">{importStatus}</p>
            {importRows > 0 && (
              <p className="font-medium text-foreground">
                תצוגה מקדימה: {importRows} שורות מוכנות. לחץ "ייבא" לשמירה.
              </p>
            )}
          </div>
        ) : null}
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
                canEdit={canEdit}
                onInlineSave={onInlineSave}
                onInlineNote={onInlineNote}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="פרופיל מועמד + CIEL">
        <Notice
          tone={canEdit ? "success" : "warning"}
          text={canEdit ? actionStatus : "מצב צפייה בלבד — אין הרשאת עריכה למשתמש הזה."}
        />
        {canEdit && (
          <QuickCandidateForm
            form={form}
            onChange={onFormChange}
            onSave={onSaveCandidate}
            isEditing={isEditing}
          />
        )}
        {!selected ? (
          <EmptyState text="בחר מועמד כדי לפתוח פרופיל." />
        ) : (
          <CandidateProfile
            candidate={selected}
            onAi={onAi}
            onEdit={() => onEditCandidate(selected)}
            onDelete={onDeleteCandidate}
            onStageChange={onStageChange}
            aiText={aiText}
            isAiLoading={isAiLoading}
            canEdit={canEdit}
          />
        )}
      </Panel>
    </div>
  );
}

type AgentActionInput = {
  candidateId: string;
  agentName: "סוכן גיוס" | "Voice Agent" | "CIEL" | "SOL";
  actionType:
    | "open_message"
    | "interview_questions"
    | "rating"
    | "status_update"
    | "reminder"
    | "follow_up"
    | "note";
  content: string;
  language: "he" | "am" | "ru";
  followUpRequired?: boolean;
  followUpAt?: string;
};

type AgentResult = { ok: boolean; message: string };

function AgentsPage({
  candidates,
  logs,
  selectedId,
  onSelectCandidate,
  canEdit,
  onCheckConnections,
  onSendWhatsAppDocsReminders,
  agentStatuses,
  isCheckingAgents,
  isSendingWhatsAppReminders,
  actionStatus,
  setActionStatus,
  onReload,
  onRecordAction,
  onSaveRating,
  onGenerateText,
  onUpdateStage,
}: {
  candidates: Candidate[];
  logs: LogRow[];
  selectedId: string | null;
  onSelectCandidate: (id: string) => void;
  canEdit: boolean;
  onCheckConnections: () => void;
  onSendWhatsAppDocsReminders: () => void;
  agentStatuses: AutomationAgentStatus[];
  isCheckingAgents: boolean;
  isSendingWhatsAppReminders: boolean;
  actionStatus: string;
  setActionStatus: (text: string) => void;
  onReload: () => Promise<void> | void;
  onRecordAction: (input: AgentActionInput) => Promise<AgentResult>;
  onSaveRating: (input: {
    candidateId: string;
    rating: "A" | "B" | "C";
    note: string;
  }) => Promise<AgentResult>;
  onGenerateText: (
    mode: "candidate_next_step" | "translate_to_hebrew" | "status_template",
  ) => Promise<string | null>;
  onUpdateStage: (stage: "Lead" | "Learning" | "Test" | "Placed") => Promise<AgentResult>;
}) {
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const candidateLogs = selected ? logs.filter((l) => l.candidate_id === selected.id) : [];

  return (
    <div className="space-y-4">
      <Panel title="מרכז הפעלה לכל הסוכנים">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block text-sm">
            <span className="mb-1 block font-bold">בחר מועמד פעיל לכל הסוכנים</span>
            <select
              value={selectedId ?? ""}
              onChange={(e) => onSelectCandidate(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">— בחר מועמד —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {stageLabels[c.stage] ?? c.stage} · {cityLabel(c.city)} · {c.language}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              מחובר: {selected.name} · {stageLabels[selected.stage] ?? selected.stage} ·{" "}
              {cityLabel(selected.city)} · {selected.language}
            </div>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(agentStatuses.length ? agentStatuses : defaultAgentStatuses()).map((status) => (
            <div
              key={status.key}
              className="rounded-md border border-border bg-surface p-3 text-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong>{status.label}</strong>
                <span
                  className={`inline-flex rounded-sm px-2 py-1 text-xs font-bold ${
                    status.ready
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {status.ready ? "מחובר" : "לא מחובר"}
                </span>
              </div>
              <p className="text-muted-foreground">{status.detail}</p>
            </div>
          ))}
        </div>
        <Button
          className="mt-4 min-h-11"
          variant="intel"
          onClick={onSendWhatsAppDocsReminders}
          disabled={!canEdit || isSendingWhatsAppReminders}
        >
          <Phone className="h-4 w-4" />{" "}
          {isSendingWhatsAppReminders ? "שולח תזכורות..." : "הפעל תזכורות WhatsApp למסמכים חסרים"}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">{actionStatus}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecruiterAgentPanel
          selected={selected}
          canEdit={canEdit}
          candidateLogs={candidateLogs}
          onRecordAction={onRecordAction}
          onGenerateText={onGenerateText}
          onUpdateStage={onUpdateStage}
          onReload={onReload}
          setActionStatus={setActionStatus}
        />
        <VoiceAgentPanel
          selected={selected}
          canEdit={canEdit}
          onRecordAction={onRecordAction}
          onSaveRating={onSaveRating}
          onReload={onReload}
          setActionStatus={setActionStatus}
        />
        <CielAgentPanel
          selected={selected}
          canEdit={canEdit}
          candidates={candidates}
          candidateLogs={candidateLogs}
          onRecordAction={onRecordAction}
          onUpdateStage={onUpdateStage}
          onReload={onReload}
          setActionStatus={setActionStatus}
        />
        <SolAgentPanel
          selected={selected}
          canEdit={canEdit}
          candidates={candidates}
          logs={logs}
          onRecordAction={onRecordAction}
          onReload={onReload}
          setActionStatus={setActionStatus}
        />
      </div>
    </div>
  );
}

type SubAgentProps = {
  selected: Candidate | null;
  canEdit: boolean;
  onRecordAction: (input: AgentActionInput) => Promise<AgentResult>;
  onReload: () => Promise<void> | void;
  setActionStatus: (text: string) => void;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

function AgentChat({
  agentKey,
  agentName,
  candidateId,
  candidateName,
  canEdit,
}: {
  agentKey: "recruiter" | "voice" | "ciel" | "sol";
  agentName: string;
  candidateId: string;
  candidateName: string;
  canEdit: boolean;
}) {
  // History is keyed by agent + candidate so switching candidates resets the chat.
  const storageKey = `${agentKey}:${candidateId}`;
  const [historyByKey, setHistoryByKey] = useState<Record<string, ChatTurn[]>>({});
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messages = historyByKey[storageKey] ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const setMessages = (updater: (prev: ChatTurn[]) => ChatTurn[]) => {
    setHistoryByKey((prev) => ({ ...prev, [storageKey]: updater(prev[storageKey] ?? []) }));
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    if (!canEdit) {
      setError("אין לך הרשאה לשלוח הודעות לסוכן.");
      return;
    }

    setError(null);
    setInput("");
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(() => nextMessages);
    setIsSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("יש להתחבר מחדש.");
        return;
      }
      const result = await chatWithAgent({
        data: {
          accessToken,
          candidateId,
          agent: agentKey,
          messages: nextMessages,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת ההודעה.");
    } finally {
      setIsSending(false);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="mt-4 rounded-md border border-border bg-surface/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-bold text-foreground">
          שיחה עם {agentName} · {candidateName}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages(() => [])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            נקה שיחה
          </button>
        )}
      </div>

      <div ref={scrollRef} className="max-h-72 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            התחל שיחה עם הסוכן בנוגע ל{candidateName}.
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m, i) => (
              <li
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 ${
                    m.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "bg-surface-strong text-foreground"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {m.role === "user" ? "אתה" : agentName}
                  </div>
                  {m.content}
                </div>
              </li>
            ))}
            {isSending && (
              <li className="flex justify-start">
                <div className="rounded-md bg-surface-strong px-3 py-2 text-xs text-muted-foreground">
                  {agentName} כותב...
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2 border-t border-border p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="כתוב הודעה לסוכן..."
          rows={2}
          disabled={isSending || !canEdit}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <Button
          variant="command"
          onClick={() => void send()}
          disabled={isSending || !input.trim() || !canEdit}
        >
          {isSending ? "שולח..." : "שלח"}
        </Button>
      </div>
    </div>
  );
}

function AgentShell({
  name,
  icon: Icon,
  description,
  tone,
  selected,
  agentKey,
  canEdit,
  children,
}: {
  name: string;
  icon: typeof Bot;
  description: string;
  tone: "primary" | "success" | "intel" | "warning";
  selected: Candidate | null;
  agentKey?: "recruiter" | "voice" | "ciel" | "sol";
  canEdit?: boolean;
  children: ReactNode;
}) {
  const iconTone =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "intel"
          ? "text-intel"
          : "text-primary";
  const isConnected = Boolean(selected);
  return (
    <article className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-surface-strong">
            <Icon className={`h-5 w-5 ${iconTone}`} />
          </div>
          <div>
            <h3 className="text-xl font-black">{name}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <span
          className={`flex items-center gap-2 rounded-sm px-2 py-1 text-xs ${
            isConnected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-success" : "bg-muted-foreground"}`}
          />
          {isConnected ? "מחובר" : "לא מחובר"}
        </span>
      </div>
      {selected ? (
        <div className="mb-3 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">{selected.name}</strong> ·{" "}
          {stageLabels[selected.stage] ?? selected.stage} · {cityLabel(selected.city)} · {selected.language}
        </div>
      ) : (
        <div className="mb-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          ממתין לבחירת מועמד למעלה.
        </div>
      )}
      {children}
      {selected && agentKey && (
        <AgentChat
          agentKey={agentKey}
          agentName={name}
          candidateId={selected.id}
          candidateName={selected.name}
          canEdit={canEdit ?? false}
        />
      )}
    </article>
  );
}

function RecruiterAgentPanel({
  selected,
  canEdit,
  candidateLogs,
  onRecordAction,
  onGenerateText,
  onUpdateStage,
  onReload,
  setActionStatus,
}: SubAgentProps & {
  candidateLogs: LogRow[];
  onGenerateText: (
    mode: "candidate_next_step" | "translate_to_hebrew" | "status_template",
  ) => Promise<string | null>;
  onUpdateStage: (stage: "Lead" | "Learning" | "Test" | "Placed") => Promise<AgentResult>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"Lead" | "Learning" | "Test" | "Placed">("Lead");

  useEffect(() => {
    if (selected) setStage(selected.stage as "Lead" | "Learning" | "Test" | "Placed");
  }, [selected?.id]);

  const generate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const text = await onGenerateText("status_template");
      if (text) setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!selected || !message.trim()) return;
    setBusy(true);
    try {
      const res = await onRecordAction({
        candidateId: selected.id,
        agentName: "סוכן גיוס",
        actionType: "open_message",
        content: message.trim(),
        language: selected.langCode,
      });
      setActionStatus(res.message);
      if (res.ok) {
        setMessage("");
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  const updateStage = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await onUpdateStage(stage);
      setActionStatus(res.message);
      if (res.ok) {
        await onRecordAction({
          candidateId: selected.id,
          agentName: "סוכן גיוס",
          actionType: "status_update",
          content: `סוכן הגיוס עדכן את שלב המועמד ל־${stageLabels[stage] ?? stage}.`,
          language: "he",
        });
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentShell
      name="סוכן גיוס"
      icon={Bot}
      description="טוען פרופיל, מנסח הודעת פתיחה בשפת המועמד ומעדכן שלב"
      tone="primary"
      selected={selected}
      agentKey="recruiter"
      canEdit={canEdit}
    >
      <div className="space-y-3">
        <Button
          variant="command"
          onClick={generate}
          disabled={!selected || busy}
          className="w-full"
        >
          <Languages className="h-4 w-4" /> צור הודעת פתיחה ב{selected?.language ?? "שפת המועמד"}
        </Button>
        <textarea
          className="min-h-[110px] w-full rounded-md border border-border bg-background p-2 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="ההודעה שתישלח למועמד תופיע כאן..."
        />
        <div className="flex gap-2">
          <select
            value={stage}
            onChange={(e) =>
              setStage(e.target.value as "Lead" | "Learning" | "Test" | "Placed")
            }
            className="min-h-10 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            disabled={!selected}
          >
            {(["Lead", "Learning", "Test", "Placed"] as const).map((s) => (
              <option key={s} value={s}>
                {stageLabels[s]}
              </option>
            ))}
          </select>
          <Button
            variant="tactical"
            onClick={updateStage}
            disabled={!selected || !canEdit || busy}
          >
            עדכן שלב
          </Button>
        </div>
        <Button
          variant="intel"
          onClick={send}
          disabled={!selected || !canEdit || busy || !message.trim()}
          className="w-full"
        >
          <Save className="h-4 w-4" /> שמור הודעה ביומן הפעולות
        </Button>
        <div className="text-xs text-muted-foreground">
          פעולות אחרונות: {candidateLogs.length}
        </div>
      </div>
    </AgentShell>
  );
}

function VoiceAgentPanel({
  selected,
  canEdit,
  onRecordAction,
  onSaveRating,
  onReload,
  setActionStatus,
}: SubAgentProps & {
  onSaveRating: (input: {
    candidateId: string;
    rating: "A" | "B" | "C";
    note: string;
  }) => Promise<AgentResult>;
}) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [rating, setRating] = useState<"A" | "B" | "C">("A");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const buildQuestions = () => {
    if (!selected) return;
    const q = [
      `שלום ${selected.name}, האם תוכל/י לעבוד 5 ימים בשבוע ב${cityLabel(selected.city)}?`,
      `מה הניסיון שלך בנהיגה מסחרית? סטטוס רישיון נוכחי: ${selected.licenseStatus}.`,
      `האם המסמכים (ת.ז + טופס ירוק) זמינים? סטטוס נוכחי: ${selected.documentsReady ? "מוכן" : "חסר"}.`,
      "מתי תוכל/י להתחיל הכשרה?",
    ];
    setQuestions(q);
    setActionStatus("שאלות סינון נוצרו לפי פרופיל המועמד.");
  };

  const logQuestions = async () => {
    if (!selected || !questions.length) return;
    setBusy(true);
    try {
      const res = await onRecordAction({
        candidateId: selected.id,
        agentName: "Voice Agent",
        actionType: "interview_questions",
        content: questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
        language: selected.langCode,
      });
      setActionStatus(res.message);
      if (res.ok) await onReload();
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (!selected || !note.trim()) return;
    setBusy(true);
    try {
      const res = await onSaveRating({
        candidateId: selected.id,
        rating,
        note: note.trim(),
      });
      setActionStatus(res.message);
      if (res.ok) {
        setNote("");
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentShell
      name="Voice Agent"
      icon={Mic}
      description="שאלות סינון, ראיון קולי ודירוג A/B/C נשמר על המועמד"
      tone="success"
      selected={selected}
      agentKey="voice"
      canEdit={canEdit}
    >
      <div className="space-y-3">
        <Button variant="command" onClick={buildQuestions} disabled={!selected} className="w-full">
          <Mic className="h-4 w-4" /> צור שאלות ראיון לפי פרופיל
        </Button>
        {questions.length > 0 && (
          <ol className="list-decimal space-y-1 rounded-md border border-border bg-surface p-3 pr-6 text-xs text-muted-foreground">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        )}
        <Button
          variant="tactical"
          onClick={logQuestions}
          disabled={!selected || !canEdit || !questions.length || busy}
          className="w-full"
        >
          שמור שאלות ביומן
        </Button>
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="mb-2 text-xs font-bold">דירוג אחרי הראיון</div>
          <div className="mb-2 flex gap-2">
            {(["A", "B", "C"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                className={`min-h-9 flex-1 rounded-md border text-sm font-bold ${
                  rating === r
                    ? "border-success bg-success text-success-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערות ראיון..."
            className="min-h-[70px] w-full rounded-md border border-border bg-background p-2 text-xs"
          />
          <Button
            variant="intel"
            onClick={submitRating}
            disabled={!selected || !canEdit || !note.trim() || busy}
            className="mt-2 w-full"
          >
            שמור דירוג {rating} על המועמד
          </Button>
        </div>
        {selected && (
          <div className="text-xs text-muted-foreground">
            דירוג נוכחי: {selected.grade} · ציון: {selected.score ?? "—"}
          </div>
        )}
      </div>
    </AgentShell>
  );
}

function CielAgentPanel({
  selected,
  canEdit,
  candidates,
  candidateLogs,
  onRecordAction,
  onUpdateStage,
  onReload,
  setActionStatus,
}: SubAgentProps & {
  candidates: Candidate[];
  candidateLogs: LogRow[];
  onUpdateStage: (stage: "Lead" | "Learning" | "Test" | "Placed") => Promise<AgentResult>;
}) {
  const [busy, setBusy] = useState(false);
  const activeCount = candidates.filter((c) => c.stage !== "Placed").length;
  const pending = candidateLogs.filter((l) => l.follow_up_required).length;

  const promote = async () => {
    if (!selected) return;
    const next: "Lead" | "Learning" | "Test" | "Placed" =
      selected.stage === "Lead"
        ? "Learning"
        : selected.stage === "Learning"
          ? "Test"
          : "Placed";
    setBusy(true);
    try {
      const res = await onUpdateStage(next);
      setActionStatus(res.message);
      if (res.ok) {
        await onRecordAction({
          candidateId: selected.id,
          agentName: "CIEL",
          actionType: "status_update",
          content: `CIEL קידם את ${selected.name} לשלב ${stageLabels[next]}.`,
          language: "he",
        });
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  const logCheckIn = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await onRecordAction({
        candidateId: selected.id,
        agentName: "CIEL",
        actionType: "note",
        content: `בדיקת CIEL: ${selected.name} בשלב ${stageLabels[selected.stage] ?? selected.stage}, מסמכים ${selected.documentsReady ? "מוכנים" : "חסרים"}.`,
        language: "he",
        followUpRequired: !selected.documentsReady,
      });
      setActionStatus(res.message);
      if (res.ok) await onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentShell
      name="CIEL"
      icon={Activity}
      description="ניטור לידים פעילים, פעולות ממתינות ועדכוני סטטוס"
      tone="intel"
      selected={selected}
      agentKey="ciel"
      canEdit={canEdit}
    >
      <div className="space-y-3">
        <SettingsGrid
          items={[
            `מועמדים פעילים: ${activeCount}`,
            `פעולות לטיפול עבור המועמד: ${pending}`,
            `סך לוגים למועמד: ${candidateLogs.length}`,
          ]}
        />
        <Button
          variant="command"
          onClick={promote}
          disabled={!selected || !canEdit || busy}
          className="w-full"
        >
          קדם את המועמד לשלב הבא
        </Button>
        <Button
          variant="tactical"
          onClick={logCheckIn}
          disabled={!selected || !canEdit || busy}
          className="w-full"
        >
          רשום ביקורת CIEL ביומן
        </Button>
      </div>
    </AgentShell>
  );
}

function SolAgentPanel({
  selected,
  canEdit,
  candidates,
  logs,
  onRecordAction,
  onReload,
  setActionStatus,
}: SubAgentProps & {
  candidates: Candidate[];
  logs: LogRow[];
}) {
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const followUps = candidates
    .filter((c) => c.nextStepDueAt)
    .sort(
      (a, b) =>
        new Date(a.nextStepDueAt ?? 0).getTime() - new Date(b.nextStepDueAt ?? 0).getTime(),
    )
    .slice(0, 5);
  const pendingLogs = logs.filter((l) => l.follow_up_required).length;

  const createReminder = async () => {
    if (!selected || !text.trim() || !date) return;
    setBusy(true);
    try {
      const res = await onRecordAction({
        candidateId: selected.id,
        agentName: "SOL",
        actionType: "reminder",
        content: text.trim(),
        language: "he",
        followUpRequired: true,
        followUpAt: new Date(date).toISOString(),
      });
      setActionStatus(res.message);
      if (res.ok) {
        setText("");
        setDate("");
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AgentShell
      name="SOL"
      icon={CalendarClock}
      description="תזכורות, מעקבים ופעולות ממתינות"
      tone="warning"
      selected={selected}
      agentKey="sol"
      canEdit={canEdit}
    >
      <div className="space-y-3">
        <SettingsGrid
          items={[
            `מועמדים עם תזכורת קרובה: ${followUps.length}`,
            `פעולות ממתינות (כלל המערכת): ${pendingLogs}`,
            selected?.nextStepDueAt
              ? `תזכורת קיימת: ${formatDate(selected.nextStepDueAt)}`
              : "לא הוגדרה תזכורת למועמד הנבחר",
          ]}
        />
        {followUps.length > 0 && (
          <div className="rounded-md border border-border bg-surface p-3 text-xs">
            <div className="mb-1 font-bold">מעקבים קרובים</div>
            <ul className="space-y-1 text-muted-foreground">
              {followUps.map((c) => (
                <li key={c.id}>
                  {formatDate(c.nextStepDueAt!)} — {c.name} ({stageLabels[c.stage] ?? c.stage})
                </li>
              ))}
            </ul>
          </div>
        )}
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
          disabled={!selected}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="תיאור התזכורת..."
          className="min-h-[80px] w-full rounded-md border border-border bg-background p-2 text-sm"
          disabled={!selected}
        />
        <Button
          variant="command"
          onClick={createReminder}
          disabled={!selected || !canEdit || !date || !text.trim() || busy}
          className="w-full"
        >
          <Bell className="h-4 w-4" /> צור תזכורת ושמור ביומן
        </Button>
        <SolGmailSection selected={selected} canEdit={canEdit} />
      </div>
    </AgentShell>
  );
}

function SolGmailSection({
  selected,
  canEdit,
}: {
  selected: Candidate | null;
  canEdit: boolean;
}) {
  const searchEmails = useServerFn(searchCandidateEmails);
  const draftEmail = useServerFn(draftCandidateFollowUpEmail);
  const createDraft = useServerFn(createGmailDraft);

  const [emails, setEmails] = useState<CandidateEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftLink, setDraftLink] = useState<string | null>(null);

  const candidateId = selected?.id ?? null;

  useEffect(() => {
    setEmails([]);
    setEmailError(null);
    setDraftSubject("");
    setDraftBody("");
    setDraftTo("");
    setDraftStatus(null);
    setDraftLink(null);
    if (!candidateId || !selected) return;

    let cancelled = false;
    (async () => {
      setLoadingEmails(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          if (!cancelled) setEmailError("יש להתחבר מחדש.");
          return;
        }
        const res = await searchEmails({
          data: {
            accessToken,
            candidateName: selected.name,
            candidatePhone: selected.phone,
            maxResults: 3,
          },
        });
        if (cancelled) return;
        if (!res.ok) {
          setEmailError(res.message ?? "חיפוש Gmail נכשל.");
          setEmails([]);
        } else {
          setEmails(res.emails);
        }
      } catch (err) {
        if (!cancelled)
          setEmailError(err instanceof Error ? err.message : "חיפוש Gmail נכשל.");
      } finally {
        if (!cancelled) setLoadingEmails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candidateId, selected, searchEmails]);

  const buildDraft = async () => {
    if (!selected) return;
    setDraftBusy(true);
    setDraftStatus(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setDraftStatus("יש להתחבר מחדש.");
        return;
      }
      const recentContext = emails
        .slice(0, 3)
        .map((e) => `- ${e.subject}: ${e.snippet}`)
        .join("\n");
      const res = await draftEmail({
        data: {
          accessToken,
          candidateName: selected.name,
          candidatePhone: selected.phone,
          candidateCity: selected.city,
          candidateStage: selected.stage,
          candidateLicense: selected.licenseStatus,
          candidateLanguage: selected.langCode,
          recentEmailContext: recentContext || undefined,
        },
      });
      if (!res.ok) {
        setDraftStatus(res.message ?? "יצירת טיוטה נכשלה.");
        return;
      }
      setDraftSubject(res.subject);
      setDraftBody(res.body);
      setDraftStatus("טיוטה נוצרה — ניתן לערוך לפני השליחה.");
    } finally {
      setDraftBusy(false);
    }
  };

  const sendToGmail = async () => {
    if (!selected) return;
    if (!draftTo.trim() || !draftSubject.trim() || !draftBody.trim()) {
      setDraftStatus("חסרים נמען / נושא / תוכן.");
      return;
    }
    setSendBusy(true);
    setDraftStatus(null);
    setDraftLink(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setDraftStatus("יש להתחבר מחדש.");
        return;
      }
      const res = await createDraft({
        data: {
          accessToken,
          to: draftTo.trim(),
          subject: draftSubject.trim(),
          body: draftBody,
        },
      });
      if (!res.ok) {
        setDraftStatus(res.message ?? "יצירת טיוטה ב-Gmail נכשלה.");
        return;
      }
      setDraftStatus(res.message);
      setDraftLink(res.draftLink ?? null);
    } finally {
      setSendBusy(false);
    }
  };

  if (!selected) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
        בחר מועמד כדי לראות מיילים אחרונים מ-Gmail.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="flex items-center gap-1">
          <Mail className="h-4 w-4 text-primary" /> Gmail — מיילים אחרונים
        </span>
        <span className="text-muted-foreground">{loadingEmails ? "טוען…" : `${emails.length} תוצאות`}</span>
      </div>

      {emailError && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {emailError}
        </div>
      )}

      {!loadingEmails && !emailError && emails.length === 0 && (
        <div className="text-xs text-muted-foreground">לא נמצאו מיילים תואמים למועמד.</div>
      )}

      <ul className="space-y-2">
        {emails.map((email) => (
          <li key={email.id} className="rounded border border-border bg-background p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{email.subject}</div>
                <div className="truncate text-muted-foreground">מאת: {email.from}</div>
              </div>
              <a
                href={email.webLink}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-primary underline"
              >
                פתח
              </a>
            </div>
            {email.date && <div className="text-[10px] text-muted-foreground">{email.date}</div>}
            <div className="mt-1 line-clamp-2 text-muted-foreground">{email.snippet}</div>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-border pt-2">
        <Button
          variant="outline"
          onClick={buildDraft}
          disabled={!canEdit || draftBusy}
          className="w-full"
        >
          <Bot className="h-4 w-4" /> {draftBusy ? "מנסח טיוטה…" : "צור טיוטת מעקב עם SOL"}
        </Button>

        {(draftSubject || draftBody) && (
          <div className="space-y-2">
            <input
              type="email"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              placeholder="כתובת מייל של המועמד"
              dir="ltr"
              className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            <input
              type="text"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              placeholder="נושא"
              className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              className="min-h-[140px] w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <Button
              variant="command"
              onClick={sendToGmail}
              disabled={!canEdit || sendBusy || !draftTo.trim()}
              className="w-full"
            >
              <Send className="h-4 w-4" /> {sendBusy ? "שולח ל-Gmail…" : "שלח מייל"}
            </Button>
          </div>
        )}

        {draftStatus && (
          <div className="text-xs text-muted-foreground">
            {draftStatus}
            {draftLink && (
              <>
                {" "}
                <a href={draftLink} target="_blank" rel="noreferrer" className="text-primary underline">
                  פתח טיוטה ב-Gmail
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function defaultAgentStatuses(): AutomationAgentStatus[] {
  return [
    { key: "gmail", label: "Gmail / SOL", ready: true, detail: "מחובר דרך Lovable Cloud." },
    {
      key: "calendar",
      label: "Google Calendar / SOL",
      ready: true,
      detail: "מחובר דרך Lovable Cloud.",
    },
    { key: "docs", label: "Google Docs", ready: true, detail: "מחובר דרך Lovable Cloud." },
    { key: "sheets", label: "Google Sheets", ready: true, detail: "מחובר דרך Lovable Cloud." },
    { key: "drive", label: "Google Drive", ready: true, detail: "מחובר דרך Lovable Cloud." },
    {
      key: "meta_whatsapp",
      label: "Meta WhatsApp Cloud API",
      ready: true,
      detail: "מחובר דרך Meta Cloud API.",
    },
    {
      key: "haile_ai",
      label: "Haile AI Gateway",
      ready: true,
      detail: "מודל AI זמין להפעלה.",
    },
  ];
}

function QuickCandidateForm({
  form,
  onChange,
  onSave,
  isEditing,
}: {
  form: CandidateForm;
  onChange: (form: CandidateForm) => void;
  onSave: () => void;
  isEditing: boolean;
}) {
  return (
    <div className="mb-4 grid gap-3 rounded-md border border-border bg-surface p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SmallInput
          label="שם מלא"
          value={form.name}
          onChange={(name) => onChange({ ...form, name })}
        />
        <SmallInput
          label="טלפון"
          value={form.phone}
          onChange={(phone) => onChange({ ...form, phone })}
        />
        <SmallInput label="גיל" value={form.age} onChange={(age) => onChange({ ...form, age })} />
        <SmallSelect
          label="עיר"
          value={form.city}
          options={CITY_OPTIONS.map((c) => ({ value: c, label: CITY_LABELS_HE[c] }))}
          onChange={(city) => onChange({ ...form, city: city as CandidateForm["city"] })}
        />
        <SmallSelect
          label="שפה"
          value={form.language}
          options={["he", "am", "ru"]}
          onChange={(language) =>
            onChange({ ...form, language: language as CandidateForm["language"] })
          }
        />
        <SmallSelect
          label="שלב"
          value={form.stage}
          options={["Lead", "Learning", "Test", "Placed"]}
          onChange={(stage) => onChange({ ...form, stage: stage as CandidateForm["stage"] })}
        />
      </div>
      <SmallInput label="הערה" value={form.note} onChange={(note) => onChange({ ...form, note })} />
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <label>
          <input
            type="checkbox"
            checked={form.idDocument}
            onChange={(event) => onChange({ ...form, idDocument: event.target.checked })}
          />{" "}
          תעודת זהות
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.greenForm}
            onChange={(event) => onChange({ ...form, greenForm: event.target.checked })}
          />{" "}
          טופס ירוק
        </label>
      </div>
      <Button variant="command" onClick={onSave}>
        <Save className="h-4 w-4" /> {isEditing ? "עדכן מועמד" : "שמור מועמד"}
      </Button>
    </div>
  );
}

function MorningSummarySettings() {
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [time, setTime] = useState("08:00");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "error"; message?: string }>({
    kind: "idle",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }
      const res = await getAppSettings({ data: { accessToken } });
      if (cancelled) return;
      if (res.ok) {
        setPhone(res.settings.benyWhatsapp);
        setSavedPhone(res.settings.benyWhatsapp);
        setTime(res.settings.morningSummaryTime);
        setEnabled(res.settings.morningSummaryEnabled);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setStatus({ kind: "saving" });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setStatus({ kind: "error", message: "יש להתחבר מחדש." });
      return;
    }
    const res = await saveAppSettings({
      data: {
        accessToken,
        benyWhatsapp: phone,
        morningSummaryTime: time,
        morningSummaryEnabled: enabled,
      },
    });
    if (res.ok) {
      setSavedPhone(phone.replace(/[^\d+]/g, ""));
      setStatus({ kind: "ok", message: res.message });
    } else {
      setStatus({ kind: "error", message: res.message });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">טוען הגדרות...</p>;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs text-muted-foreground">WhatsApp לקבלה</div>
        <div className="font-medium text-foreground" dir="ltr">
          {savedPhone || "לא הוגדר"}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">מספר WhatsApp (כולל קידומת מדינה)</span>
        <input
          dir="ltr"
          placeholder="+972501234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">שעת שליחה (Asia/Jerusalem)</span>
        <input
          type="time"
          dir="ltr"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-32 rounded-md border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>הפעל שליחת סיכום יומי</span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <Button variant="tactical" onClick={handleSave} disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "שומר..." : "שמור"}
        </Button>
        {status.message && (
          <span
            className={
              status.kind === "error" ? "text-destructive text-xs" : "text-emerald-500 text-xs"
            }
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}

function SolPage({
  selected,
  reminder,
  isLoading,
  onGenerateReminder,
}: {
  selected: Candidate | null;
  reminder: string;
  isLoading: boolean;
  onGenerateReminder: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="חיבורים">
        <ConnectionRow icon={CalendarClock} label="Google Calendar" connected />
        <ConnectionRow icon={Mail} label="Gmail" connected />
        <ConnectionRow
          icon={FileText}
          label="Google Docs"
          connected
          connectionId="std_01kqa4eyvefkb8f7b4ffadqyn0"
        />
        <ConnectionRow
          icon={Database}
          label="Google Sheets"
          connected
          connectionId="std_01kqa4gs49fm7t66jzne5zkg2x"
        />
      </Panel>
      <Panel title="שיחה עם SOL">
        <div className="space-y-3">
          <SettingsGrid
            items={[
              `מועמד פעיל: ${selected?.name ?? "לא נבחר"}`,
              "מקור: Gmail Inbox",
              "שפה: אמהרית ל־WhatsApp",
            ]}
          />
          <Button variant="command" onClick={onGenerateReminder} disabled={isLoading}>
            <Mail className="h-4 w-4" />{" "}
            {isLoading ? "מייצר תזכורת..." : "Generate WhatsApp Reminder"}
          </Button>
          <div className="rounded-md border border-border bg-background/60 p-4 text-sm leading-7 text-foreground">
            {reminder}
          </div>
        </div>
      </Panel>
      <Panel title="סיכום בוקר">
        <MorningSummarySettings />
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

function ConnectionStatusList({ statuses }: { statuses: AutomationAgentStatus[] }) {
  const [liveStatuses, setLiveStatuses] = useState<AutomationAgentStatus[]>(statuses);
  const [loading, setLoading] = useState(statuses.length === 0);

  useEffect(() => {
    if (statuses.length > 0) {
      setLiveStatuses(statuses);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }
      const result = await checkAutomationAgents({ data: { accessToken } });
      if (cancelled) return;
      if (result.ok && result.statuses.length > 0) {
        setLiveStatuses(result.statuses);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [statuses]);

  const list = liveStatuses.length ? liveStatuses : defaultAgentStatuses();

  return (
    <div className="flex flex-col gap-2">
      {loading && (
        <p className="text-xs text-muted-foreground">בודק חיבורים...</p>
      )}
      {list.map((status) => (
        <div
          key={status.key}
          className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground">{status.label}</span>
            <span className="text-xs text-muted-foreground">{status.detail}</span>
          </div>
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
              status.ready
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status.ready ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
            {status.ready ? "מחובר" : "לא מחובר"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SettingsPage({
  onExport,
  isSuperAdmin,
  agentStatuses,
}: {
  onExport: () => void;
  isSuperAdmin: boolean;
  agentStatuses: AutomationAgentStatus[];
}) {
  const [benyWhatsapp, setBenyWhatsapp] = useState("");
  const [benyTelegramChatId, setBenyTelegramChatId] = useState("");
  const [summaryTime, setSummaryTime] = useState("08:00");
  const [summaryEnabled, setSummaryEnabled] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "error"; message?: string }>({
    kind: "idle",
  });

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      const res = await getAppSettings({ data: { accessToken } });
      if (cancelled || !res.ok) return;
      setBenyWhatsapp(res.settings.benyWhatsapp);
      setBenyTelegramChatId(res.settings.benyTelegramChatId ?? "");
      setSummaryTime(res.settings.morningSummaryTime);
      setSummaryEnabled(res.settings.morningSummaryEnabled);
      setUpdatedAt(res.settings.updatedAt);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const handleSave = async () => {
    setStatus({ kind: "saving" });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setStatus({ kind: "error", message: "יש להתחבר מחדש." });
      return;
    }
    const res = await saveAppSettings({
      data: {
        accessToken,
        benyWhatsapp,
        morningSummaryTime: summaryTime,
        morningSummaryEnabled: summaryEnabled,
      },
    });
    if (res.ok) {
      setStatus({ kind: "ok", message: res.message });
      setUpdatedAt(new Date().toISOString());
    } else {
      setStatus({ kind: "error", message: res.message });
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="פרופיל מנכ״ל – בני אספה">
        {isSuperAdmin ? (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">טלפון WhatsApp (כולל קידומת מדינה)</span>
              <input
                dir="ltr"
                placeholder="+972501234567"
                value={benyWhatsapp}
                onChange={(e) => setBenyWhatsapp(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              מספר זה ישמש לסיכום הבוקר היומי דרך WhatsApp Business API.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <Button variant="tactical" onClick={handleSave} disabled={status.kind === "saving"}>
                {status.kind === "saving" ? "שומר..." : "שמור"}
              </Button>
              {status.message && (
                <span
                  className={
                    status.kind === "error" ? "text-destructive text-xs" : "text-emerald-500 text-xs"
                  }
                >
                  {status.message}
                </span>
              )}
            </div>
          </div>
        ) : (
          <SettingsGrid items={["רק SUPER_ADMIN יכול לערוך הגדרות אלו."]} />
        )}
      </Panel>

      <Panel title="סיכום בוקר אוטומטי">
        {isSuperAdmin ? (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={summaryEnabled}
                onChange={(e) => setSummaryEnabled(e.target.checked)}
              />
              <span>הפעל שליחת סיכום יומי</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">שעת שליחה (Asia/Jerusalem)</span>
              <input
                type="time"
                dir="ltr"
                value={summaryTime}
                onChange={(e) => setSummaryTime(e.target.value)}
                className="w-32 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <div className="flex items-center gap-3 pt-2">
              <Button variant="tactical" onClick={handleSave} disabled={status.kind === "saving"}>
                {status.kind === "saving" ? "שומר..." : "שמור הגדרות"}
              </Button>
              {status.message && (
                <span
                  className={
                    status.kind === "error" ? "text-destructive text-xs" : "text-emerald-500 text-xs"
                  }
                >
                  {status.message}
                </span>
              )}
            </div>
            {updatedAt && (
              <p className="text-xs text-muted-foreground">
                עודכן לאחרונה: {new Date(updatedAt).toLocaleString("he-IL")}
              </p>
            )}
          </div>
        ) : (
          <SettingsGrid items={["רק SUPER_ADMIN רואה את הגדרות הסיכום."]} />
        )}
      </Panel>

      <Panel title="חיבורים">
        <ConnectionStatusList statuses={agentStatuses} />
      </Panel>

      <Panel title="בדיקת ערוצי תקשורת">
        <IntegrationTester isSuperAdmin={isSuperAdmin} />
      </Panel>

      <Panel title="WhatsApp — תבניות סטטוס ושפה">
        <WhatsAppSenderSettings isSuperAdmin={isSuperAdmin} defaultPhone={benyWhatsapp} />
      </Panel>

      <Panel title="שגיאות ערוצים אחרונות">
        <IntegrationFailuresPanel isAuthorized={isSuperAdmin} />
      </Panel>

      <Panel title="גיבוי נתונים">
        <Button variant="tactical" onClick={onExport}>
          <Download className="h-4 w-4" /> ייצוא CSV של מועמדים
        </Button>
      </Panel>
    </div>
  );
}

function IntegrationTester({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [channel, setChannel] = useState<"slack" | "telegram" | "whatsapp">("slack");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("בדיקה מהמערכת — Haile AI 🚀");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sendTest = useServerFn(sendTestNotification);

  if (!isSuperAdmin) {
    return <SettingsGrid items={["רק SUPER_ADMIN יכול לבצע בדיקות שליחה."]} />;
  }

  const placeholder =
    channel === "slack"
      ? "#general או C0123ABC"
      : channel === "telegram"
        ? "Chat ID (לדוגמה 123456789)"
        : "+972501234567";

  const handleSend = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setResult({ ok: false, message: "יש להתחבר מחדש." });
        return;
      }
      const res = await sendTest({
        data: { accessToken, channel, target: target.trim(), message: message.trim() },
      });
      setResult({ ok: res.ok, message: res.message });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "שגיאה לא ידועה.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {(["slack", "telegram", "whatsapp"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-bold transition",
              channel === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "slack" ? "Slack" : c === "telegram" ? "Telegram" : "WhatsApp"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">יעד</span>
        <input
          dir="ltr"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={placeholder}
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">הודעת בדיקה</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button
          variant="tactical"
          onClick={handleSend}
          disabled={busy || !target.trim() || !message.trim()}
        >
          <Send className="h-4 w-4" />
          {busy ? "שולח..." : "שלח בדיקה"}
        </Button>
        {result && (
          <span
            className={cn(
              "text-xs",
              result.ok ? "text-emerald-500" : "text-destructive",
            )}
          >
            {result.message}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        כל בדיקה (הצלחה או כישלון) נרשמת אוטומטית ב-Operations log.
      </p>
    </div>
  );
}

type WhatsLang = "he" | "am" | "ru";
type WhatsTemplateKey =
  | "status_update"
  | "documents_reminder"
  | "test_scheduled"
  | "training_invite"
  | "placement_congrats";

const WHATSAPP_LANGUAGES: { value: WhatsLang; label: string }[] = [
  { value: "he", label: "עברית" },
  { value: "am", label: "Amharic" },
  { value: "ru", label: "Русский" },
];

const WHATSAPP_TEMPLATES: Record<
  WhatsTemplateKey,
  { label: string; bodies: Record<WhatsLang, string> }
> = {
  status_update: {
    label: "עדכון סטטוס כללי",
    bodies: {
      he: "שלום {{name}}, עדכון מצוות Haile AI: השלב הנוכחי שלך הוא {{stage}}. נשמח לעדכון ממך 🙏",
      am: "ሰላም {{name}}፣ ከHaile AI ቡድን ዝመና፦ የአሁኑ ደረጃዎ {{stage}} ነው። ምላሽ ለመስጠት እባክዎ ያሳውቁን 🙏",
      ru: "Здравствуйте, {{name}}! Обновление от команды Haile AI: ваш текущий этап — {{stage}}. Пожалуйста, сообщите нам новости 🙏",
    },
  },
  documents_reminder: {
    label: "תזכורת מסמכים",
    bodies: {
      he: "היי {{name}}, חסרים לנו עדיין מסמכים להמשך התהליך. אפשר לשלוח אותם בוואטסאפ כתשובה להודעה זו. תודה!",
      am: "ሰላም {{name}}፣ ሂደቱን ለመቀጠል አሁንም አንዳንድ ሰነዶች ይጎድላሉ። እባክዎ በዚህ መልዕክት መልስ ይላኩልን። እናመሰግናለን!",
      ru: "Здравствуйте, {{name}}! Нам всё ещё не хватает документов, чтобы продолжить процесс. Пожалуйста, отправьте их ответом на это сообщение. Спасибо!",
    },
  },
  test_scheduled: {
    label: "זימון למבחן",
    bodies: {
      he: "{{name}}, נקבע לך מועד מבחן. אנא אשר/י קבלה ונדאג להכנה אחרונה. בהצלחה!",
      am: "{{name}}፣ የፈተና ቀን ተዘጋጅቶልዎታል። እባክዎ ማረጋገጫ ይላኩ፣ የመጨረሻ ዝግጅት እናደርጋለን። መልካም ዕድል!",
      ru: "{{name}}, для вас назначена дата экзамена. Пожалуйста, подтвердите получение — мы поможем с финальной подготовкой. Удачи!",
    },
  },
  training_invite: {
    label: "הזמנה להדרכה",
    bodies: {
      he: "שלום {{name}}, מזמינים אותך להדרכת נהגים. אנא אשר/י השתתפות ונשלח פרטים מדויקים.",
      am: "ሰላም {{name}}፣ ለሹፌሮች ስልጠና እንጋብዝዎታለን። እባክዎ መሳተፍዎን ያረጋግጡ፣ ዝርዝሩን እንልክልዎታለን።",
      ru: "Здравствуйте, {{name}}! Приглашаем вас на тренинг для водителей. Пожалуйста, подтвердите участие — мы пришлём подробности.",
    },
  },
  placement_congrats: {
    label: "ברכה על השמה",
    bodies: {
      he: "{{name}}, ברכות על ההשמה! צוות Haile AI גאה בך. נשארים בקשר להמשך הליווי 🚍",
      am: "{{name}}፣ በመመደብዎ እንኳን ደስ አለዎት! የHaile AI ቡድን በእርስዎ ይኮራል። ለቀጣይ ድጋፍ እንገናኝ 🚍",
      ru: "{{name}}, поздравляем с трудоустройством! Команда Haile AI гордится вами. Остаёмся на связи для дальнейшего сопровождения 🚍",
    },
  },
};

function renderWhatsTemplate(
  body: string,
  vars: { name: string; stage: string },
) {
  return body
    .replaceAll("{{name}}", vars.name.trim() || "—")
    .replaceAll("{{stage}}", vars.stage.trim() || "—");
}

function WhatsAppSenderSettings({
  isSuperAdmin,
  defaultPhone,
}: {
  isSuperAdmin: boolean;
  defaultPhone: string;
}) {
  const [templateKey, setTemplateKey] = useState<WhatsTemplateKey>("status_update");
  const [language, setLanguage] = useState<WhatsLang>("he");
  const [recipientName, setRecipientName] = useState("");
  const [stageLabel, setStageLabel] = useState("Lead");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sendTest = useServerFn(sendTestNotification);

  useEffect(() => {
    if (defaultPhone && !phone) setPhone(defaultPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPhone]);

  if (!isSuperAdmin) {
    return <SettingsGrid items={["רק SUPER_ADMIN יכול להגדיר ולשלוח הודעות WhatsApp."]} />;
  }

  const template = WHATSAPP_TEMPLATES[templateKey];
  const preview = renderWhatsTemplate(template.bodies[language], {
    name: recipientName,
    stage: stageLabel,
  });
  const isRtlPreview = language === "he" || language === "am";

  const handleSend = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setResult({ ok: false, message: "יש להתחבר מחדש." });
        return;
      }
      const res = await sendTest({
        data: {
          accessToken,
          channel: "whatsapp",
          target: phone.trim(),
          message: preview,
        },
      });
      setResult({ ok: res.ok, message: res.message });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "שגיאה לא ידועה.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">תבנית הודעה</span>
        <select
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value as WhatsTemplateKey)}
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        >
          {(Object.keys(WHATSAPP_TEMPLATES) as WhatsTemplateKey[]).map((k) => (
            <option key={k} value={k}>
              {WHATSAPP_TEMPLATES[k].label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">שפה</span>
        <div className="flex flex-wrap gap-2">
          {WHATSAPP_LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLanguage(l.value)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-bold transition",
                language === l.value
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">שם המועמד</span>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="לדוגמה: דניאל"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">שלב נוכחי</span>
          <input
            value={stageLabel}
            onChange={(e) => setStageLabel(e.target.value)}
            placeholder="Lead / Learning / Test / Placed"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">טלפון יעד (כולל קידומת)</span>
        <input
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+972501234567"
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">תצוגה מקדימה</span>
        <div
          dir={isRtlPreview ? "rtl" : "ltr"}
          className="min-h-[80px] whitespace-pre-wrap rounded-md border border-dashed border-border bg-surface p-3 text-foreground"
        >
          {preview}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="tactical"
          onClick={handleSend}
          disabled={busy || !phone.trim() || !preview.trim()}
        >
          <Send className="h-4 w-4" />
          {busy ? "שולח..." : "שלח WhatsApp"}
        </Button>
        {result && (
          <span
            className={cn(
              "text-xs",
              result.ok ? "text-emerald-500" : "text-destructive",
            )}
          >
            {result.message}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        ההודעה נשלחת דרך Meta WhatsApp Cloud API ונרשמת ב-Operations log.
      </p>
    </div>
  );
}

const FAILURE_CHANNEL_LABELS: Record<IntegrationFailure["channel"], string> = {
  slack: "Slack",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  other: "אחר",
};

function IntegrationFailuresPanel({ isAuthorized }: { isAuthorized: boolean }) {
  const [failures, setFailures] = useState<IntegrationFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | IntegrationFailure["channel"]>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const fetchFailures = useServerFn(getRecentIntegrationFailures);
  const sendTest = useServerFn(sendTestNotification);

  const load = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      const res = await fetchFailures({ data: { accessToken } });
      if (res.ok) setFailures(res.failures);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  if (!isAuthorized) {
    return <SettingsGrid items={["רק מורשים יכולים לראות שגיאות ערוצים."]} />;
  }

  const filtered = filter === "all" ? failures : failures.filter((f) => f.channel === filter);

  const counts = failures.reduce<Record<string, number>>((acc, f) => {
    acc[f.channel] = (acc[f.channel] ?? 0) + 1;
    return acc;
  }, {});

  const handleRetry = async (f: IntegrationFailure) => {
    if (f.channel === "other" || !f.target || !f.message) {
      setStatusMsg({ ok: false, message: "אין מספיק מידע כדי לנסות שליחה חוזרת." });
      return;
    }
    setRetryingId(f.id);
    setStatusMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setStatusMsg({ ok: false, message: "יש להתחבר מחדש." });
        return;
      }
      const res = await sendTest({
        data: {
          accessToken,
          channel: f.channel as "slack" | "telegram" | "whatsapp",
          target: f.target,
          message: f.message,
        },
      });
      setStatusMsg({ ok: res.ok, message: res.message });
      await load();
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "שגיאה בשליחה חוזרת.",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const channels: ("all" | IntegrationFailure["channel"])[] = [
    "all",
    "slack",
    "telegram",
    "whatsapp",
    "other",
  ];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {channels.map((c) => {
          const label =
            c === "all" ? `הכל (${failures.length})` : `${FAILURE_CHANNEL_LABELS[c]} (${counts[c] ?? 0})`;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-bold transition",
                filter === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
        <Button variant="tactical" onClick={load} disabled={loading} className="ml-auto">
          {loading ? "טוען..." : "רענן"}
        </Button>
      </div>

      {statusMsg && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            statusMsg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {statusMsg.message}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState text={loading ? "טוען שגיאות..." : "אין שגיאות אחרונות בערוצי התקשורת. ✅"} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((f) => {
            const canRetry =
              f.channel !== "other" && Boolean(f.target) && Boolean(f.message);
            return (
              <li
                key={f.id}
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                      {FAILURE_CHANNEL_LABELS[f.channel]}
                    </span>
                    {f.target && (
                      <span dir="ltr" className="text-xs text-muted-foreground">
                        {f.target}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(f.createdAt).toLocaleString("he-IL")}
                    </span>
                  </div>
                  <Button
                    variant="tactical"
                    onClick={() => handleRetry(f)}
                    disabled={!canRetry || retryingId === f.id}
                  >
                    <Send className="h-4 w-4" />
                    {retryingId === f.id ? "שולח..." : "נסה שוב"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-destructive">{f.error}</p>
                {f.message && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    הודעה: {f.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        מציג עד 30 שגיאות אחרונות מ-Operations log. שליחה חוזרת מבצעת קריאה אמיתית לערוץ.
      </p>
    </div>
  );
}

function AdminUsersPage({
  users,
  onInvite,
  status,
}: {
  users: SystemUser[];
  onInvite: (email: string, password: string, role: "operator" | "viewer") => void;
  status: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <Panel title="משתמשים פעילים">
        {users.length === 0 ? (
          <EmptyState text="אין משתמשים פעילים להצגה." />
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3"
              >
                <span className="font-bold">{user.email}</span>
                <StatusBadge text={roleLabel(user.role as AppRole)} />
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="הזמנת משתמש חדש">
        <SmallInput label="מייל" value={email} onChange={setEmail} />
        <SmallInput
          label="סיסמה זמנית"
          value={password}
          onChange={setPassword}
          type="password"
          minLength={8}
        />
        <SmallSelect
          label="תפקיד"
          value={role}
          options={["operator", "viewer"]}
          onChange={(value: string) => setRole(value as "operator" | "viewer")}
        />
        <Button
          className="mt-4 min-h-11"
          variant="command"
          onClick={() => onInvite(email, password, role)}
        >
          <UserPlus className="h-4 w-4" /> שלח הזמנה
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">{status}</p>
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
  action?: ReactNode;
  children: ReactNode;
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
  canEdit,
  onInlineSave,
  onInlineNote,
}: {
  candidate: Candidate;
  active: boolean;
  onClick: () => void;
  canEdit: boolean;
  onInlineSave: (candidate: Candidate, patch: CandidateInlinePatch) => Promise<{ ok: boolean; message: string }>;
  onInlineNote: (candidate: Candidate, note: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastUpdated = candidate.updatedAt ?? candidate.createdAt;

  const handleHeaderClick = () => {
    onClick();
    setExpanded((prev) => !prev);
  };

  return (
    <div
      className={`rounded-lg border text-right transition ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
    >
      <button
        type="button"
        onClick={handleHeaderClick}
        className="grid w-full gap-3 p-4 text-right hover:-translate-y-0.5 md:grid-cols-[1fr_auto]"
      >
        <div className="flex gap-3">
          <Initials name={candidate.name} />
          <div>
            <h3 className="font-black">{candidate.name}</h3>
            <p className="text-sm text-muted-foreground">
              {formatPhone(candidate.phone)} · {cityLabel(candidate.city)} · {candidate.language}
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                עודכן לאחרונה: {formatDate(lastUpdated)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge text={stageLabels[candidate.stage] ?? candidate.stage} />
          <GradeBadge grade={candidate.grade} />
        </div>
      </button>
      {expanded && (
        <CandidateEditPanel
          candidate={candidate}
          canEdit={canEdit}
          onClose={() => setExpanded(false)}
          onInlineSave={onInlineSave}
          onInlineNote={onInlineNote}
        />
      )}
    </div>
  );
}

function CandidateEditPanel({
  candidate,
  canEdit,
  onClose,
  onInlineSave,
  onInlineNote,
}: {
  candidate: Candidate;
  canEdit: boolean;
  onClose: () => void;
  onInlineSave: (candidate: Candidate, patch: CandidateInlinePatch) => Promise<{ ok: boolean; message: string }>;
  onInlineNote: (candidate: Candidate, note: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const initialCity =
    (normalizeCityValue(String(candidate.city ?? "")) as CityOption | undefined) ??
    (CITY_OPTIONS.includes(candidate.city as CityOption) ? (candidate.city as CityOption) : "Other");
  const initialLicense = (LICENSE_OPTIONS as readonly string[]).includes(candidate.licenseStatus)
    ? (candidate.licenseStatus as CandidateInlinePatch["license"])
    : "Not Started";
  const initialStage = (STAGE_OPTIONS as readonly string[]).includes(candidate.stage)
    ? (candidate.stage as CandidateInlinePatch["stage"])
    : "Lead";
  const initialPartner: PartnerOption | null =
    candidate.partner && (PARTNER_OPTIONS as string[]).includes(candidate.partner)
      ? (candidate.partner as PartnerOption)
      : candidate.partner
        ? "Other"
        : null;

  const [patch, setPatch] = useState<CandidateInlinePatch>({
    name: candidate.name,
    phone: candidate.phone,
    age: candidate.age ? String(candidate.age) : "",
    city: initialCity,
    stage: initialStage,
    license: initialLicense,
    language: candidate.langCode,
    partner: initialPartner,
    notes: candidate.note,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isNoting, setIsNoting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const update = <K extends keyof CandidateInlinePatch>(key: K, value: CandidateInlinePatch[K]) =>
    setPatch((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setStatus(null);
    const result = await onInlineSave(candidate, patch);
    setStatus(result.message);
    setIsSaving(false);
  };

  const handleAddNote = async () => {
    if (!canEdit) return;
    setIsNoting(true);
    setStatus(null);
    const result = await onInlineNote(candidate, noteDraft);
    setStatus(result.message);
    if (result.ok) setNoteDraft("");
    setIsNoting(false);
  };

  const fieldClass =
    "min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const labelClass = "grid gap-1 text-xs font-medium text-muted-foreground";

  return (
    <div className="grid gap-3 border-t border-border bg-background/50 p-4 text-right">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          שם מלא
          <input
            className={fieldClass}
            value={patch.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={!canEdit}
            maxLength={160}
          />
        </label>
        <label className={labelClass}>
          טלפון
          <input
            className={fieldClass}
            value={patch.phone}
            onChange={(e) => update("phone", e.target.value)}
            disabled={!canEdit}
            maxLength={30}
            inputMode="tel"
          />
        </label>
        <label className={labelClass}>
          גיל
          <input
            className={fieldClass}
            value={patch.age}
            onChange={(e) => update("age", e.target.value.replace(/[^\d]/g, ""))}
            disabled={!canEdit}
            inputMode="numeric"
            maxLength={3}
          />
        </label>
        <label className={labelClass}>
          עיר
          <select
            className={fieldClass}
            value={patch.city}
            onChange={(e) => update("city", e.target.value as CityOption)}
            disabled={!canEdit}
          >
            {CITY_OPTIONS.map((city) => (
              <option key={city} value={city}>
                {CITY_LABELS_HE[city]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          שלב
          <select
            className={fieldClass}
            value={patch.stage}
            onChange={(e) => update("stage", e.target.value as CandidateInlinePatch["stage"])}
            disabled={!canEdit}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          רישיון
          <select
            className={fieldClass}
            value={patch.license}
            onChange={(e) => update("license", e.target.value as CandidateInlinePatch["license"])}
            disabled={!canEdit}
          >
            {LICENSE_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {LICENSE_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          שותף
          <select
            className={fieldClass}
            value={patch.partner ?? ""}
            onChange={(e) => update("partner", (e.target.value || null) as PartnerOption | null)}
            disabled={!canEdit}
          >
            <option value="">— ללא —</option>
            {PARTNER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          שפה מועדפת
          <select
            className={fieldClass}
            value={patch.language}
            onChange={(e) => update("language", e.target.value as "he" | "am" | "ru")}
            disabled={!canEdit}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        הערות
        <textarea
          className={`${fieldClass} min-h-20 py-2`}
          value={patch.notes}
          onChange={(e) => update("notes", e.target.value)}
          disabled={!canEdit}
          maxLength={2000}
          rows={3}
        />
      </label>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea
          placeholder="הוסף הערה ליומן (תיכתב כלוג חדש)"
          className={`${fieldClass} min-h-12 py-2`}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          disabled={!canEdit}
          maxLength={4000}
          rows={2}
        />
        <Button
          variant="tactical"
          onClick={handleAddNote}
          disabled={!canEdit || isNoting || !noteDraft.trim()}
        >
          <FileText className="h-4 w-4" /> {isNoting ? "שומר..." : "הוסף הערה"}
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          עודכן לאחרונה: {formatDate(candidate.updatedAt ?? candidate.createdAt)}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            סגור
          </Button>
          <Button
            variant="command"
            onClick={handleSave}
            disabled={!canEdit || isSaving}
          >
            <Save className="h-4 w-4" /> {isSaving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CandidateProfile({
  candidate,
  onAi,
  onEdit,
  onDelete,
  onStageChange,
  aiText,
  isAiLoading,
  canEdit,
}: {
  candidate: Candidate;
  onAi: (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => void;
  onEdit: () => void;
  onDelete: () => void;
  onStageChange: (stage: CandidateForm["stage"]) => void;
  aiText: string;
  isAiLoading: boolean;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Initials name={candidate.name} />
        <div>
          <h3 className="text-2xl font-black">{candidate.name}</h3>
          <p className="text-sm text-muted-foreground">
            {formatPhone(candidate.phone)} · {cityLabel(candidate.city)}
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
        {canEdit &&
          (["Lead", "Learning", "Test", "Placed"] as const).map((stage) => (
            <Button key={stage} variant="tactical" size="sm" onClick={() => onStageChange(stage)}>
              {stageLabels[stage]}
            </Button>
          ))}
        {canEdit && (
          <>
            <Button variant="tactical" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> ערוך
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> מחק
            </Button>
          </>
        )}
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
              <td className="p-3">{cityLabel(candidate.city)}</td>
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
  isConnected,
  activityCount,
  onPrimaryAction,
  primaryActionLabel,
  selectedName,
  statusText,
}: {
  name: string;
  icon: typeof Bot;
  description: string;
  tone: string;
  isConnected: boolean;
  activityCount: number;
  onPrimaryAction?: () => void;
  primaryActionLabel: string;
  selectedName: string | null;
  statusText: string;
}) {
  const iconTone =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "intel"
          ? "text-intel"
          : "text-primary";

  return (
    <article className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-surface-strong">
            <Icon className={`h-5 w-5 ${iconTone}`} />
          </div>
          <div>
            <h3 className="text-xl font-black">{name}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-success" : "bg-muted-foreground"}`}
          />
          {isConnected ? "מחובר למועמד" : "לא מחובר"}
        </span>
      </div>
      <SettingsGrid
        items={[
          `מועמד פעיל: ${selectedName ?? "לא נבחר"}`,
          `פעולות ביומן: ${activityCount}`,
          statusText,
        ]}
      />
      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1"
          variant="tactical"
          onClick={onPrimaryAction}
          disabled={!onPrimaryAction}
        >
          <Bot className="h-4 w-4" /> {primaryActionLabel}
        </Button>
        <Button className="flex-1" variant="ghost" disabled>
          <SlidersHorizontal className="h-4 w-4" />{" "}
          {isConnected ? "Read/Write פעיל" : "ממתין לבחירה"}
        </Button>
      </div>
    </article>
  );
}

function ImportControls({
  importRows,
  importStatus,
  isImporting,
  onFile,
  onImport,
  onExport,
  canEdit,
}: {
  importRows: number;
  importStatus: string;
  isImporting: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  onExport: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="tactical" onClick={onExport}>
        <Download className="h-4 w-4" /> ייצוא CSV
      </Button>
      <Button variant="tactical" asChild disabled={!canEdit}>
        <label className="min-h-11 cursor-pointer">
          <UploadCloud className="h-4 w-4" /> בחר CSV / Excel
          <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={onFile} />
        </label>
      </Button>
      <Button
        variant="command"
        onClick={onImport}
        disabled={!canEdit || !importRows || isImporting}
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

function ConnectionRow({
  icon: Icon,
  label,
  connected = false,
  connectionId,
}: {
  icon: typeof CalendarClock;
  label: string;
  connected?: boolean;
  connectionId?: string;
}) {
  return (
    <div className="mb-3 flex min-h-14 items-center justify-between rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2 font-bold">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </span>
      <Button variant={connected ? "command" : "tactical"} size="sm" disabled={connected}>
        {connected ? "מחובר" : "התחבר"}
      </Button>
      {connectionId && <span className="sr-only">Connection ID: {connectionId}</span>}
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

function decodeHebrew(value: string): string {
  if (!value) return value;
  // If already contains Hebrew chars, assume correctly decoded.
  if (/[\u0590-\u05FF]/.test(value)) return value;
  // Detect mojibake pattern: UTF-8 bytes interpreted as Latin-1/Windows-1252.
  // Common markers for Hebrew mojibake: "×" (0xD7) followed by another 0x80-0xBF byte
  // or "Ö" / "×" sequences. Try to repair by re-encoding char codes as bytes
  // and decoding as UTF-8.
  if (!/[\u00C0-\u00FF]/.test(value)) return value;
  try {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 0xff) return value; // not a latin1 sequence, abort
      bytes[i] = code;
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Only accept the repair if it actually produced Hebrew.
    if (/[\u0590-\u05FF]/.test(decoded)) return decoded;
    return value;
  } catch {
    return value;
  }
}

function normalizeCandidate(row: CandidateRow): Candidate {
  const rawName = row.name || normalizeName(row.full_name, row.phone ?? "");
  const fullName = decodeHebrew(rawName);
  const profile = normalizeProfile(row.localized_profile);
  const documentsReady = normalizeDocuments(row.documents);
  const score = typeof profile.score === "number" ? profile.score : null;
  return {
    id: row.id,
    name: fullName,
    phone: row.phone ?? "",
    age: row.age,
    city: row.city ? String(row.city) : "Other",
    language: languageLabel(row.preferred_language),
    langCode: (row.preferred_language === "he" || row.preferred_language === "ru" ? row.preferred_language : "am") as "he" | "am" | "ru",
    licenseStatus: row.license_status ?? "Not Started",
    stage: row.stage,
    grade: gradeFromScore(score),
    score,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    documentsReady,
    note: decodeHebrew(profile.note),
    partner: row.assigned_to ?? null,
    nextStepDueAt: row.next_step_due_at,
    lastContactedAt: row.last_contacted_at,
  };
}

function normalizeName(value: Json, fallback: string) {
  if (typeof value === "string") return value || fallback;
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

function roleLabel(role: AppRole | null) {
  if (role === "super_admin") return "SUPER_ADMIN";
  if (role === "operator") return "OPERATOR";
  if (role === "viewer") return "VIEWER";
  return "ללא תפקיד";
}

function emptyCandidateForm(): CandidateForm {
  return {
    name: "",
    phone: "",
    age: "",
    city: "Ashkelon",
    language: "am",
    stage: "Lead",
    licenseStatus: "Not Started",
    note: "",
    idDocument: false,
    greenForm: false,
  };
}

function candidateToForm(candidate: Candidate): CandidateForm {
  return {
    name: candidate.name,
    phone: candidate.phone,
    age: candidate.age ? String(candidate.age) : "",
    city: (normalizeCityValue(String(candidate.city ?? "")) ?? (candidate.city as CityOption | undefined) ?? "Other"),
    language: candidate.language === "עברית" ? "he" : candidate.language === "רוסית" ? "ru" : "am",
    stage: (["Lead", "Learning", "Test", "Placed"] as const).includes(
      candidate.stage as CandidateForm["stage"],
    )
      ? (candidate.stage as CandidateForm["stage"])
      : "Lead",
    licenseStatus: (
      ["Not Started", "Learning", "Theory Ready", "Test Scheduled", "Licensed"] as const
    ).includes(candidate.licenseStatus as CandidateForm["licenseStatus"])
      ? (candidate.licenseStatus as CandidateForm["licenseStatus"])
      : "Not Started",
    note: candidate.note,
    idDocument: candidate.documentsReady,
    greenForm: candidate.documentsReady,
  };
}

function downloadCsv(filename: string, rows: Record<string, string | number | boolean>[]) {
  const headers = Object.keys(rows[0] ?? { ריק: "" });
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function parseImportFile(
  file: File,
): Promise<Record<string, string | number | boolean | null>[]> {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  let workbook: XLSX.WorkBook;
  if (isCsv) {
    // Decode CSV explicitly as UTF-8 (with BOM stripping) so Hebrew is preserved.
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    workbook = XLSX.read(text, { type: "string", raw: false });
  } else {
    workbook = XLSX.read(buffer, { type: "array", raw: false });
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("הקובץ ריק או לא תקין.");
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  const normalizedRows = rows
    .map((row) => row.map((value) => (typeof value === "string" ? value.trim() : value)))
    .filter((row) => row.some((value) => String(value ?? "").trim().length > 0));

  const firstRow = normalizedRows[0] ?? [];
  const hasHeaderRow = firstRow.some((value) => {
    const normalized = String(value ?? "")
      .toLowerCase()
      .replace(/[\s_\-:()]/g, "")
      .trim();
    return normalized.includes("שם") || normalized.includes("name");
  });

  const headerRow = hasHeaderRow ? firstRow : [];
  const dataRows = hasHeaderRow ? normalizedRows.slice(1) : normalizedRows;

  const cleanRows = dataRows
    .map((row) => {
      const mappedRow: Record<string, string | number | boolean | null> = {};

      row.forEach((value, index) => {
        const positionalKey = `__col${index + 1}`;
        mappedRow[positionalKey] = value;

        const rawHeader = headerRow[index];
        const headerKey = typeof rawHeader === "string" ? rawHeader.trim() : String(rawHeader ?? "").trim();
        if (headerKey) {
          mappedRow[headerKey] = value;
        }
      });

      return mappedRow;
    })
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
