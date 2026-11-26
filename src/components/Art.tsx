/**
 * The site's illustrations (soft 3D clay style, generated with Arena AI, compressed to WebP).
 * All are decorative: the page text carries the meaning, so the alt text is empty.
 * Sizes are the files' real pixel sizes so the browser reserves the space before they load.
 */
import hero from "@/assets/art/hero.webp";
import privacy from "@/assets/art/privacy.webp";
import handover from "@/assets/art/handover.webp";
import open from "@/assets/art/open.webp";
import quiz from "@/assets/art/quiz.webp";
import activate from "@/assets/art/activate.webp";

const ART = {
  /** envelope with a gold seal on folders; mirrored so the picture sits on the left of RTL text */
  hero: { src: hero, w: 1280, h: 720 },
  privacy: { src: privacy, w: 1280, h: 720 },
  handover: { src: handover, w: 1280, h: 720 },
  open: { src: open, w: 1280, h: 1280 },
  quiz: { src: quiz, w: 1280, h: 1280 },
  activate: { src: activate, w: 1280, h: 720 },
} as const;
export type ArtName = keyof typeof ART;

export function Art({
  name,
  className = "",
  eager,
}: {
  name: ArtName;
  className?: string;
  /** above the fold: load now and at high priority */
  eager?: boolean;
}) {
  const a = ART[name];
  return (
    <img
      src={a.src}
      width={a.w}
      height={a.h}
      alt=""
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      {...(eager ? { fetchPriority: "high" as const } : {})}
      draggable={false}
      className={`block select-none bg-muted object-cover ${className}`}
    />
  );
}
