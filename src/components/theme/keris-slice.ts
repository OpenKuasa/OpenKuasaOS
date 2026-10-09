/** Time the keris takes to cross the screen, corner to corner. */
const CROSSING_MS = 700;
/** How wide the cut has opened one screen-diagonal behind the blade (× diagonal). */
const SPREAD = 0.95;
/** Above 1 the edges curve: a slit at the blade that flares open further back. */
const FLARE = 1.8;
const EASING = 'cubic-bezier(0.35, 0, 0.75, 1)';
const NAME = 'keris-slice';
const STEPS = 24;
const EDGE_POINTS = 14;

// The keris image: a neutral-toned illustration in first-person perspective,
// hilt at the top right, tip at the bottom left. It is tinted at run time.
const KERIS_SRC = '/theme/keris-pov.webp';
/** Where the blade's tip sits in the image, as fractions of its size. */
const TIP = { x: 0.05, y: 0.948 };
/** Direction the blade points in the image, in degrees clockwise from "up". */
const BLADE_ANGLE = (Math.atan2(-0.55, -0.59) * 180) / Math.PI;

let kerisImage: Promise<HTMLImageElement> | null = null;

function loadKeris() {
  kerisImage ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = KERIS_SRC;
  });
  return kerisImage;
}

/** Fetch the keris ahead of the first switch so it never arrives late. */
export function preloadKeris() {
  loadKeris().catch(() => {
    kerisImage = null;
  });
}

function createKeris(size: number) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  // Parked off-screen: the transition animates its snapshot, not this element.
  // The image is a neutral tone map. Blending it over --primary keeps its light
  // and dark facets but takes the hue of the product you are in.
  const image = `url(${KERIS_SRC}) center/contain no-repeat`;
  el.style.cssText = `position:fixed;left:-9999px;top:0;width:${size}px;height:${size}px;pointer-events:none;view-transition-name:${NAME};background:${image},var(--primary);background-blend-mode:luminosity;-webkit-mask:${image};mask:${image};filter:drop-shadow(0 0 12px color-mix(in oklch, var(--primary) 60%, transparent))`;
  return el;
}

/**
 * Switches theme with a keris cutting the screen from the top right to the
 * bottom left, drawn as if you were holding it. The new theme opens as a wake
 * behind the blade: a slit at the tip that flares wider the further back you
 * look, in one continuous motion that carries on until the wake has swept the
 * last two corners.
 * Falls back to an instant switch when the browser has no View Transitions,
 * the visitor prefers reduced motion, or the keris image has not loaded.
 */
export async function sliceTheme(apply: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    apply();
    return;
  }
  try {
    await loadKeris();
  } catch {
    kerisImage = null;
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

  // Half-width of the cut at distance `d` behind the tip.
  const halfWidth = (d: number) => SPREAD * len * Math.pow(d / len, FLARE);

  // Distances are measured along the diagonal from the top-right corner.
  const start = -0.05 * len;
  // The wake has covered the screen once it reaches the two far corners.
  const cornerAlong = Math.max(w * w, h * h) / len;
  const cornerAcross = (w * h) / len;
  const reach = len * Math.pow(cornerAcross / (SPREAD * len), 1 / FLARE);
  const end = cornerAlong + reach + 0.04 * len;
  const duration = (CROSSING_MS * (end - start)) / len;

  const p = (x: number, y: number) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  // The wake with its point at distance `s`: one curved edge out to the far
  // end, then the other edge back to the point.
  const tail = end - start + len;
  const wake = (s: number) => {
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i <= EDGE_POINTS; i++) {
      // Sample more densely near the tip, where the edge curves most.
      const d = tail * Math.pow(i / EDGE_POINTS, 1.5);
      const half = halfWidth(d);
      const cx = w + dx * (s - d);
      const cy = dy * (s - d);
      left.push(p(cx + nx * half, cy + ny * half));
      right.push(p(cx - nx * half, cy - ny * half));
    }
    return `polygon(${[...left, ...right.reverse()].join(', ')})`;
  };

  // About half the shorter side: present, without covering the screen.
  const size = Math.max(200, Math.min(w, h) * 0.52);
  const travelAngle = (Math.atan2(-w, -h) * 180) / Math.PI;
  const turn = travelAngle - BLADE_ANGLE;
  // Keeps the blade's tip on the point of the wake (rotation pivots on the tip).
  const at = (s: number) => {
    const ax = w + dx * s;
    const ay = dy * s;
    return `translate(${(ax - TIP.x * size).toFixed(1)}px, ${(ay - TIP.y * size).toFixed(1)}px) rotate(${turn.toFixed(2)}deg)`;
  };

  const frames = Array.from({ length: STEPS + 1 }, (_, i) => {
    const s = start + ((end - start) * i) / STEPS;
    return { clipPath: wake(s), transform: at(s) };
  });

  const keris = createKeris(size);
  root.classList.add('theme-slicing');

  const transition = document.startViewTransition(() => {
    apply();
    document.body.appendChild(keris);
  });

  transition.ready
    .then(() => {
      const timing = { duration, easing: EASING };
      root.animate(
        frames.map((f) => ({ clipPath: f.clipPath })),
        { ...timing, pseudoElement: '::view-transition-new(root)' },
      );
      root.animate(
        frames.map((f) => ({ transform: f.transform })),
        { ...timing, pseudoElement: `::view-transition-group(${NAME})` },
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
