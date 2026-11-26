import type { Plan } from "@/lib/plan";

type Col = [string, string];
function Section({
  title,
  children,
  main,
}: {
  title: string;
  children: React.ReactNode;
  /** the file's own title: the page's h1 */
  main?: boolean;
}) {
  return (
    <section className="panel my-3 break-inside-avoid">
      {main ? (
        <h1 className="mb-2 text-2xl font-bold text-primary">{title}</h1>
      ) : (
        <h2 className="mb-2 text-lg font-bold text-primary">{title}</h2>
      )}
      {children}
    </section>
  );
}
function Table({ rows, cols }: { rows: Record<string, string>[]; cols: Col[] }) {
  const r = (rows || []).filter((x) => cols.some(([k]) => x?.[k]));
  if (!r.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {cols.map(([k, l]) => (
              <th
                key={k}
                className="border-b border-border p-2 text-right text-xs text-muted-foreground"
              >
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.map((x, i) => (
            <tr key={i}>
              {cols.map(([k]) => (
                <td key={k} className="border-b border-border p-2 align-top">
                  <bdi>{x[k]}</bdi>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function KV({ obj, fields }: { obj: Record<string, string>; fields: Col[] }) {
  const f = fields.filter(([k]) => obj?.[k]);
  if (!f.length) return null;
  return (
    <div>
      {f.map(([k, l]) => (
        <div key={k} className="flex gap-2 border-b border-border py-1.5">
          <b className="min-w-36 font-semibold text-muted-foreground">{l}</b>
          <bdi>{obj[k]}</bdi>
        </div>
      ))}
    </div>
  );
}
const S = (t: string, node: React.ReactNode) => (node ? <Section title={t}>{node}</Section> : null);
const Steps = ({ t }: { t: string }) => (
  <div className="whitespace-pre-wrap rounded-2xl bg-gold-soft p-4">{t}</div>
);

export const DISCLAIMER =
  "الملف ده دليل عملي كتبه صاحبه عشان يساعدكم تبدأوا. مش وصية شرعية ولا مستند قانوني، ومش بيدّي حد صلاحية على أي حساب. تأكدوا من أي إجراء من الجهة الرسمية.";

/** `nested`: shown inside a page that already has its own h1 (the owner's preview). */
export function PlanView({ plan: p, nested }: { plan: Plan; nested?: boolean }) {
  const o = p.owner as unknown as Record<string, string>;
  const w = p.work as unknown as Record<string, string>;
  const R = (x: unknown) => x as Record<string, string>[];
  return (
    <div>
      <Section main={!nested} title={`ملف ${p.owner.name || ""}`}>
        <div className="text-sm text-muted-foreground">
          آخر تحديث: {(p.updated || "").slice(0, 10)}
        </div>
        <p className="notice mt-2">{DISCLAIMER}</p>
        <button className="btn-outline btn-sm noprint mt-3" onClick={() => window.print()}>
          اطبع الملف
        </button>
      </Section>
      {p.letter && (
        <Section title="رسالة ليكم">
          <Steps t={p.letter} />
        </Section>
      )}
      {p.firstSteps && (
        <Section title="ابدأوا من هنا">
          <Steps t={p.firstSteps} />
        </Section>
      )}
      {S(
        "مين تكلموا الأول",
        Table({
          rows: R(p.contacts),
          cols: [
            ["name", "الاسم"],
            ["relation", "الصلة"],
            ["phone", "الرقم"],
            ["note", "ليه"],
          ],
        }),
      )}
      {S(
        "بياناته الأساسية",
        KV({
          obj: o,
          fields: [
            ["name", "الاسم"],
            ["phone", "الموبايل"],
            ["city", "المدينة"],
            ["notes", "ملاحظات"],
          ],
        }),
      )}
      {S(
        "الشغل في السعودية",
        KV({
          obj: w,
          fields: [
            ["employer", "جهة العمل"],
            ["employerPhone", "تليفون جهة العمل"],
            ["hrContact", "مسؤول الموارد البشرية"],
            ["jobTitle", "الوظيفة"],
            ["startDate", "بداية العمل"],
            ["iqamaLast4", "آخر 4 أرقام من الإقامة"],
            ["gosi", "التأمينات الاجتماعية (GOSI)"],
            ["contractLocation", "العقد فين"],
            ["notes", "ملاحظات"],
          ],
        }),
      )}
      {S(
        "البنوك",
        Table({
          rows: R(p.banks),
          cols: [
            ["name", "البنك"],
            ["country", "البلد"],
            ["type", "نوع الحساب"],
            ["note", "ملاحظة"],
          ],
        }),
      )}
      {S(
        "التأمين",
        Table({
          rows: R(p.insurance),
          cols: [
            ["company", "الشركة"],
            ["type", "النوع"],
            ["policyRef", "مرجع الوثيقة"],
            ["note", "ملاحظة"],
          ],
        }),
      )}
      {S(
        "فلوس ليه عند ناس",
        Table({
          rows: R(p.owedToMe),
          cols: [
            ["who", "مين"],
            ["amount", "المبلغ"],
            ["currency", "العملة"],
            ["proof", "الإثبات فين"],
          ],
        }),
      )}
      {S(
        "فلوس عليه لناس",
        Table({
          rows: R(p.iOwe),
          cols: [
            ["to", "لمين"],
            ["amount", "المبلغ"],
            ["currency", "العملة"],
            ["how", "إزاي تتدفع"],
          ],
        }),
      )}
      {S(
        "الأملاك والأوراق",
        Table({
          rows: R(p.assets),
          cols: [
            ["item", "الحاجة"],
            ["location", "مكانها"],
            ["holder", "مع مين"],
          ],
        }),
      )}
      {S(
        "حساباته على النت",
        Table({
          rows: R(p.accounts),
          cols: [
            ["name", "الخدمة"],
            ["login", "مسجّل بإيه"],
            ["action", "المطلوب"],
            ["note", "ملاحظة"],
          ],
        }),
      )}
      {p.wishes && (
        <Section title="رغبات (غير ملزمة)">
          <Steps t={p.wishes} />
        </Section>
      )}
      <Section title="جهات ممكن تساعدكم">
        <ul className="list-disc space-y-1 pr-5">
          <li>
            لو كان شغّال في السعودية: جهة العمل المكتوبة فوق، ومكتب التمثيل العمالي المصري التابع
            للسفارة أو القنصلية المصرية في السعودية لمتابعة المستحقات.
          </li>
          <li>
            الحسابات البنكية في السعودية: البنك المركزي السعودي (ساما) عنده خدمة للورثة للاستعلام عن
            حسابات المتوفى.
          </li>
          <li>
            الحسابات البنكية في مصر: البنك المركزي المصري بيتيح للورثة الاستعلام عن حسابات المتوفى
            في كل البنوك.
          </li>
          <li>الإجراءات بتتغير، فاتأكدوا دايمًا من الموقع الرسمي للجهة.</li>
        </ul>
      </Section>
    </div>
  );
}
