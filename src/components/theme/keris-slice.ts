import {
  KERIS_BLADE,
  KERIS_GUARD,
  KERIS_HILT,
} from '@/components/brand/keris-mark';

/** Time the keris takes to cross the screen, corner to corner. */
const CROSSING_MS = 1100;
/** How fast the cut opens behind the blade: half-width per px travelled. */
const SPREAD = 0.5;
const EASING = 'cubic-bezier(0.35, 0, 0.75, 1)';
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
 * bottom left. The new theme opens as a wake behind the blade: closed at the
 * tip and wider the further back you look, in one continuous motion that
 * carries on until the wake has swept the last two corners.
 * Falls back to an instant switch when the browser has no View Transitions or
 * the visitor prefers reduced motion.
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
  // Unit direction of travel (top right → bottom left) and its normal.
  const dx = -w / len;
  const dy = h / len;
  const nx = h / len;
  const ny = w / len;

  // Distances are measured along the diagonal from the top-right corner.
  const start = -0.08 * len;
  // The wake has covered the screen once it reaches the two far corners.
  const cornerAlong = Math.max(w * w, h * h) / len;
  const cornerAcross = (w * h) / len;
  const end = cornerAlong + cornerAcross / SPREAD + 0.05 * len;
  const duration = (CROSSING_MS * (end - start)) / len;

  const p = (x: number, y: number) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  // A wedge with its point at distance `s` and its base far behind the start.
  const wake = (s: number) => {
    const base = -len;
    const half = SPREAD * (s - base);
    const ax = w + dx * s;
    const ay = dy * s;
    const bx = w + dx * base;
    const by = dy * base;
    return `polygon(${p(ax, ay)}, ${p(bx + nx * half, by + ny * half)}, ${p(bx - nx * half, by - ny * half)})`;
  };

  const size = Math.max(160, Math.min(w, h) * 0.36);
  // The keris is drawn tip-up; turn it to point along the cut, tip on the wedge.
  const angle = (Math.atan2(-w, -h) * 180) / Math.PI;
  const tipOffset = size * 0.46;
  const at = (s: number) => {
    const cx = w + dx * (s - tipOffset);
    const cy = dy * (s - tipOffset);
    return `translate(${(cx - size / 2).toFixed(1)}px, ${(cy - size / 2).toFixed(1)}px) rotate(${angle.toFixed(2)}deg)`;
  };

  const keris = createKeris(size);
  root.classList.add('theme-slicing');

  const transition = document.startViewTransition(() => {
    apply();
    document.body.appendChild(keris);
  });

  transition.ready
    .then(() => {
      const timing = { duration, easing: EASING };
      root.animate([{ clipPath: wake(start) }, { clipPath: wake(end) }], {
        ...timing,
        pseudoElement: '::view-transition-new(root)',
      });
      root.animate([{ transform: at(start) }, { transform: at(end) }], {
        ...timing,
        pseudoElement: `::view-transition-group(${NAME})`,
      });
    })
    .catch(() => {
      // The transition was skipped; the theme has still been applied.
    });

  transition.finished.finally(() => {
    keris.remove();
    root.classList.remove('theme-slicing');
  });
}
