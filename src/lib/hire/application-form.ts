// src/lib/hire/application-form.ts
/**
 * The four switches that decide what the public apply form asks for. Nothing
 * is imported here, so the Settings card (a client component), the approval
 * card and the capability can all use the same names and the same words.
 * A CV and a cover letter are required when on; a portfolio link and expected
 * salary are asked for, and optional, when on.
 */

export const APPLICATION_FORM_KEYS = [
  'require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary',
] as const;
export type ApplicationFormKey = (typeof APPLICATION_FORM_KEYS)[number];
export type ApplicationFormValues = Record<ApplicationFormKey, boolean>;

export const APPLICATION_FORM_FIELDS: Record<ApplicationFormKey, {
  /** Beside the switch. */
  label: string;
  /** Under the label: what applicants will see when it is on. */
  help: string;
  /** What switching it on does, for an approval card. */
  on: string;
  /** What switching it off does. */
  off: string;
}> = {
  require_cv: {
    label: 'Require a CV',
    help: 'Applicants must add a CV link or file.',
    on: 'Require a CV',
    off: 'Stop requiring a CV',
  },
  require_cover_letter: {
    label: 'Require a cover letter',
    help: 'Applicants must write a short cover letter.',
    on: 'Require a cover letter',
    off: 'Stop requiring a cover letter',
  },
  ask_portfolio: {
    label: 'Ask for a portfolio link',
    help: 'Applicants can add a link to their work. Optional for them.',
    on: 'Ask for a portfolio link',
    off: 'Stop asking for a portfolio link',
  },
  ask_expected_salary: {
    label: 'Ask for expected salary (RM)',
    help: 'Applicants can say the monthly salary they expect. Optional for them.',
    on: 'Ask for expected salary',
    off: 'Stop asking for expected salary',
  },
};

/** The four switches out of a settings object. */
export function applicationFormOf(settings: ApplicationFormValues): ApplicationFormValues {
  return {
    require_cv: settings.require_cv,
    require_cover_letter: settings.require_cover_letter,
    ask_portfolio: settings.ask_portfolio,
    ask_expected_salary: settings.ask_expected_salary,
  };
}

/** Only the switches whose value differs from what is saved: what a Save sends. */
export function changedSwitches(saved: ApplicationFormValues, current: ApplicationFormValues): Partial<ApplicationFormValues> {
  const changed: Partial<ApplicationFormValues> = {};
  for (const key of APPLICATION_FORM_KEYS) if (current[key] !== saved[key]) changed[key] = current[key];
  return changed;
}

/** A change in words, one phrase per switch sent, in the fixed order. Anything that is not a switch set to true or false is left out. */
export function describeFormChange(input: unknown): string[] {
  const sent = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return APPLICATION_FORM_KEYS.flatMap((key) =>
    sent[key] === true ? [APPLICATION_FORM_FIELDS[key].on] : sent[key] === false ? [APPLICATION_FORM_FIELDS[key].off] : [],
  );
}
