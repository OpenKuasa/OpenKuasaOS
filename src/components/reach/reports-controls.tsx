'use client';

import { Download } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportRange } from '@/lib/reach/reports';

export function ReportsControls({ range }: { range: ReportRange }) {
  const router = useRouter();
  const pathname = usePathname();

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
        onClick={() => {
          // wired in Task 8
        }}
      >
        <Download className="size-4" />
        Export
      </Button>
    </>
  );
}
