import { createFileRoute } from "@tanstack/react-router";
import { Page, meta } from "@/components/Brand";

export const Route = createFileRoute("/security")({
  head: () =>
    meta(
      "إزاي بنحمي ملفك | عُهدة",
      "شرح بسيط لتشفير عُهدة: AES-256-GCM على جهازك، ومفيش بيانات على سيرفراتنا.",
      "/security",
    ),
  component: Security,
});

const items = [
  ["التشفير", "ملفك بيتشفّر بـ AES-256-GCM، بمفتاح 256-bit عشوائي بيتعمل على جهازك."],
  [
    "كلمة السر",
    "المفتاح بيتقفل بكلمة السر عن طريق PBKDF2-SHA256 بـ 600,000 تكرار، فتخمينها بطيء جدًا ومكلّف.",
  ],
  ["كود الأهل", "كود الأهل سر عشوائي 128-bit، منفصل تمامًا عن كلمة السر بتاعتك."],
  [
    "تقسيم الكود",
    "لو قسّمت الكود على شخصين، بنستخدم XOR بحيث نص واحد لوحده ما يكشفش أي حاجة عن الملف.",
  ],
  [
    "مفيش بيانات عندنا",
    "مفيش أي محتوى من ملفك على سيرفراتنا. الحاجة الوحيدة عندنا هي بصمات (hash) أكواد التفعيل وعدد مرات استخدامها.",
  ],
  ["من غير الموقع", "ملف الأهل ملف HTML مستقل بيفتح في المتصفح بالكود، حتى لو الموقع وقف."],
];

function Security() {
  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">إزاي بنحمي ملفك</h1>
      <div className="mt-5 space-y-3">
        {items.map(([t, d]) => (
          <div key={t} className="panel">
            <h2 className="font-bold text-primary">{t}</h2>
            <p className="mt-1">{d}</p>
          </div>
        ))}
      </div>
      <section className="panel mt-5 border-gold">
        <h2 className="font-bold">حدود لازم تعرفها بصراحة</h2>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>لو جهازك نفسه مخترق (برنامج تجسس)، التشفير مش هيحميك.</li>
          <li>كلمة سر ضعيفة بتضعّف الحماية — اختار جملة طويلة.</li>
          <li>لو ضاع الكود وكلمة السر، مفيش أي طريقة للاسترجاع.</li>
          <li>
            لما تعمل كروت جديدة، ملف الأهل القديم بيفضل يفتح بالكروت القديمة — اطلب من أهلك يمسحوه
            هو والكروت القديمة.
          </li>
          <li>
            التفعيل متخزّن على متصفحك. أي برنامج يتحكم في جهازك يقدر يتلاعب بالموقع على الجهاز ده.
          </li>
        </ul>
      </section>
      <section className="panel mt-5">
        <h2 className="font-bold">لقيت ثغرة؟</h2>
        <p className="mt-1">
          ابعتلنا على{" "}
          <a className="font-semibold text-primary underline" href="mailto:admin@codeandcanvas.net">
            admin@codeandcanvas.net
          </a>{" "}
          وما تنشرهاش قبل ما نصلحها. بنرد في خلال 72 ساعة.
        </p>
      </section>
      <p className="mt-5 text-muted-foreground">
        كود التشفير وصيغة الملف موثّقين، وهننشرهم للمراجعة العامة قريبًا.
      </p>
    </Page>
  );
}
