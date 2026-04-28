import { useMemo, useState } from "react";
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
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
        content: "Hebrew, Amharic and Russian command center for candidate pipeline and management.",
      },
    ],
  }),
  component: Index,
});

type Language = "he" | "am" | "ru";
type Stage = "Lead" | "Learning" | "Test" | "Placed";

type Candidate = {
  id: number;
  name: Record<Language, string>;
  age: number;
  city: "Ashkelon" | "Kiryat Gat";
  phone: string;
  language: Language;
  licenseStatus: string;
  stage: Stage;
  documents: { id: boolean; green: boolean };
  nextTest: string;
  note: string;
};

const candidates: Candidate[] = [
  {
    id: 1,
    name: { he: "דניאל טספאי", am: "ዳንኤል ተስፋይ", ru: "Даниэль Тесфай" },
    age: 29,
    city: "Kiryat Gat",
    phone: "054-771-2049",
    language: "am",
    licenseStatus: "Theory Ready",
    stage: "Learning",
    documents: { id: true, green: false },
    nextTest: "בעוד 7 ימים",
    note: "צריך לסיים חומר לימוד לפני מבחן",
  },
  {
    id: 2,
    name: { he: "שרה אברה", am: "ሳራ አብራ", ru: "Сара Абра" },
    age: 34,
    city: "Ashkelon",
    phone: "052-118-9201",
    language: "ru",
    licenseStatus: "Test Scheduled",
    stage: "Test",
    documents: { id: true, green: true },
    nextTest: "יום חמישי",
    note: "ממתינה לאישור שיבוץ באפיקים",
  },
  {
    id: 3,
    name: { he: "מיקאל דסטה", am: "ሚካኤል ደስታ", ru: "Микаэль Деста" },
    age: 41,
    city: "Kiryat Gat",
    phone: "050-888-1500",
    language: "am",
    licenseStatus: "Licensed",
    stage: "Placed",
    documents: { id: true, green: true },
    nextTest: "הושם באגד",
    note: "חשבונית פתוחה מול אגד",
  },
  {
    id: 4,
    name: { he: "אנטון קובל", am: "አንቶን ኮቫል", ru: "Антон Коваль" },
    age: 26,
    city: "Ashkelon",
    phone: "053-450-3319",
    language: "ru",
    licenseStatus: "Not Started",
    stage: "Lead",
    documents: { id: false, green: false },
    nextTest: "טרם נקבע",
    note: "נדרש איסוף מסמכים מלא",
  },
];

const finance = [
  { city: "Kiryat Gat", company: "Egged", pending: 36000, paid: 18000 },
  { city: "Ashkelon", company: "Afikim", pending: 24000, paid: 32000 },
];

