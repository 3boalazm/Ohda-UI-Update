import { createFileRoute } from "@tanstack/react-router";
import { Page, meta } from "@/components/Brand";

export const Route = createFileRoute("/privacy")({
  head: () =>
    meta("سياسة الخصوصية | عُهدة", "عُهدة ما بتخزّنش محتوى ملفك ولا حسابات مستخدمين.", "/privacy"),
  component: Privacy,
});

function Privacy() {
  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">سياسة الخصوصية</h1>
      <div className="panel mt-5 space-y-3">
        <p>
          عُهدة ما بتخزّنش أي محتوى من ملفك، ومفيش حسابات للمستخدمين. ملفك بيتشفّر ويتحفظ على جهازك
          بس.
        </p>
        <h2 className="pt-2 text-lg font-bold">مين المسؤول عن البيانات</h2>
        <p>
          عُهدة منتج من Code &amp; Canvas، شركة مسجّلة في مصر. هي الجهة المسؤولة عن الخدمة ودفعاتها،
          للعملاء في مصر وبرّه مصر (ومنهم السعودية). لينا وكيل في السعودية للتمثيل بس، وما بيوصلش
          لأي بيانات.
        </p>
        <h2 className="pt-2 text-lg font-bold">إيه اللي على السيرفر</h2>
        <ul className="list-disc space-y-1 pr-5">
          <li>
            بصمات (hash) أكواد التفعيل وعدد مرات استخدامها، ومرجع عشوائي لكل كود — من غير اسم أو
            رقم.
          </li>
          <li>
            عدّاد محاولات التفعيل: بصمة لعنوان الـ IP متغيّرة كل يوم (مش العنوان نفسه)، وبتتمسح بعد
            يومين.
          </li>
          <li>سجل عمليات الإدارة (إنشاء/إلغاء كود) من غير بيانات عملاء.</li>
        </ul>
        <p>
          محتوى ملفك عمره ما بيتبعت لأي سيرفر، فمفيش نقل لبياناتك الشخصية لبرّه بلدك بسبب الملف.
          السيرفرات اللي بتشغّل الموقع وقاعدة الأكواد عند مزوّدين سحابيين (Cloudflare وSupabase)
          وممكن تكون برّه مصر والسعودية؛ اللي بيعدّي عليها هو كود التفعيل وبيانات الاتصال التقنية
          بس.
        </p>
        <p>مفيش أدوات تحليلات ولا سكريبتات من طرف تالت في الموقع.</p>
        <p>
          محادثات الدفع بتحصل على واتساب أو عن طريق البنك، وبنحتفظ بيها بس قد ما نحتاجها للمحاسبة.
        </p>
        <p>
          لأي سؤال:{" "}
          <a className="font-semibold text-primary underline" href="mailto:admin@codeandcanvas.net">
            admin@codeandcanvas.net
          </a>
        </p>
      </div>
    </Page>
  );
}
