import type { Lead } from '@/lib/reach/types';

function cell(v: string): string {
  // Neutralise spreadsheet formula injection (lead names are attacker-controllable).
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = 'id,name,channel,stage,source,created_at';
  const rows = leads.map((l) =>
    [l.id, l.name, l.channel, l.stage, l.source ?? '', l.created_at].map(cell).join(','),
  );
  return [header, ...rows].join('\r\n');
}
