import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvFileName, toCsv } from '@/lib/finance/csv';

/** The file without its byte-order mark, one string per line. */
const lines = (csv: string) => csv.slice(CSV_BOM.length).split('\r\n');

describe('toCsv', () => {
  it('starts with a byte-order mark and ends every line with CRLF', () => {
    const csv = toCsv(['No.', 'Supplier'], [['BILL-0001', 'Lim Hardware']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿No.,Supplier\r\nBILL-0001,Lim Hardware\r\n');
  });

  it('writes only the header line when there are no rows', () => {
    expect(toCsv(['No.', 'Supplier'], [])).toBe('﻿No.,Supplier\r\n');
  });

  it('quotes a field with a comma, a quote or a line break, and doubles the quotes', () => {
    const csv = toCsv(['a'], [['Lim, Tan & Co'], ['The "Best" Shop'], ['line one\nline two'], ['carriage\rreturn']]);
    expect(csv.slice(CSV_BOM.length)).toBe(
      'a\r\n"Lim, Tan & Co"\r\n"The ""Best"" Shop"\r\n"line one\nline two"\r\n"carriage\rreturn"\r\n',
    );
  });

  it('keeps Malay and Chinese names as they are', () => {
    expect(lines(toCsv(['Supplier'], [['Kedai Runcit Pak Mat'], ['林記五金']]))).toEqual([
      'Supplier',
      'Kedai Runcit Pak Mat',
      '林記五金',
      '',
    ]);
  });

  it('puts an apostrophe before text a spreadsheet would run as a formula', () => {
    const csv = toCsv(
      ['Supplier'],
      [['=HYPERLINK("http://x","Lim")'], ['+60123456789'], ['-Minus Trading'], ['@home'], ['\tTabbed'], ['\rReturned']],
    );
    expect(lines(csv).slice(1, 5)).toEqual([
      '"\'=HYPERLINK(""http://x"",""Lim"")"',
      "'+60123456789",
      "'-Minus Trading",
      "'@home",
    ]);
    expect(csv).toContain("'\tTabbed\r\n");
    expect(csv).toContain('"\'\rReturned"\r\n');
  });

  it('leaves a number alone, even a negative one, and writes null as an empty field', () => {
    expect(lines(toCsv(['Total', 'Balance', 'Ref'], [[1200.5, -120.5, null], [0, 0.1, '']]))).toEqual([
      'Total,Balance,Ref',
      '1200.5,-120.5,',
      '0,0.1,',
      '',
    ]);
  });

  it('treats a negative amount passed as text like any other text starting with a minus', () => {
    expect(lines(toCsv(['Balance'], [['-120.50']]))[1]).toBe("'-120.50");
  });

  it('guards the header row the same way', () => {
    expect(lines(toCsv(['=cmd', 'a,b'], []))[0]).toBe('\'=cmd,"a,b"');
  });
});

describe('csvFileName', () => {
  it('joins the prefix and the date', () => {
    expect(csvFileName('supplier-bills', '2026-10-11')).toBe('supplier-bills-2026-10-11.csv');
    expect(csvFileName('payments-out', '2026-01-05')).toBe('payments-out-2026-01-05.csv');
  });
});
