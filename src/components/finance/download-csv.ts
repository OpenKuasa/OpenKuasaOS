'use client';

/**
 * Hands the browser a CSV file to save. The text comes from toCsv in
 * src/lib/finance/csv.ts, which has already made it safe to open in a
 * spreadsheet. Call it from a click handler only: it needs the document.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari can cancel the download if the link is released at once.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
