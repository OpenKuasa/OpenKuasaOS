import {
  KERIS_BLADE,
  KERIS_GUARD,
  KERIS_HILT,
} from '@/components/brand/keris-mark';

const DURATION = 1000;
/** Share of the timeline the keris spends crossing the screen. */
const CUT = 0.42;
const NAME = 'keris-slice';

function createKeris(size: number) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  // Parked off-screen: the transition animates its snapshot, not this element.
  el.style.cssText = `position:fixed;left:-9999px;top:0;width:${size}px;height:${size}px;pointer-events:none;view-transition-name:${NAME};color:var(--brand);filter:drop-shadow(0 0 14px var(--brand))`;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="${KERIS_BLADE}"/><path d="${KERIS_GUARD}"/><path d="${KERIS_HILT}"/></svg>`;
  return el;
}

/**
 * Switches theme with a keris cutting the screen from the top right to the
 * bottom left: the new theme first shows as a thin cut along the diagonal,
 * then opens out from it. Falls back to an instant switch when the browser
 * has no View Transitions or the visitor prefers reduced motion.
 */
export function sliceTheme(apply: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    apply();
    return;
  }

  const root = document.documentElement;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const len = Math.hypot(w, h);
  // Unit normal to the diagonal that runs from the top right to the bottom left.
  const nx = h / len;
  const ny = w / len;

  // A band along the diagonal, from just past the top-right corner to the
  // point `t` of the way to the bottom left, `half` px wide each side.
  const band = (t: number, half: number) => {
    const sx = w + w * 0.2;
    const sy = -h * 0.2;
    const ex = w - w * t;
    const ey = h * t;
    const p = (x: number, y: number) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    return `polygon(${p(sx + nx * half, sy + ny * half)}, ${p(sx - nx * half, sy - ny * half)}, ${p(ex - nx * half, ey - ny * half)}, ${p(ex + nx * half, ey + ny * half)})`;
  };

  const size = Math.max(160, Math.min(w, h) * 0.36);
  // The keris is drawn tip-up; turn it to point along the cut.
  const angle = (Math.atan2(-w, -h) * 180) / Math.PI;
  const at = (t: number) =>
    `translate(${(w - w * t - size / 2).toFixed(1)}px,${(h * t - size / 2).toFixed(1)}px) rotate(${angle.toFixed(2)}deg)`;

  const keris = createKeris(size);
  root.classList.add('theme-slicing');

  const transition = document.startViewTransition(() => {
    apply();
    document.body.appendChild(keris);
  });

  transition.ready
    .then(() => {
      root.animate(
        [
          { clipPath: band(-0.2, 2), easing: 'cubic-bezier(0.5, 0, 0.9, 0.7)' },
          {
            clipPath: band(1.2, 2),
            offset: CUT,
            easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          },
          { clipPath: band(1.2, len) },
        ],
        { duration: DURATION, pseudoElement: '::view-transition-new(root)' },
      );
      root.animate(
        [
          { transform: at(-0.25), easing: 'cubic-bezier(0.5, 0, 0.9, 0.7)' },
          { transform: at(1.3), offset: CUT + 0.04 },
          { transform: at(1.3) },
        ],
        {
          duration: DURATION,
          pseudoElement: `::view-transition-group(${NAME})`,
        },
      );
    })
    .catch(() => {
      // The transition was skipped; the theme has still been applied.
    });

  transition.finished.finally(() => {
    keris.remove();
    root.classList.remove('theme-slicing');
  });
}