const assets = [
  { name: "Arrizo 8-01", plate: "912-44-301", mileage: 18420, service: "12.05", status: "active" },
  { name: "Arrizo 8-02", plate: "912-44-302", mileage: 29880, service: "03.05", status: "service_due" },
  { name: "Arrizo 8-03", plate: "912-44-303", mileage: 12040, service: "28.06", status: "active" },
];

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
    growth: "צמיחה חודשית",
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
    growth: "ወርሃዊ እድገት",
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
    growth: "Рост за месяц",
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
  const [selectedId, setSelectedId] = useState(1);
  const [aiText, setAiText] = useState("בחר פעולה כדי להפעיל את שכבת ה-AI הרב-לשונית.");
  const [isLoading, setIsLoading] = useState(false);
  const generateText = useServerFn(generateHaileAiText);
  const t = copy[language];
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0];
  const missingCount = candidates.filter((candidate) => !candidate.documents.id || !candidate.documents.green).length;

  const metrics = useMemo(
    () => [
      { label: t.placements, value: "18", delta: "+4", icon: CheckCircle2 },
      { label: t.growth, value: "24%", delta: "+8%", icon: TrendingUp },
      { label: t.pending, value: "₪60K", delta: "2 cities", icon: Banknote },
      { label: t.missing, value: String(missingCount), delta: "docs", icon: FileWarning },
    ],
    [missingCount, t],
  );

  const runAi = async (mode: "candidate_next_step" | "translate_to_hebrew" | "status_template") => {
    setIsLoading(true);
    const missingDocuments = [!selected.documents.id ? "ID" : "", !selected.documents.green ? "Green Form" : ""].filter(Boolean);
    const result = await generateText({
      data: {
        mode,
        language: mode === "translate_to_hebrew" ? "he" : selected.language,
        candidateName: selected.name.he,
        stage: selected.stage,
        licenseStatus: selected.licenseStatus,
        missingDocuments,
        message:
          mode === "translate_to_hebrew"
            ? "እባክዎ ነገ እደውላለሁ፣ የግሪን ፎርም ሰነድ አሁን የለኝም።"
            : selected.note,
      },
    });
    setAiText(result.text);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground" dir={language === "he" ? "rtl" : "ltr"}>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="glass-panel sticky top-4 z-10 flex flex-col gap-4 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-primary">{t.command}</p>
              <h1 className="font-display text-2xl font-black tracking-normal sm:text-3xl">{t.title}</h1>
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
                Pipeline, Ciel's Log, Scat's Ledger, assets, WhatsApp templates and AI translation in one operating picture.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="glass-panel rounded-lg p-5 transition duration-300 hover:-translate-y-1">
                  <div className="mb-6 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="rounded-sm bg-success/20 px-2 py-1 text-xs font-black text-success">{metric.delta}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <strong className="mt-1 block text-3xl font-black">{metric.value}</strong>
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
              <Button variant="command" onClick={() => runAi("status_template")} disabled={isLoading}>
                <Send className="h-4 w-4" /> {t.reminder}
              </Button>
            </div>
            <div className="grid gap-3">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedId(candidate.id)}
                  className={`grid gap-4 rounded-lg border p-4 text-start transition duration-300 hover:-translate-y-0.5 sm:grid-cols-[1fr_auto_auto] sm:items-center ${selectedId === candidate.id ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
                >
                  <div>
                    <h3 className="text-lg font-black">{candidate.name[language]}</h3>
                    <p className="text-sm text-muted-foreground">
                      {candidate.city} · {candidate.phone} · {candidate.licenseStatus}
                    </p>
                  </div>
                  <span className={`w-fit rounded-sm px-3 py-1 text-xs font-black ${stageTone[candidate.stage]}`}>
                    {candidate.stage}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {candidate.documents.id && candidate.documents.green ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <FileWarning className="h-4 w-4 text-warning" />
                    )}
                    ID {candidate.documents.id ? "✓" : "—"} · Green {candidate.documents.green ? "✓" : "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <aside className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.feed}</p>
            <h2 className="mb-4 text-2xl font-black">Live command notes</h2>
            <div className="space-y-3">
              {[
                "Ciel: 2 Amharic follow-ups generated for missing Green Form.",
                "Scat: Egged pending balance increased after 1 placement.",
                "Sol: Kiryat Gat conversion improved from Learning to Test.",
              ].map((item, index) => (
                <div key={item} className="rounded-md border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Clock3 className="h-4 w-4 text-accent" /> 0{index + 8}:4{index}
                  </div>
                  <p className="text-sm leading-6">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.scat}</p>
            <h2 className="mb-5 text-2xl font-black">{t.revenue}</h2>
            <div className="space-y-4">
              {finance.map((row) => (
                <div key={row.city} className="rounded-md border border-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <strong>{row.city} · {row.company}</strong>
                    <span className="text-xl font-black">₪{row.pending.toLocaleString()}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-warning" style={{ width: `${(row.pending / (row.pending + row.paid)) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Pending vs received ledger balance</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-lg p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary">Company Assets</p>
                <h2 className="text-2xl font-black">{t.assets}</h2>
              </div>
              <Car className="h-8 w-8 text-accent" />
            </div>
            <div className="grid gap-3">
              {assets.map((asset) => (
                <div key={asset.plate} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-surface p-4">
                  <div>
                    <strong>{asset.name}</strong>
                    <p className="text-sm text-muted-foreground">{asset.plate} · {asset.mileage.toLocaleString()} km</p>
                  </div>
                  <span className={`rounded-sm px-2 py-1 text-xs font-black ${asset.status === "service_due" ? "bg-warning/20 text-warning" : "bg-success/20 text-success"}`}>
                    {asset.service}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="glass-panel rounded-lg p-5">
            <p className="text-sm font-bold text-primary">{t.profile}</p>
            <h2 className="mt-1 text-3xl font-black">{selected.name[language]}</h2>
            <div className="mt-5 grid gap-3 text-sm">
              <Info icon={UsersRound} label="City" value={selected.city} />
              <Info icon={Building2} label="Stage" value={selected.stage} />
              <Info icon={Languages} label="Native" value={selected.language.toUpperCase()} />
              <Info icon={LineChart} label="Next" value={selected.nextTest} />
            </div>
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
              <Button variant="command" onClick={() => runAi("candidate_next_step")} disabled={isLoading}>
                <Bot className="h-4 w-4" /> {t.askAi}
              </Button>
              <Button variant="intel" onClick={() => runAi("translate_to_hebrew")} disabled={isLoading}>
                <Languages className="h-4 w-4" /> {t.translate}
              </Button>
              <Button variant="tactical" onClick={() => runAi("status_template")} disabled={isLoading}>
                <MessageSquareText className="h-4 w-4" /> {t.template}
              </Button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
