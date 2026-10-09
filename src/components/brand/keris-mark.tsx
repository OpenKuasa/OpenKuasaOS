/**
 * The OpenKuasa mark: a keris with a wavy blade, drawn on the diagonal.
 * Three paths in a 24 × 24 box: blade, guard, hilt.
 */
export const KERIS_BLADE =
  'M11.95 0.30 L11.89 1.02 L11.85 1.74 L11.75 2.46 L11.56 3.18 L11.29 3.90 L11.03 4.62 L10.85 5.35 L10.79 6.07 L10.86 6.79 L11.01 7.51 L11.15 8.23 L11.16 8.95 L11.01 9.67 L10.72 10.39 L10.36 11.11 L10.06 11.83 L9.92 12.55 L9.99 13.28 L10.22 14.00 L10.50 14.72 L10.67 15.44 L10.63 16.16 L10.36 16.88 L9.92 17.60 L14.02 17.60 L14.33 16.88 L14.48 16.16 L14.39 15.44 L14.09 14.72 L13.68 14.00 L13.31 13.28 L13.11 12.55 L13.11 11.83 L13.27 11.11 L13.49 10.39 L13.64 9.67 L13.64 8.95 L13.47 8.23 L13.19 7.51 L12.88 6.79 L12.64 6.07 L12.53 5.35 L12.55 4.62 L12.63 3.90 L12.70 3.18 L12.69 2.46 L12.58 1.74 L12.36 1.02 L12.05 0.30Z';
export const KERIS_GUARD =
  'M7.02 18.15C8.12 18.50 9.02 18.20 9.82 17.60H14.12L15.32 19.10H9.42C8.42 19.20 7.52 18.85 7.02 18.15Z';
export const KERIS_HILT =
  'M10.87 19.60H13.07C13.07 20.50 13.47 20.90 14.17 21.30C14.97 21.70 14.87 22.90 13.87 23.20C12.77 23.50 11.67 23.00 11.27 22.10C10.97 21.30 10.87 20.50 10.87 19.60Z';

export function KerisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <g transform="rotate(38 12 12)">
        <path d={KERIS_BLADE} />
        <path d={KERIS_GUARD} />
        <path d={KERIS_HILT} />
      </g>
    </svg>
  );
}
