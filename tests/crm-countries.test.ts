import { describe, expect, test } from 'vitest';
import { countryCode } from '@/lib/crm/countries';

/**
 * Malay names come from the runtime's own locale data. A runtime built
 * without it (small-icu Node, some browsers) answers in English instead, so
 * the Malay assertions run only where the data is present.
 */
const HAS_MALAY = new Intl.DisplayNames(['ms'], { type: 'region' }).of('SG') === 'Singapura';

describe('countryCode', () => {
  test('accepts a two-letter code in either case', () => {
    expect(countryCode('MY')).toBe('MY');
    expect(countryCode('my')).toBe('MY');
    expect(countryCode('Sg')).toBe('SG');
    expect(countryCode(' id ')).toBe('ID');
    expect(countryCode('US')).toBe('US');
    expect(countryCode('gb')).toBe('GB');
  });

  test('rejects two letters that are not a region', () => {
    for (const value of ['XX', 'xx', 'QQ', 'AA', 'ZZ']) expect(countryCode(value)).toBeNull();
  });

  test('does not take the test locales for countries', () => {
    for (const value of ['XA', 'XB', 'Pseudo-Accents', 'Pseudo-Bidi', 'Unknown Region']) {
      expect(countryCode(value)).toBeNull();
    }
  });

  test('resolves a replaced code to the one in use today', () => {
    expect(countryCode('UK')).toBe('GB');
    expect(countryCode('uk')).toBe('GB');
    expect(countryCode('BU')).toBe('MM');
    expect(countryCode('TP')).toBe('TL');
  });

  test.each([
    ['Malaysia', 'MY'],
    ['Singapore', 'SG'],
    ['Indonesia', 'ID'],
    ['Thailand', 'TH'],
    ['Philippines', 'PH'],
    ['United Kingdom', 'GB'],
    ['United States', 'US'],
    ['Japan', 'JP'],
    ['China', 'CN'],
    ['India', 'IN'],
    ['Australia', 'AU'],
  ])('knows the English name %s', (name, code) => {
    expect(countryCode(name)).toBe(code);
  });

  test('gives a name two codes share to the current country', () => {
    expect(countryCode('Germany')).toBe('DE');
    expect(countryCode('France')).toBe('FR');
    expect(countryCode('Serbia')).toBe('RS');
    expect(countryCode('Yemen')).toBe('YE');
    expect(countryCode('Zimbabwe')).toBe('ZW');
    expect(countryCode('Timor-Leste')).toBe('TL');
    expect(countryCode('Curaçao')).toBe('CW');
  });

  test('knows a name without its qualifier', () => {
    expect(countryCode('Myanmar')).toBe('MM');
    expect(countryCode('Myanmar (Burma)')).toBe('MM');
    expect(countryCode('Hong Kong SAR China')).toBe('HK');
    expect(countryCode('Saint Lucia')).toBe('LC');
    expect(countryCode('St Lucia')).toBe('LC');
  });

  test.runIf(HAS_MALAY).each([
    ['Singapura', 'SG'],
    ['Jepun', 'JP'],
    ['Amerika Syarikat', 'US'],
    ['Filipina', 'PH'],
    ['Korea Selatan', 'KR'],
    ['Jerman', 'DE'],
    ['Perancis', 'FR'],
    ['amerika syarikat', 'US'],
  ])('knows the Malay name %s', (name, code) => {
    expect(countryCode(name)).toBe(code);
  });

  test.each([
    ['USA', 'US'],
    ['US', 'US'],
    ['United States of America', 'US'],
    ['America', 'US'],
    ['UK', 'GB'],
    ['Great Britain', 'GB'],
    ['Britain', 'GB'],
    ['England', 'GB'],
    ['UAE', 'AE'],
    ['South Korea', 'KR'],
    ['Korea', 'KR'],
    ['North Korea', 'KP'],
    ['Russia', 'RU'],
    ['Vietnam', 'VN'],
    ['Viet Nam', 'VN'],
    ['Brunei', 'BN'],
    ['Laos', 'LA'],
    ['Burma', 'MM'],
    ['Holland', 'NL'],
    ['Czech Republic', 'CZ'],
    ['Turkey', 'TR'],
    ['Hong Kong', 'HK'],
    ['Macau', 'MO'],
    ['Macao', 'MO'],
    ['Taiwan', 'TW'],
    ['Ivory Coast', 'CI'],
    ["M'sia", 'MY'],
    ['Msia', 'MY'],
    ["S'pore", 'SG'],
    ['Spore', 'SG'],
  ])('knows the alias %s', (alias, code) => {
    expect(countryCode(alias)).toBe(code);
  });

  test('ignores case and surrounding or repeated spaces', () => {
    expect(countryCode('malaysia')).toBe('MY');
    expect(countryCode('MALAYSIA')).toBe('MY');
    expect(countryCode('  Malaysia  ')).toBe('MY');
    expect(countryCode('United   Kingdom')).toBe('GB');
    expect(countryCode('new\tzealand')).toBe('NZ');
  });

  test('ignores diacritics', () => {
    expect(countryCode("Côte d'Ivoire")).toBe('CI');
    expect(countryCode("Cote d'Ivoire")).toBe('CI');
    expect(countryCode('Côte d’Ivoire')).toBe('CI');
    expect(countryCode('Cote dIvoire')).toBe('CI');
    expect(countryCode('Réunion')).toBe('RE');
    expect(countryCode('Reunion')).toBe('RE');
  });

  test('treats & as and', () => {
    expect(countryCode('Trinidad & Tobago')).toBe('TT');
    expect(countryCode('Trinidad and Tobago')).toBe('TT');
    expect(countryCode('Trinidad&Tobago')).toBe('TT');
    expect(countryCode('Bosnia and Herzegovina')).toBe('BA');
  });

  test('drops a leading "the"', () => {
    expect(countryCode('The Netherlands')).toBe('NL');
    expect(countryCode('the Philippines')).toBe('PH');
    expect(countryCode('The United States of America')).toBe('US');
    expect(countryCode('THE UK')).toBe('GB');
    // Only as a whole leading word.
    expect(countryCode('Thailand')).toBe('TH');
  });

  test('ignores dots, commas, apostrophes and hyphens', () => {
    expect(countryCode('U.S.A.')).toBe('US');
    expect(countryCode('U.S.')).toBe('US');
    expect(countryCode('U.K.')).toBe('GB');
    expect(countryCode('U.A.E')).toBe('AE');
    expect(countryCode('Timor Leste')).toBe('TL');
    expect(countryCode('Timor-Leste')).toBe('TL');
    expect(countryCode('Guinea Bissau')).toBe('GW');
    expect(countryCode('Malaysia,')).toBe('MY');
    expect(countryCode('msia')).toBe('MY');
    expect(countryCode('S’pore')).toBe('SG');
  });

  test('returns null for nothing, whitespace and nonsense', () => {
    for (const value of ['', '   ', '\t\n', 'Atlantis', 'N/A', '-', '123', 'Malaysiaa', 'M', 'MYS']) {
      expect(countryCode(value)).toBeNull();
    }
  });
});
