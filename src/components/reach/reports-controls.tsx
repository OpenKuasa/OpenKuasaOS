'use client';

import { Download } from 'lucide-react';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportLeadsCsv } from '@/app/(app)/reach/actions';
import type { ReportRange } from '@/lib/reach/reports';

export function ReportsControls({ range }: { range: ReportRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onExport = () => {
    setError(null);
    startTransition(async () => {
      const res = await exportLeadsCsv(range);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <>
      <Select
        value={range}
        onValueChange={(value) => router.replace(`${pathname}?range=${value}`)}
      >
        <SelectTrigger className="w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        disabled={pending}
      >
        <Download className="size-4" />
        Export
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
