"use client";

import { useState, useTransition } from "react";
import { rateEvent } from "./actions";

type Signal = {
  id: string;
  sourceName: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  publishedAt: string;
};

type Props = {
  eventId: string;
  title: string | null;
  description: string | null;
  types: string[];
  rank: number | null;
  validFrom: string;
  validTo: string;
  signalCount: number;
  signals: Signal[];
  initialVerdict: string | null;
  initialNotes: string | null;
};

const SUGGESTED_VERDICTS = [
  "coherent",
  "should_split",
  "should_merge",
  "should_dissolve",
  "unclear",
];

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function EventRow(props: Props) {
  const [verdict, setVerdict] = useState(props.initialVerdict ?? "");
  const [notes, setNotes] = useState(props.initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    props.initialVerdict ? "saved" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = (v: string, n: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      const res = await rateEvent({ eventId: props.eventId, verdict: trimmed, notes: n });
      if (res.ok) setStatus("saved");
      else {
        setStatus("error");
        setError(res.error);
      }
    });
  };

  const pickSuggestion = (s: string) => {
    setVerdict(s);
    save(s, notes);
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
          {props.title ?? <em className="text-neutral-500">untitled</em>}
        </span>
        {props.types.map((t) => (
          <span
            key={t}
            className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            {t}
          </span>
        ))}
        <span className="ml-auto font-mono text-xs text-neutral-500">
          rank {props.rank === null ? "—" : props.rank.toFixed(2)} · {props.signalCount} signals
        </span>
      </div>

      <div className="mt-1 text-xs text-neutral-500">
        {fmtDate(props.validFrom)} → {fmtDate(props.validTo)} · event{" "}
        <span className="font-mono">{props.eventId.slice(0, 10)}</span>
      </div>

      {props.description && (
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          {props.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="self-center text-xs font-medium uppercase tracking-wider text-neutral-500">
          verdict
        </span>
        <input
          type="text"
          list={`verdict-list-${props.eventId}`}
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          onBlur={() => save(verdict, notes)}
          placeholder="type or pick a suggestion…"
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        />
        <datalist id={`verdict-list-${props.eventId}`}>
          {SUGGESTED_VERDICTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {SUGGESTED_VERDICTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pickSuggestion(s)}
            className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
              verdict === s
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-neutral-500">
          {status === "saving" && "saving…"}
          {status === "saved" && verdict.trim() && "✓ saved"}
          {status === "error" && <span className="text-red-600">error: {error}</span>}
        </span>
      </div>

      <textarea
        className="mt-2 w-full rounded border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-800"
        rows={2}
        placeholder="notes (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save(verdict, notes)}
      />

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          show {props.signalCount} member signals
        </summary>
        <ul className="mt-2 space-y-2">
          {props.signals.map((s) => (
            <li
              key={s.id}
              className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {s.title ?? <em className="text-neutral-500">untitled</em>}
                </span>
                {s.sourceName && (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-900">
                    {s.sourceName}
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-neutral-500">
                  {fmtDate(s.publishedAt)}
                </span>
              </div>
              {s.description && (
                <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                  {s.description.length > 400
                    ? `${s.description.slice(0, 400)}…`
                    : s.description}
                </p>
              )}
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block font-mono text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                >
                  source link →
                </a>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
