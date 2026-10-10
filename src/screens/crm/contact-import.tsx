'use client';

import { useActionState, useMemo, useState } from 'react';
import { Inbox, Upload } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import { CrmContactFormError } from '@/lib/crm/contacts';
import {
  IMPORT_FIELDS,
  IMPORT_LIMIT,
  guessMapping,
  parseCsv,
  planImport,
  type ImportFieldKey,
  type ImportMapping,
  type ImportPlan,
} from '@/lib/crm/import';
import type { CrmFormAction, CrmFormState } from '@/lib/crm/form-state';

const SELECT_CLASS =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** A file, read into rows of text cells. Row 0 is the headers. */
type Sheet = { name: string; table: string[][]; totalRows: number };

/** Reads a CSV or .xlsx file in the browser. Nothing is uploaded at this point. */
async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    // Loaded only when someone picks an Excel file.
    const { readSheet: readXlsx } = await import('read-excel-file/browser');
    const rows = await readXlsx(file);
    return rows
      .map((row) =>
        row.map((cell) => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return cell.toISOString().slice(0, 10);
          return String(cell).trim();
        }),
      )
      .filter((row) => row.some((cell) => cell !== ''));
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return parseCsv(await file.text());
  }
  throw new CrmContactFormError(
    'Choose a .csv or .xlsx file. Older .xls files need to be saved as .xlsx first.',
  );
}

/**
 * Only the columns that feed a field are sent, renumbered from zero, so a wide
 * spreadsheet does not travel to the server for nothing.
 */
function compact(table: string[][], mapping: ImportMapping) {
  const used = IMPORT_FIELDS.filter((f) => mapping[f.key] !== null);
  const next = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, null])) as ImportMapping;
  used.forEach((f, index) => {
    next[f.key] = index;
  });
  return {
    mapping: next,
    table: table.map((row) => used.map((f) => row[mapping[f.key] as number] ?? '')),
  };
}

function tryPlan(table: string[][], mapping: ImportMapping): ImportPlan | string {
  try {
    return planImport(table, mapping);
  } catch (error) {
    if (error instanceof CrmContactFormError) return error.message;
    throw error;
  }
}

