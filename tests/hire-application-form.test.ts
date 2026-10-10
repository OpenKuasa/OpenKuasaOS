import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  APPLICATION_FORM_FIELDS, APPLICATION_FORM_KEYS, applicationFormOf, changedSwitches, describeFormChange, takeSaved,
} from '@/lib/hire/application-form';
import { updateApplicationFormInput } from '@/lib/hire/capabilities';
import { DEFAULT_HIRE_SETTINGS, SETTINGS_COLUMNS } from '@/lib/hire/types';

describe('the application form switches', () => {
  it('are the same four everywhere: the wording, the schema, the columns and the defaults', () => {
    expect(APPLICATION_FORM_KEYS).toEqual(['require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary']);
    expect(Object.keys(APPLICATION_FORM_FIELDS).sort()).toEqual([...APPLICATION_FORM_KEYS].sort());
    expect(Object.keys(updateApplicationFormInput.shape).sort()).toEqual([...APPLICATION_FORM_KEYS].sort());
    for (const key of APPLICATION_FORM_KEYS) {
      expect(SETTINGS_COLUMNS.split(','), key).toContain(key);
      expect(DEFAULT_HIRE_SETTINGS[key], key).toBe(false);
    }
  });
  it('has a label and a line of help for each', () => {
    for (const key of APPLICATION_FORM_KEYS) {
      const field = APPLICATION_FORM_FIELDS[key];
      for (const text of [field.label, field.help, field.on, field.off]) expect(text.trim().length, key).toBeGreaterThan(0);
    }
    expect(APPLICATION_FORM_FIELDS.require_cv.help).toBe('Applicants must add a CV link or file.');
  });
  it('reads the four from a settings object and nothing else', () => {
    expect(applicationFormOf({ ...DEFAULT_HIRE_SETTINGS, org_id: 'o', require_cv: true, careers_enabled: true } as never)).toEqual({
      require_cv: true, require_cover_letter: false, ask_portfolio: false, ask_expected_salary: false,
    });
  });
  it('finds only the switches that differ from what is saved', () => {
    const saved = { require_cv: true, require_cover_letter: false, ask_portfolio: false, ask_expected_salary: true };
    expect(changedSwitches(saved, saved)).toEqual({});
    expect(changedSwitches(saved, { ...saved, require_cv: false, ask_portfolio: true })).toEqual({ require_cv: false, ask_portfolio: true });
  });
  it('takes in newer saved values without losing a switch the user has changed and not saved', () => {
    const baseline = { require_cv: false, require_cover_letter: false, ask_portfolio: false, ask_expected_salary: false };
    // The user turned the portfolio switch on and has not saved; meanwhile the assistant required a CV.
    const values = { ...baseline, ask_portfolio: true };
    const saved = { ...baseline, require_cv: true };
    expect(takeSaved(baseline, values, saved)).toEqual({ ...baseline, require_cv: true, ask_portfolio: true });
    // Nothing unsaved: the card simply shows what is saved now.
    expect(takeSaved(baseline, baseline, saved)).toEqual(saved);
    // The saved value caught up with the user's own unsaved choice: no difference is left to save.
    expect(changedSwitches({ ...baseline, ask_portfolio: true }, takeSaved(baseline, values, { ...baseline, ask_portfolio: true }))).toEqual({});
  });
  it('says a change in words, one phrase per switch sent', () => {
    expect(describeFormChange({ require_cv: true })).toEqual(['Require a CV']);
    expect(describeFormChange({ require_cv: false, ask_expected_salary: false }))
      .toEqual(['Stop requiring a CV', 'Stop asking for expected salary']);
    expect(describeFormChange({ require_cover_letter: true, ask_portfolio: true }))
      .toEqual(['Require a cover letter', 'Ask for a portfolio link']);
    // Not booleans, not switches: ignored.
    expect(describeFormChange({ require_cv: 'yes', careers_enabled: true, org_id: 'x' })).toEqual([]);
    expect(describeFormChange(null)).toEqual([]);
  });
  it('the schema converts to JSON Schema, so it can be a tool input schema', () => {
    expect(() => z.toJSONSchema(updateApplicationFormInput)).not.toThrow();
  });
});
