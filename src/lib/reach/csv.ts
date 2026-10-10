import type { Lead } from '@/lib/reach/types';

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = 'id,name,channel,stage,source,created_at';
  const rows = leads.map((l) =>
    [l.id, l.name, l.channel, l.stage, l.source ?? '', l.created_at].map(cell).join(','),
  );
  return [header, ...rows].join('\r\n');
}
