/**
 * The + button and its sheet: pick a type, type one thing, done. Details are filled in later from
 * the section itself. Presentation only: the caller applies the change through the vault.
 */
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { QUICK_TYPES, SECTION_HINT, type QuickType } from "@/lib/home";
import { MAX_ROWS, type Plan } from "@/lib/plan";
import type { SectionKey } from "@/lib/review";

const TYPE_ICON: Record<QuickType["list"], IconName> = {
  contacts: "person",
  banks: "bank",
  insurance: "shield",
  owedToMe: "moneyIn",
  iOwe: "moneyOut",
  assets: "box",
  accounts: "globe",
};

export function QuickAdd({
  plan,
  onAdd,
  onOpenSection,
}: {
  plan: Plan;
  onAdd: (t: QuickType, value: string) => void;
  /** for the entries that are free text, not a list row */
  onOpenSection: (k: SectionKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QuickType | null>(null);
  const [value, setValue] = useState("");
  const fab = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    fab.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    setType(null);
    setValue("");
    const t = setTimeout(() => sheet.current?.querySelector<HTMLElement>("button")?.focus(), 80);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (type) input.current?.focus();
  }, [type]);

  const full = type ? plan[type.list].length >= MAX_ROWS : false;

  return (
    <>
      <button
        ref={fab}
        type="button"
        aria-expanded={open}
        aria-controls="quick-add"
        aria-label={open ? "اقفل" : "ضيف حاجة جديدة"}
        onClick={() => (open ? close() : setOpen(true))}
        className={`absolute end-0 bottom-0 grid size-[4.25rem] place-items-center rounded-full border-[5px] border-background shadow-float transition-[background-color,transform] duration-300 ease-spring active:scale-95 ${open ? "bg-gold text-accent-foreground" : "z-[60] bg-ink text-ink-foreground"}`}
      >
        <Icon
          name="plus"
          className={`size-7 transition-transform duration-300 ease-spring ${open ? "rotate-[135deg]" : ""}`}
        />
      </button>

      <div
        id="quick-add"
        className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
        inert={!open}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="اقفل"
          onClick={close}
          className={`absolute inset-0 bg-ink/45 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          ref={sheet}
          role="dialog"
          aria-modal="true"
          aria-label="ضيف حاجة جديدة"
          className={`no-scrollbar absolute inset-x-0 bottom-0 mx-auto max-h-[86dvh] max-w-md overflow-y-auto rounded-t-[32px] bg-background px-4 pt-3 pb-8 transition-transform duration-500 ease-spring ${open ? "translate-y-0" : "translate-y-[105%]"}`}
        >
          <div className="mb-2 grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
            <span />
            <span className="mx-auto block h-1.5 w-11 rounded-full bg-border" />
            <button type="button" className="btn-icon" aria-label="اقفل" onClick={close}>
              <Icon name="plus" className="size-5 rotate-45" />
            </button>
          </div>
          {!type ? (
            <>
              <h2 className="text-xl font-bold">ضيف إيه؟</h2>
              <p className="text-sm text-muted-foreground">
                خانة واحدة دلوقتي، والتفاصيل تكمّلها بعدين.
              </p>
              <ul className="mt-3 grid gap-2">
                {QUICK_TYPES.map((t, i) => (
                  <li
                    key={t.list}
                    className={open ? "anim-rise" : ""}
                    style={{ animationDelay: `${i * 45 + 120}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setType(t)}
                      className="grid w-full grid-cols-[2.75rem_1fr_auto] items-center gap-3 rounded-[22px] bg-card px-3 py-2.5 text-start transition-transform active:scale-[0.98]"
                    >
                      <span className="grid size-11 place-items-center rounded-full bg-secondary text-primary">
                        <Icon name={TYPE_ICON[t.list]} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{t.title}</span>
                        <span className="block text-[0.8125rem] leading-5 text-muted-foreground">
                          {SECTION_HINT[t.list]}
                        </span>
                      </span>
                      <span className="num text-2xl text-muted-foreground">
                        {plan[t.list].length || ""}
                      </span>
                    </button>
                  </li>
                ))}
                <li
                  className={open ? "anim-rise" : ""}
                  style={{ animationDelay: `${QUICK_TYPES.length * 45 + 120}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenSection("letter");
                    }}
                    className="grid w-full grid-cols-[2.75rem_1fr] items-center gap-3 rounded-[22px] bg-gold-soft px-3 py-2.5 text-start transition-transform active:scale-[0.98]"
                  >
                    <span className="grid size-11 place-items-center rounded-full bg-card text-gold-ink">
                      <Icon name="heart" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">رسالة لأهلك</span>
                      <span className="block text-[0.8125rem] leading-5 text-muted-foreground">
                        {SECTION_HINT.letter}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!value.trim() || full) return input.current?.focus();
                onAdd(type, value);
                setOpen(false);
              }}
            >
              <h2 className="text-xl font-bold">{type.title}</h2>
              <label className="block">
                <span className="field-label">الاسم</span>
                <input
                  ref={input}
                  className="field"
                  value={value}
                  maxLength={500}
                  autoComplete="off"
                  placeholder={type.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span className="field-hint">{SECTION_HINT[type.list]}</span>
              </label>
              {full && (
                <p className="err-text" role="alert">
                  القسم ده وصل للحد الأقصى.
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-outline" onClick={() => setType(null)}>
                  رجوع
                </button>
                <button className="btn-primary flex-1" disabled={!value.trim() || full}>
                  ضيف
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
