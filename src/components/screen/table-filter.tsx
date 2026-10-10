import { TableCell, TableRow } from '@/components/ui/table';

/**
 * Rows whose `text` contains the query (case-insensitive) and whose fields
 * equal every selected value. A selection of 'all' matches any row.
 */
export function filterRows<T>(
  rows: T[],
  query: string,
  text: (row: T) => string,
  selected: { [K in keyof T]?: string } = {},
) {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      text(row).toLowerCase().includes(q) &&
      Object.entries(selected).every(
        ([key, value]) => value === 'all' || String(row[key as keyof T]) === value,
      ),
  );
}

export function NoMatchesRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        No matches. Try a different search or filter.
      </TableCell>
    </TableRow>
  );
}
