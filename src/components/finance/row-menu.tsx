'use client';

import { useRef } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type RowMenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /**
   * The choice opens a form card or a confirmation elsewhere on the page.
   * Focus then goes to that, not back to this row's button.
   */
  opens?: boolean;
};

/** Put on the field or button that should take focus when a menu choice opens it. */
export const FOCUS_TARGET = 'data-finance-focus';

/** The "⋯" menu at the end of a table row. `label` names the row for screen readers. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const opened = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      {/*
        A closing menu hands focus back to its button. When the choice opened a
        card at the top of the page, that would scroll the page down to the
        button and cut the card off, so focus goes to what was opened instead.
      */}
      <DropdownMenuContent
        align="end"
        className="w-40"
        onCloseAutoFocus={(event) => {
          if (!opened.current) return;
          opened.current = false;
          const target = document.querySelector<HTMLElement>(`[${FOCUS_TARGET}]`);
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.destructive ? 'destructive' : undefined}
            onSelect={() => {
              opened.current = item.opens === true;
              item.onSelect();
            }}
          >
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
