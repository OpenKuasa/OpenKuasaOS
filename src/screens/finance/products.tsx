'use client';

import { useState } from 'react';
import {
  BarChart3,
  Filter,
  PieChart,
  Plus,
  Search,
  Boxes,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  BarGroup,
  DonutStat,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

type ItemType = 'Product' | 'Service';
type ItemStatus = 'Active' | 'Inactive';

type Item = {
  id: string;
  name: string;
  sku: string;
  type: ItemType;
  category: string;
  price: string;
  tax: string;
  stock: string;
  status: ItemStatus;
};

const ITEMS: Item[] = [
  { id: '1', name: 'Consultation — 1hr', sku: 'SRV-001', type: 'Service', category: 'Professional', price: 'RM 250.00', tax: 'SST 6%', stock: '—', status: 'Active' },
  { id: '2', name: 'Website Package', sku: 'SRV-002', type: 'Service', category: 'Professional', price: 'RM 3,500.00', tax: 'SST 6%', stock: '—', status: 'Active' },
  { id: '3', name: 'Monthly Bookkeeping', sku: 'SRV-003', type: 'Service', category: 'Professional', price: 'RM 600.00', tax: 'SST 6%', stock: '—', status: 'Active' },
  { id: '4', name: 'Printer Ink', sku: 'PRD-010', type: 'Product', category: 'Office supplies', price: 'RM 85.00', tax: 'SST 6%', stock: '6 left', status: 'Active' },
  { id: '5', name: 'A4 Paper (Ream)', sku: 'PRD-011', type: 'Product', category: 'Office supplies', price: 'RM 14.50', tax: 'SST 6%', stock: '48', status: 'Active' },
  { id: '6', name: 'Thermal Receipt Roll', sku: 'PRD-012', type: 'Product', category: 'Consumables', price: 'RM 6.00', tax: 'None', stock: '4 left', status: 'Active' },
  { id: '7', name: 'Logo Design', sku: 'SRV-004', type: 'Service', category: 'Professional', price: 'RM 450.00', tax: 'SST 6%', stock: '—', status: 'Inactive' },
];

const STATUS_STYLES: Record<ItemStatus, string> = {
  Active: 'bg-emerald-500/15 text-emerald-600',
  Inactive: 'bg-muted text-muted-foreground',
};

/* KPI sparkline trends (whole catalogue) ------------------------------ */
const SPARK_ITEMS = [34, 35, 37, 38, 39, 40, 41, 42];
const SPARK_PRICE = [420, 435, 448, 455, 462, 470, 478, 486];
const SPARK_TAXABLE = [32, 33, 34, 35, 36, 37, 37, 38];
const SPARK_LOWSTOCK = [1, 1, 2, 2, 3, 2, 3, 3];

/* Top items by revenue YTD (RM k) ------------------------------------- */
const TOP_REVENUE = [
  { label: 'Website Package', revenue: 84 },
  { label: 'Monthly Bookkeeping', revenue: 48 },
  { label: 'Consultation — 1hr', revenue: 36 },
  { label: 'Logo Design', revenue: 14 },
  { label: 'Printer Ink', revenue: 9 },
];
const REVENUE_SERIES: Series[] = [
  { key: 'revenue', label: 'Revenue (RM k)', color: 'var(--chart-1)' },
];

/* Revenue by category YTD (RM k) -------------------------------------- */
const BY_CATEGORY: Slice[] = [
  { key: 'professional', label: 'Professional', value: 182, color: 'var(--chart-1)' },
  { key: 'office', label: 'Office supplies', value: 21, color: 'var(--chart-2)' },
  { key: 'consumables', label: 'Consumables', value: 6, color: 'var(--chart-5)' },
];

/* ------------------------------------------------------------------ */

export default function ProductsScreen() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const rows = filterRows(ITEMS, query, (i) => `${i.name} ${i.sku} ${i.category}`, { type });

  return (
    <ScreenContainer>
      <PageHeader
        title="Products & Services"
        subtitle="Items you sell & buy, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Item
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Products & services"
            value="42"
            delta="+3"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_ITEMS}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Avg price"
            value="RM 486"
            delta="+4%"
            deltaTone="up"
            chart={<Sparkline data={SPARK_PRICE} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="SST-taxable"
            value="38"
            delta="90%"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_TAXABLE} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Low stock"
            value="3"
            delta="reorder"
            deltaTone="down"
            chart={<Sparkline data={SPARK_LOWSTOCK} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>

        {/* Top revenue + category mix */}
        <BentoCard
          title="Top items by revenue"
          subtitle="YTD · RM k"
          icon={BarChart3}
          className="col-span-2 md:col-span-8"
        >
          <BarGroup
            data={TOP_REVENUE}
            series={REVENUE_SERIES}
            horizontal
            height={240}
          />
        </BentoCard>
        <BentoCard
          title="Revenue by category"
          subtitle="YTD"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={BY_CATEGORY}
            height={240}
            centerValue="RM 209k"
            centerLabel="YTD"
          />
        </BentoCard>

        {/* Items table */}
        <BentoCard
          title="All items"
          subtitle="Your catalogue of products & services"
          icon={Boxes}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search items…"
                placeholder="Search items…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="size-4" />
              Filter
            </Button>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Product">Products</SelectItem>
                <SelectItem value="Service">Services</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={8} />}
                {rows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap font-medium">{i.name}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{i.sku}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{i.type}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{i.category}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{i.price}</TableCell>
                    <TableCell className="whitespace-nowrap">{i.tax}</TableCell>
                    <TableCell
                      className={cn(
                        'whitespace-nowrap text-right tabular-nums',
                        i.stock.includes('left') && 'font-medium text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {i.stock}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          STATUS_STYLES[i.status],
                        )}
                      >
                        {i.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
