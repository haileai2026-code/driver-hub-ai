import { createRouter, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

type ParsedFrame = {
  fn?: string;
  file?: string;
  line?: number;
  column?: number;
  raw: string;
};

function parseStack(stack?: string): ParsedFrame[] {
  if (!stack) return [];
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  const frames: ParsedFrame[] = [];
  for (const raw of lines) {
    // V8: "at fnName (file:line:col)" or "at file:line:col"
    let m = raw.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
    if (m) {
      frames.push({ fn: m[1], file: m[2], line: Number(m[3]), column: Number(m[4]), raw });
      continue;
    }
    m = raw.match(/^at\s+(.+?):(\d+):(\d+)$/);
    if (m) {
      frames.push({ file: m[1], line: Number(m[2]), column: Number(m[3]), raw });
      continue;
    }
    // Firefox/Safari: "fn@file:line:col"
    m = raw.match(/^(.*?)@(.+?):(\d+):(\d+)$/);
    if (m) {
      frames.push({ fn: m[1] || undefined, file: m[2], line: Number(m[3]), column: Number(m[4]), raw });
      continue;
    }
    frames.push({ raw });
  }
  return frames;
}

function shortenFile(file?: string): string {
  if (!file) return "";
  // Strip query/hash and origin prefix
  const noQuery = file.split("?")[0].split("#")[0];
  const idx = noQuery.indexOf("/src/");
  if (idx >= 0) return noQuery.slice(idx + 1);
  const nm = noQuery.indexOf("/node_modules/");
  if (nm >= 0) return noQuery.slice(nm + 1);
  try {
    const u = new URL(noQuery);
    return u.pathname;
  } catch {
    return noQuery;
  }
}

function firstAppFrame(frames: ParsedFrame[]): ParsedFrame | undefined {
  return (
    frames.find((f) => f.file && f.file.includes("/src/") && !f.file.includes("node_modules")) ??
    frames.find((f) => f.file && !f.file.includes("node_modules")) ??
    frames.find((f) => !!f.file)
  );
}

function DefaultErrorComponent({ error, reset, info }: ErrorComponentProps) {
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  const err = error as Error & { cause?: unknown; digest?: string };
  const frames = parseStack(err?.stack);
  const origin = firstAppFrame(frames);
  const componentStack = (info as { componentStack?: string } | undefined)?.componentStack;

  const causeText = (() => {
    if (!err?.cause) return null;
    try {
      if (err.cause instanceof Error) return `${err.cause.name}: ${err.cause.message}\n${err.cause.stack ?? ""}`;
      return typeof err.cause === "string" ? err.cause : JSON.stringify(err.cause, null, 2);
    } catch {
      return String(err.cause);
    }
  })();

  const copyAll = async () => {
    const payload = [
      `${err?.name ?? "Error"}: ${err?.message ?? "Unknown error"}`,
      origin ? `at ${shortenFile(origin.file)}:${origin.line}:${origin.column}` : "",
      "",
      "Stack:",
      err?.stack ?? "(no stack)",
      componentStack ? `\nComponent stack:${componentStack}` : "",
      causeText ? `\nCaused by:\n${causeText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {err?.name || "Error"}: something went wrong
            </h1>
            <p className="mt-2 text-sm text-foreground/90 break-words">
              {err?.message || "An unexpected error occurred."}
            </p>

            {origin && (
              <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground">
                <span className="text-muted-foreground">at </span>
                {origin.fn ? <span className="text-primary">{origin.fn} </span> : null}
                <span>
                  ({shortenFile(origin.file)}:{origin.line}:{origin.column})
                </span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Go home
              </a>
              <button
                onClick={copyAll}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Copy details
              </button>
            </div>

            <details open={isDev} className="mt-6 rounded-md border border-border bg-muted/30">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-foreground">
                Technical details {isDev ? "(dev)" : ""}
              </summary>
              <div className="space-y-4 px-3 pb-3 pt-1 text-left">
                {frames.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stack trace
                    </div>
                    <ol className="max-h-64 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                      {frames.map((f, i) => (
                        <li key={i} className="whitespace-pre-wrap break-all">
                          <span className="text-muted-foreground">{String(i).padStart(2, "0")} </span>
                          {f.fn ? <span className="text-primary">{f.fn}</span> : <span className="italic text-muted-foreground">(anonymous)</span>}
                          {f.file ? (
                            <span>
                              {" "}
                              <span className="text-muted-foreground">at</span> {shortenFile(f.file)}
                              {f.line ? `:${f.line}` : ""}
                              {f.column ? `:${f.column}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground"> {f.raw}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {componentStack && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      React component stack
                    </div>
                    <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                      {componentStack.trim()}
                    </pre>
                  </div>
                )}

                {causeText && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Caused by
                    </div>
                    <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-destructive">
                      {causeText}
                    </pre>
                  </div>
                )}

                {err?.stack && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Raw stack
                    </div>
                    <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {err.stack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
