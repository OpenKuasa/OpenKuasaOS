/** Locales whose country names are understood: English and Malay. */
const NAME_LOCALES = ['en', 'ms'];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The code no region will ever have; `Intl` names it "Unknown Region". */
const UNKNOWN_REGION = 'ZZ';

/** Codes `Intl` names that are test locales, not places. */
const PSEUDO_REGIONS = new Set(['XA', 'XB']);

/**
 * Names people really type that `Intl` does not give (or gives differently,
 * depending on its data version): short forms, older names and local
 * abbreviations.
 */
const ALIASES: Record<string, string> = {
  USA: 'US',
  US: 'US',
  'United States of America': 'US',
  America: 'US',
  UK: 'GB',
  'Great Britain': 'GB',
  Britain: 'GB',
  England: 'GB',
  UAE: 'AE',
  'South Korea': 'KR',
  Korea: 'KR',
  'North Korea': 'KP',
  Russia: 'RU',
  Vietnam: 'VN',
  'Viet Nam': 'VN',
  Brunei: 'BN',
  Laos: 'LA',
  Burma: 'MM',
  Holland: 'NL',
  Palestine: 'PS',
  Swaziland: 'SZ',
  'Czech Republic': 'CZ',
  Turkey: 'TR',
  'Hong Kong': 'HK',
  Macau: 'MO',
  Macao: 'MO',
  Taiwan: 'TW',
  'Ivory Coast': 'CI',
  "M'sia": 'MY',
  Msia: 'MY',
  "S'pore": 'SG',
  Spore: 'SG',
};

/**
 * The form names are compared in: lower case, no diacritics, `&` as `and`,
 * no dots, commas, apostrophes or brackets, hyphens as spaces, single spaces,
 * and no leading "the".
 */
function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'’‘`()]/g, '')
    .replace(/[-‐-―]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/**
 * The spellings one `Intl` name is found under: the name itself, plus the
 * shorter forms people type for names that carry a qualifier
 * ("Myanmar (Burma)", "Hong Kong SAR China", "St. Lucia").
 */
function nameVariants(name: string) {
  const variants = [name];
  const bracket = name.match(/^(.*?)\s*\((.+)\)(.*)$/);
  if (bracket) variants.push(`${bracket[1]}${bracket[3]}`, bracket[2]);
  if (name.includes(' SAR ')) variants.push(name.slice(0, name.indexOf(' SAR ')));
  if (/^St\.? /.test(name)) variants.push(name.replace(/^St\.? /, 'Saint '));
  return variants;
}

/**
 * The code in use today for a code that has been replaced (BU -> MM,
 * UK -> GB), so a name two codes share resolves to the current country.
 */
function currentCode(code: string) {
  try {
    return new Intl.Locale(`und-${code}`).region ?? code;
  } catch {
    return code;
  }
}

type CountryTable = {
  /** Every code the platform names -> the code to store for it. */
  codes: Map<string, string>;
  /** Normalised name -> code. */
  names: Map<string, string>;
};

/**
 * Asks the platform for the name of every two-letter code, in each locale.
 * A runtime without `Intl.DisplayNames`, or without the data for a locale,
 * contributes nothing for it: the table is then smaller, never an error.
 */
function buildTable(): CountryTable {
  const codes = new Map<string, string>();
  const names = new Map<string, string>();

  for (const locale of NAME_LOCALES) {
    try {
      if (Intl.DisplayNames.supportedLocalesOf([locale]).length === 0) continue;

      const display = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' });
      // What this locale calls a code that is not a region ("Unknown Region").
      const filler = display.of(UNKNOWN_REGION);

      for (const first of LETTERS) {
        for (const second of LETTERS) {
          const code = first + second;
          if (code === UNKNOWN_REGION || PSEUDO_REGIONS.has(code)) continue;

          const name = display.of(code);
          // Unassigned codes come back undefined (or as the code itself on
          // runtimes that ignore `fallback`).
          if (!name || name === code || name === filler) continue;

          const current = currentCode(code);
          codes.set(code, current);
          for (const variant of nameVariants(name)) {
            const key = normalizeName(variant);
            // The first code to claim a name keeps it.
            if (key && !names.has(key)) names.set(key, current);
          }
        }
      }
    } catch {
      // No names from this locale.
    }
  }

  // Aliases go in last so they win over anything `Intl` returned.
  for (const [alias, code] of Object.entries(ALIASES)) names.set(normalizeName(alias), code);

  return { codes, names };
}

const TABLE = buildTable();

/**
 * The two-letter code for what a person typed in a country column: a code
 * ("my", "MY"), an English or Malay country name ("Malaysia", "Singapura"),
 * or a common short form ("USA", "UK", "UAE"). Null when it is not recognised.
 */
export function countryCode(value: string): string | null {
  const text = String(value ?? '').trim();
  if (text === '') return null;

  const alias = TABLE.names.get(normalizeName(text));

  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = text.toUpperCase();
    const known = TABLE.codes.get(code);
    if (known) return known;
    if (alias) return alias;
    // Without the platform's list there is nothing to check a code against,
    // so any two letters are taken as one.
    return TABLE.codes.size === 0 ? code : null;
  }

  return alias ?? null;
}
