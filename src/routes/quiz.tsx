import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page, meta } from "@/components/Brand";

export const Route = createFileRoute("/quiz")({
  head: () =>
    meta(
      "اختبر نفسك في دقيقة | عُهدة",
      "10 أسئلة بسيطة: لو غبت فجأة، أهلك يعرفوا يبدأوا منين؟",
      "/quiz",
    ),
  component: Quiz,
});

const Q = [
  ["هل أهلك يعرفوا اسم الشركة اللي شغال فيها ورقم تليفونها؟", "اسم جهة العمل ورقمها"],
  ["يعرفوا رقم إقامتك أو آخر أرقامه؟", "رقم الإقامة"],
  ["يعرفوا البنوك اللي عندك فيها حسابات في السعودية ومصر؟", "البنوك اللي عندك فيها حسابات"],
  ["يعرفوا لو عندك تأمين على الحياة أو تأمين طبي؟", "التأمين"],
  ["يعرفوا مين مديون لك بفلوس؟", "الفلوس اللي ليك عند ناس"],
  ["يعرفوا انت مديون لمين؟", "الفلوس اللي عليك"],
  ["يعرفوا عقد الإيجار أو الشقة أو العربية أوراقها فين؟", "مكان أوراق الإيجار والشقة والعربية"],
  ["يعرفوا مين يكلموا الأول لو حصل لك حاجة؟", "مين يكلموا الأول"],
  ["عندهم نسخة من أهم أوراقك أو يعرفوا مكانها؟", "نسخ أهم الأوراق"],
  ["اتكلمت معاهم قبل كده عن الموضوع ده؟", "الكلام مع أهلك في الموضوع"],
];
const INVITE =
  "جرّب الاختبار ده: لو غبت فجأة، أهلك يعرفوا يبدأوا منين؟ https://ohda.codeandcanvas.net/quiz";

function Quiz() {
  const [answers, setAnswers] = useState<boolean[]>([]);
  const i = answers.length;
  const done = i >= Q.length;
  const score = answers.filter(Boolean).length;
  const gaps = Q.filter((_, k) => answers[k] === false).map((q) => q[1]);
  const msg =
    score >= 8
      ? "ما شاء الله، أهلك عارفين كتير. اكتبه في ملف عشان ما يتنسيش."
      : score >= 4
        ? "في حاجات مهمة لسه مش واضحة لأهلك. ده طبيعي جدًا، وسهل يتصلّح."
        : "زي أغلب الناس — أهلك هيتعبوا يبدأوا. الخبر الحلو إن 10 دقايق كفاية تفرق كتير.";

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: INVITE });
        return;
      } catch {
        /* cancelled */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(INVITE)}`, "_blank", "noopener");
  }

  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">لو غبت فجأة… أهلك يعرفوا يبدأوا منين؟</h1>
      {!done ? (
        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(i / Q.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            سؤال {i + 1} من {Q.length}
          </p>
          <div className="panel mt-4">
            <p className="text-xl font-semibold">{Q[i]?.[0]}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="btn-primary" onClick={() => setAnswers([...answers, true])}>
                أيوه
              </button>
              <button className="btn-outline" onClick={() => setAnswers([...answers, false])}>
                لأ
              </button>
            </div>
          </div>
          {i > 0 && (
            <button
              className="btn-ghost btn-sm mt-3"
              onClick={() => setAnswers(answers.slice(0, -1))}
            >
              رجوع
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="panel text-center">
            <p className="text-5xl font-bold text-primary">
              {score}
              <span className="text-2xl text-muted-foreground"> / 10</span>
            </p>
            <p className="mt-3 text-lg">{msg}</p>
          </div>
          {gaps.length > 0 && (
            <div className="panel">
              <h2 className="font-bold">حاجات أهلك ممكن ما يعرفوهاش</h2>
              <ul className="mt-2 list-disc space-y-1 pr-5">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Link to="/start" className="btn-primary">
              ابدأ ملفك مجانًا
            </Link>
            <button className="btn-outline" onClick={share}>
              ابعت الاختبار لحد تاني
            </button>
            <button className="btn-ghost" onClick={() => setAnswers([])}>
              عيد الاختبار
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            إجاباتك ما بتتحفظش في أي مكان. المشاركة بتبعت دعوة للاختبار بس، مش نتيجتك.
          </p>
        </div>
      )}
    </Page>
  );
}
