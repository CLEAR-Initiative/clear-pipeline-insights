"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { VERDICTS, type Verdict } from "@/db/schema";
import { saveRating } from "./actions";

type Props = {
  callId: string;
  createdAt: string;
  env: string;
  promptVersion: string;
  model: string;
  signalId: string | null;
  eventId: string | null;
  parsedResponse: unknown;
  parseError: string | null;
  userPrompt: string;
  rawResponse: string;
  initialVerdict: Verdict | null;
  initialConfidence: number | null;
  initialNotes: string | null;
};

const VERDICT_LABELS: Record<Verdict, string> = {
  correct: "1 · correct",
  wrong_group: "2 · wrong group",
  should_be_new: "3 · should be new",
  should_have_merged: "4 · should have merged",
  unclear: "5 · unclear",
};

const VERDICT_HOTKEY: Record<string, Verdict> = {
  "1": "correct",
  "2": "wrong_group",
  "3": "should_be_new",
  "4": "should_have_merged",
  "5": "unclear",
};

type ParsedShape = {
  action?: unknown;
  event_id?: unknown;
  title?: unknown;
  description?: unknown;
  types?: unknown;
  population_affected?: unknown;
};

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86_400)}d ago`;
}

export function ReviewRow(props: Props) {
  const [verdict, setVerdict] = useState<Verdict | null>(props.initialVerdict);
  const [notes, setNotes] = useState(props.initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    props.initialVerdict ? "saved" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rowRef = useRef<HTMLDivElement>(null);

  const commit = (v: Verdict, notesToSave: string) => {
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      const result = await saveRating({
        callId: props.callId,
        verdict: v,
        notes: notesToSave,
      });
      if (result.ok) {
        setStatus("saved");
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  };

  const pickVerdict = (v: Verdict) => {
    setVerdict(v);
    commit(v, notes);
  };

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement)) return;
      if (document.activeElement?.tagName === "TEXTAREA") return;
      const v = VERDICT_HOTKEY[e.key];
      if (v) {
        e.preventDefault();
        pickVerdict(v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, props.callId]);

  const parsed = (props.parsedResponse ?? {}) as ParsedShape;
  const action = typeof parsed.action === "string" ? parsed.action : null;
  const title = typeof parsed.title === "string" ? parsed.title : null;
  const description =
    typeof parsed.description === "string" ? parsed.description : null;
  const targetEventId =
    typeof parsed.event_id === "string" ? parsed.event_id : null;

  return (
    <div
      ref={rowRef}
      tabIndex={0}
      className="rounded-lg border border-neutral-200 bg-white p-4 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:focus:ring-neutral-100"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-900">
          {props.env}
        </span>
        <span className="font-mono">{props.promptVersion}</span>
        <span className="font-mono">{props.model}</span>
        {props.signalId && (
          <span className="font-mono">signal: {props.signalId.slice(0, 12)}</span>
        )}
        {props.eventId && (
          <span className="font-mono">event: {props.eventId.slice(0, 12)}</span>
        )}
        <span className="ml-auto">{relTime(props.createdAt)}</span>
      </div>

      {props.parseError && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          parse_error: {props.parseError}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Signal (user prompt, truncated)
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-800 dark:text-neutral-200">
            {props.userPrompt.slice(0, 800)}
            {props.userPrompt.length > 800 ? "…" : ""}
          </pre>
        </div>
        <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Claude decision
          </div>
          {action ? (
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-mono text-xs text-neutral-500">action:</span>{" "}
                <span
                  className={`font-mono text-xs ${
                    action === "create_new"
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-green-700 dark:text-green-300"
                  }`}
                >
                  {action}
                </span>
              </div>
              {targetEventId && (
                <div className="font-mono text-xs text-neutral-500">
                  event_id: {targetEventId}
                </div>
              )}
              {title && (
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  {title}
                </div>
              )}
              {description && (
                <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {description}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-neutral-500">no parsed response</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => pickVerdict(v)}
            className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
              verdict === v
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
            }`}
          >
            {VERDICT_LABELS[v]}
          </button>
        ))}
        <div className="ml-auto self-center text-xs text-neutral-500">
          {status === "saving" || isPending ? "saving…" : null}
          {status === "saved" && verdict ? "✓ saved" : null}
          {status === "error" && (
            <span className="text-red-600">error: {error}</span>
          )}
        </div>
      </div>

      <textarea
        className="mt-2 w-full rounded border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-800"
        rows={2}
        placeholder="notes (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (verdict) commit(verdict, notes);
        }}
      />

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          show full prompt + raw response
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 p-2 text-xs text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
            {props.userPrompt}
          </pre>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 p-2 text-xs text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
            {props.rawResponse}
          </pre>
        </div>
      </details>
    </div>
  );
}