/** Import contacts from a spreadsheet: pick a file, check the columns, import. */
export function ContactImportCard({
  action,
  onClose,
}: {
  action: CrmFormAction;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    async (prev, formData) => {
      const next = await action(prev, formData);
      // The file is done with once it has been imported.
      if (next?.ok) {
        setSheet(null);
        setMapping(null);
      }
      return next;
    },
    undefined,
  );

  const plan = useMemo(
    () => (sheet && mapping ? tryPlan(sheet.table, mapping) : null),
    [sheet, mapping],
  );
  const ready = plan && typeof plan !== 'string' ? plan : null;
  const payload = useMemo(
    () => (sheet && mapping && ready ? JSON.stringify(compact(sheet.table, mapping)) : ''),
    [sheet, mapping, ready],
  );

  const pickFile = async (file: File | undefined) => {
    setFileError(null);
    setSheet(null);
    setMapping(null);
    if (!file) return;
    setReading(true);
    try {
      const table = await readSheet(file);
      if (table.length < 2) {
        setFileError('That file has no rows under its header line.');
        return;
      }
      setSheet({
        name: file.name,
        // Header plus the rows that can be imported in one go.
        table: table.slice(0, IMPORT_LIMIT + 1),
        totalRows: table.length - 1,
      });
      setMapping(guessMapping(table[0]));
    } catch (error) {
      setFileError(
        error instanceof CrmContactFormError
          ? error.message
          : 'That file could not be read. Check that it is a CSV or Excel (.xlsx) file.',
      );
    } finally {
      setReading(false);
    }
  };

  const setColumn = (key: ImportFieldKey, value: string) => {
    if (!mapping) return;
    const index = value === '' ? null : Number(value);
    const next = { ...mapping };
    // A column feeds one field; taking it for this field frees it from another.
    for (const field of IMPORT_FIELDS) {
      if (index !== null && next[field.key] === index) next[field.key] = null;
    }
    next[key] = index;
    setMapping(next);
  };

  const headers = sheet?.table[0] ?? [];
  const done = state?.ok && !pending ? state.message : null;
  const failed = state && !state.ok && !pending ? state.error : null;

  return (
    <BentoCard
      title="Import contacts"
      subtitle={`From a CSV or Excel (.xlsx) file, up to ${IMPORT_LIMIT} rows at a time`}
      // The card's icon chip only draws icons from the animated set.
      icon={Inbox}
      className="col-span-2 md:col-span-12"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            aria-label="Spreadsheet file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => pickFile(event.target.files?.[0])}
            disabled={pending}
            className="max-w-full text-sm file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium hover:file:bg-accent"
          />
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Close
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          The first line must be column names. First name and email are needed for each
          contact; a contact whose email is already in this workspace is left as it is.
        </p>

        {reading ? <p className="text-sm text-muted-foreground">Reading the file…</p> : null}
        {fileError ? (
          <p role="alert" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-sm font-medium text-primary">
            {done}
          </p>
        ) : null}

        {sheet && mapping ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">
                Match the columns in {sheet.name}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {IMPORT_FIELDS.map((field) => (
                  <label key={field.key} className="space-y-1 text-sm">
                    <span className="font-medium">
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                    </span>
                    <select
                      className={SELECT_CLASS}
                      value={mapping[field.key] ?? ''}
                      onChange={(event) => setColumn(field.key, event.target.value)}
                      disabled={pending}
                    >
                      <option value="">Not in this file</option>
                      {headers.map((header, index) => (
                        <option key={index} value={index}>
                          {header || `Column ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {typeof plan === 'string' ? (
              <p role="alert" className="text-sm text-destructive">
                {plan}
              </p>
            ) : null}

            {ready ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <p>
                  <span className="font-semibold">{ready.rows.length}</span>{' '}
                  {ready.rows.length === 1 ? 'contact is' : 'contacts are'} ready to import
                  {ready.skipped.length > 0 ? (
                    <>
                      , <span className="font-semibold">{ready.skipped.length}</span>{' '}
                      {ready.skipped.length === 1 ? 'row' : 'rows'} will be skipped
                    </>
                  ) : null}
                  .
                </p>
                {sheet.totalRows > IMPORT_LIMIT ? (
                  <p className="text-muted-foreground">
                    The file has {sheet.totalRows} rows. Only the first {IMPORT_LIMIT} are read;
                    import the rest from a second file.
                  </p>
                ) : null}
                {ready.rows.length > 0 ? (
                  <ul className="text-muted-foreground">
                    {ready.rows.slice(0, 3).map((row) => (
                      <li key={row.email} className="truncate">
                        {[row.first_name, row.last_name].filter(Boolean).join(' ')} · {row.email}
                        {row.company ? ` · ${row.company}` : ''}
                      </li>
                    ))}
                    {ready.rows.length > 3 ? <li>and {ready.rows.length - 3} more</li> : null}
                  </ul>
                ) : null}
                {ready.skipped.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer font-medium">Why rows are skipped</summary>
                    <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                      {ready.skipped.slice(0, 50).map((skip) => (
                        <li key={skip.line}>
                          Line {skip.line}: {skip.reason}
                        </li>
                      ))}
                      {ready.skipped.length > 50 ? (
                        <li>and {ready.skipped.length - 50} more</li>
                      ) : null}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}

            <form action={formAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="payload" value={payload} />
              <Button type="submit" disabled={pending || !ready || ready.rows.length === 0}>
                <Upload className="size-4" />
                {pending
                  ? 'Importing…'
                  : ready && ready.rows.length > 0
                    ? `Import ${ready.rows.length} ${ready.rows.length === 1 ? 'contact' : 'contacts'}`
                    : 'Import'}
              </Button>
              {failed ? (
                <p role="alert" className="text-sm text-destructive">
                  {failed}
                </p>
              ) : null}
            </form>
          </>
        ) : null}
      </div>
    </BentoCard>
  );
}
