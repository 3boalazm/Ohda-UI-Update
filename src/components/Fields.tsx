import { useVault } from "@/lib/vault";
import { Link } from "@tanstack/react-router";
import { MAX_TEXT, sensitiveWarnings } from "@/lib/plan";

const MAX_FIELD = 500;

export function Warn({ text, check }: { text: string; check?: boolean | undefined }) {
  if (!check || !text) return null;
  const w = sensitiveWarnings(text);
  return w.length ? (
    <div className="mt-1 space-y-1">
      {w.map((m) => (
        <p key={m} className="warn" role="alert">
          {m}
        </p>
      ))}
    </div>
  ) : null;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  sensitive,
  dirLtr,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  sensitive?: boolean | undefined;
  dirLtr?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="field"
        value={value}
        placeholder={placeholder}
        dir={dirLtr ? "ltr" : undefined}
        maxLength={MAX_FIELD}
        onChange={(e) => onChange(e.target.value)}
      />
      <Warn text={value} check={sensitive} />
    </label>
  );
}

export function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        className="field"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={MAX_TEXT}
        onChange={(e) => onChange(e.target.value)}
      />
      <Warn text={value} check />
    </label>
  );
}

export function NeedUnlock() {
  const { lockedElsewhere } = useVault();
  return (
    <div className="panel text-center">
      <h1 className="text-xl font-bold">الملف مقفول</h1>
      <p className="mt-2 text-muted-foreground">
        {lockedElsewhere
          ? "اتقفل هنا لأنك فتحته في تاب أو شاشة تانية. اتحفظ كل اللي كتبته."
          : "افتح ملفك بكلمة السر الأول."}
      </p>
      <Link to="/start" className="btn-primary mt-4">
        افتح ملفي
      </Link>
    </div>
  );
}
