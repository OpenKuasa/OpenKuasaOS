'use client';

import {
  CalendarClock,
  ChevronDown,
  Columns3,
  Filter,
  Plus,
  Tag,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CONTACT_VIEWS,
  DEFAULT_FILTERS,
  SCORE_BANDS,
  UNASSIGNED,
  activeFilterCount,
  type ContactFilters,
  type ContactView,
  type FollowUpFilter,
} from '@/lib/crm/contact-filters';
import { CONTACT_COLUMNS, type ContactColumnKey } from './contact-columns';

/** Looks like the small outline buttons it sits beside. */
const TRIGGER =
  'inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent';

/** A count shown on a button whose menu has something switched on. */
function Count({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold leading-4 text-primary-foreground">
      {value}
    </span>
  );
}

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const FOLLOW_UP_CHOICES: { key: FollowUpFilter; label: string }[] = [
  { key: 'any', label: 'All contacts' },
  { key: 'open', label: 'With a follow-up' },
  { key: 'overdue', label: 'Overdue only' },
];

/** The row of controls above the table: Filter, the view, Tags and Follow-up. */
export function ContactsToolbar({
  filters,
  onChange,
  tags,
  filterOpen,
  onToggleFilter,
}: {
  filters: ContactFilters;
  onChange: (next: ContactFilters) => void;
  /** Every tag in use, for the Tags menu. */
  tags: string[];
  filterOpen: boolean;
  onToggleFilter: () => void;
}) {
  const view = CONTACT_VIEWS.find((v) => v.key === filters.view) ?? CONTACT_VIEWS[0];

  return (
    <div className="flex flex-wrap items-center gap-2 px-4">
      <button
        type="button"
        className={cn(TRIGGER, filterOpen && 'bg-accent')}
        aria-expanded={filterOpen}
        aria-controls="contact-filter-panel"
        onClick={onToggleFilter}
      >
        <Filter className="size-4" />
        Filter
        <Count value={activeFilterCount(filters)} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className={TRIGGER}>
          {view.label}
          <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={filters.view}
            onValueChange={(key) => onChange({ ...filters, view: key as ContactView })}
          >
            {CONTACT_VIEWS.map((v) => (
              <DropdownMenuRadioItem key={v.key} value={v.key}>
                {v.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={TRIGGER}>
          <Tag className="size-4" />
          Tags
          <Count value={filters.tags.length} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
          {tags.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags yet. Add some when you edit a contact.
            </p>
          ) : (
            tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={filters.tags.includes(tag)}
                // Stay open so several tags can be ticked in one go.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onChange({ ...filters, tags: toggled(filters.tags, tag) })}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            ))
          )}
          {filters.tags.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange({ ...filters, tags: [] })}>
                Clear tags
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={TRIGGER}>
          <CalendarClock className="size-4" />
          Follow-up
          <Count value={filters.followUp === 'any' ? 0 : 1} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={filters.followUp}
            onValueChange={(key) => onChange({ ...filters, followUp: key as FollowUpFilter })}
          >
            {FOLLOW_UP_CHOICES.map((c) => (
              <DropdownMenuRadioItem key={c.key} value={c.key}>
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on
          ? 'border-primary bg-primary/10 text-primary'
          : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Opened by the Filter button: search plus score, person in charge and country. */
export function ContactFilterPanel({
  filters,
  onChange,
  pics,
  countries,
}: {
  filters: ContactFilters;
  onChange: (next: ContactFilters) => void;
  pics: string[];
  countries: string[];
}) {
  const inUse = activeFilterCount(filters) > 0;

  return (
    <div id="contact-filter-panel" className="mx-4 mt-3 space-y-2.5 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search contacts"
          placeholder="Search name, email, company, phone or tag"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          autoFocus
          className="h-8 max-w-sm flex-1 bg-background"
        />
        {inUse ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...filters,
                search: DEFAULT_FILTERS.search,
                scores: [],
                pics: [],
                countries: [],
              })
            }
          >
            <X className="size-4" />
            Clear filters
          </Button>
        ) : null}
      </div>

      <ChipGroup label="Lead score">
        {SCORE_BANDS.map((band) => (
          <Chip
            key={band.key}
            label={band.label}
            on={filters.scores.includes(band.key)}
            onClick={() => onChange({ ...filters, scores: toggled(filters.scores, band.key) })}
          />
        ))}
      </ChipGroup>

      {pics.length > 0 ? (
        <ChipGroup label="PIC">
          {pics.map((pic) => (
            <Chip
              key={pic || 'unassigned'}
              label={pic === UNASSIGNED ? 'Nobody yet' : pic}
              on={filters.pics.includes(pic)}
              onClick={() => onChange({ ...filters, pics: toggled(filters.pics, pic) })}
            />
          ))}
        </ChipGroup>
      ) : null}

      {countries.length > 0 ? (
        <ChipGroup label="Country">
          {countries.map((country) => (
            <Chip
              key={country}
              label={country}
              on={filters.countries.includes(country)}
              onClick={() =>
                onChange({ ...filters, countries: toggled(filters.countries, country) })
              }
            />
          ))}
        </ChipGroup>
      ) : null}
    </div>
  );
}

/** The Columns button in the page header. */
export function ColumnsMenu({
  hidden,
  onToggle,
}: {
  hidden: Set<ContactColumnKey>;
  onToggle: (key: ContactColumnKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TRIGGER}>
        <Columns3 className="size-4" />
        Columns
        <Count value={hidden.size} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {CONTACT_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={!hidden.has(column.key)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(column.key)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The Add Contact button in the page header: one by hand, or many from a file. */
export function AddContactMenu({
  onAddOne,
  onImport,
}: {
  onAddOne: () => void;
  onImport: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="size-4" />
        Add Contact
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        // Focus goes to what the choice opened, not back to this button.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={onAddOne}>
          <UserPlus />
          Add one contact
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onImport}>
          <Upload />
          Import from CSV or Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
