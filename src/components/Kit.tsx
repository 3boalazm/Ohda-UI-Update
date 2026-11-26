/**
 * Small shared UI pieces for the redesign. Presentation only: no crypto, storage or vault access.
 */
import { useId, useState, type ReactNode } from "react";

/** An Arabic file picker: a real <input type=file> hidden behind a styled, focusable label. */
export function FilePicker({
  label,
  accept,
  onFile,
  hint,
  emptyText = "لسه ما اخترتش ملف",
}: {
  label: string;
  accept: string;
  onFile: (f: File) => void;
  hint?: ReactNode;
  emptyText?: string;
}) {
  const id = useId();
  const [name, setName] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-[1.5px] border-dashed border-input bg-card p-3">
        <label
          htmlFor={id}
          className="btn-outline btn-sm cursor-pointer focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring"
        >
          <input
            id={id}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setName(f.name);
                onFile(f);
              }
              e.target.value = ""; // picking the same file again still triggers a change
            }}
          />
          {label}
        </label>
        <span className="min-w-0 text-sm" aria-live="polite">
          {name ? (
            <bdi dir="ltr" className="font-semibold break-all">
              {name}
            </bdi>
          ) : (
            <span className="text-muted-foreground">{emptyText}</span>
          )}
        </span>
      </div>
      {hint && <p className="field-hint mt-0">{hint}</p>}
    </div>
  );
}

/** Password input with a show/hide toggle. Keeps the caller's id so labels and tests still work. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
  describedBy,
  onFirstFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  describedBy?: string;
  /** called when the field gets focus (safe to call repeatedly): used to preload code lazily */
  onFirstFocus?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="field pe-20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFirstFocus}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="absolute inset-y-1.5 end-1.5 rounded-md bg-secondary px-3 text-sm font-semibold text-primary hover:bg-secondary/70"
        aria-pressed={show}
        aria-controls={id}
        onClick={() => setShow((s) => !s)}
      >
        {show ? "إخفاء" : "إظهار"}
      </button>
    </div>
  );
}

/** 4-segment strength bar; `level` 0 (empty) to 4 (strong). Decorative: the text says it too. */
export function StrengthMeter({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  const color = level <= 1 ? "bg-destructive" : level === 2 ? "bg-gold" : "bg-primary";
  return (
    <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-1 rounded-full ${i <= level ? color : "bg-border"}`} />
      ))}
    </div>
  );
}

/** A long code split into groups; it only ever wraps between groups, never inside one. */
export function CodeText({ code, className = "" }: { code: string; className?: string }) {
  const groups = code.split("-");
  return (
    <bdi dir="ltr" className={`code-text ${className}`}>
      {groups.map((g, i) => (
        <span key={i} className="whitespace-nowrap">
          {g}
          {i < groups.length - 1 ? "-" : ""}
        </span>
      ))}
    </bdi>
  );
}

export type StepState = "done" | "current" | "upcoming";

/** One item of a vertical stepper (the list itself is an <ol>). */
export function StepItem({
  n,
  title,
  state,
  summary,
  last,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  /** one line under the title: what was done, or what unlocks this step */
  summary?: ReactNode;
  last?: boolean;
  children?: ReactNode;
}) {
  const dot =
    state === "done"
      ? "border-primary bg-primary text-primary-foreground"
      : state === "current"
        ? "border-primary bg-card text-primary"
        : "border-border bg-card text-muted-foreground";
  return (
    <li
      className="relative grid grid-cols-[2.25rem_1fr] gap-x-3"
      aria-current={state === "current" ? "step" : undefined}
    >
      {!last && (
        <span
          aria-hidden="true"
          className="absolute top-10 bottom-0 start-[1.0625rem] w-0.5 bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={`relative z-[1] grid size-9 place-items-center rounded-full border-2 text-sm font-bold ${dot}`}
      >
        {state === "done" ? "✓" : n}
      </span>
      <div className={`min-w-0 ${last ? "" : "pb-6"}`}>
        <h2
          className={`pt-1 text-lg font-bold ${state === "upcoming" ? "text-muted-foreground" : ""}`}
        >
          <span className="sr-only">
            {state === "done"
              ? "خطوة مكتملة: "
              : state === "current"
                ? "الخطوة الحالية: "
                : "خطوة جاية: "}
          </span>
          {title}
        </h2>
        {summary && <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}
