/**
 * Reading tool activity out of a chat message: the lookups an assistant ran
 * and the changes it is waiting for approval on. Shared by Ask-Jebat and Tuah.
 */

import type { ComponentType } from 'react';
import type { UIMessage } from 'ai';
import {
  CalendarDays,
  ClipboardList,
  Coins,
  Images,
  Megaphone,
  PieChart,
  Contact,
  Handshake,
  SquareKanban,
  ChartColumn,
  Send,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

type Icon = ComponentType<{ className?: string }>;

export type AnyPart = UIMessage['parts'][number];

const TOOL_META: Record<string, { label: string; Icon: Icon }> = {
  getAdsOverview: { label: 'Ads overview', Icon: PieChart },
  getCampaigns: { label: 'Campaigns', Icon: Megaphone },
  getLeadSummary: { label: 'Lead summary', Icon: TrendingUp },
  getSpendByChannel: { label: 'Spend by channel', Icon: Coins },
  getUpcomingAppointments: { label: 'Appointments', Icon: CalendarDays },
  getCreatives: { label: 'Creatives', Icon: Images },
  getAdSettings: { label: 'Ad settings', Icon: SlidersHorizontal },
  listForms: { label: 'Lead forms', Icon: ClipboardList },
  listBroadcasts: { label: 'Broadcasts', Icon: Send },
  listAutomations: { label: 'Automations', Icon: Zap },
  listCrmContacts: { label: 'Contacts', Icon: Contact },
  listDeals: { label: 'Deals', Icon: Handshake },
  listPipelines: { label: 'Pipelines', Icon: SquareKanban },
  getDealStats: { label: 'Deal totals', Icon: ChartColumn },
  listContacts: { label: 'Leads', Icon: Users },
};

function humanize(name: string): string {
  const spaced = name.replace(/^(get|list)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).trim();
}

export function toolMeta(name: string): { label: string; Icon: Icon } {
  return TOOL_META[name] ?? { label: humanize(name) || 'Tool', Icon: Wrench };
}

export function isText(p: AnyPart): p is Extract<AnyPart, { type: 'text' }> {
  return p.type === 'text';
}

function toolName(part: AnyPart): string | null {
  const type = part.type;
  if (type === 'dynamic-tool') return (part as { toolName?: string }).toolName ?? null;
  if (typeof type === 'string' && type.startsWith('tool-')) return type.slice('tool-'.length);
  return null;
}

export type ToolStep = {
  key: string;
  name: string;
  running: boolean;
  /** The user said no to this change, so it never ran. */
  denied: boolean;
  output: unknown;
};

export function toToolStep(part: AnyPart, messageId: string, index: number): ToolStep | null {
  const name = toolName(part);
  if (!name) return null;
  const state = 'state' in part ? (part.state as string) : undefined;
  const denied = state === 'output-denied';
  const running = !denied && state !== 'output-available' && state !== 'output-error';
  const output = 'output' in part ? part.output : undefined;
  const key =
    ('toolCallId' in part ? (part.toolCallId as string) : undefined) ?? `${messageId}-${index}`;
  return { key, name, running, denied, output };
}

export type PendingApproval = { approvalId: string; toolName: string; input: unknown };

export function toPendingApproval(part: AnyPart): PendingApproval | null {
  const type = part.type;
  if (typeof type !== 'string' || !type.startsWith('tool-')) return null;
  if (!('state' in part) || (part as { state?: string }).state !== 'approval-requested') return null;
  const approval = (part as { approval?: { id?: string } }).approval;
  if (!approval?.id) return null;
  return {
    approvalId: approval.id,
    toolName: type.slice('tool-'.length),
    input: (part as { input?: unknown }).input,
  };
}

/** A named row with this id, anywhere in a tool result (a listing, or a saved row). */
function nameOf(value: unknown, id: string, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = nameOf(item, id, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const row = value as Record<string, unknown>;
  if (row.id === id && typeof row.name === 'string' && row.name.trim()) return row.name.trim();
  for (const inner of Object.values(row)) {
    const found = nameOf(inner, id, depth + 1);
    if (found) return found;
  }
  return null;
}

/** What kind of thing each tool's result is about, so an id is only named from the right kind. */
export type ItemKind = 'campaign' | 'creative' | 'form' | 'contact' | 'deal' | 'stage';
const KIND_OF_TOOL: Record<string, ItemKind> = {
  getCampaigns: 'campaign',
  createCampaign: 'campaign',
  updateCampaign: 'campaign',
  setCampaignStatus: 'campaign',
  getCreatives: 'creative',
  createCreative: 'creative',
  updateCreative: 'creative',
  listForms: 'form',
  createForm: 'form',
  updateForm: 'form',
  setFormStatus: 'form',
  listCrmContacts: 'contact',
  createContact: 'contact',
  updateContact: 'contact',
  listDeals: 'deal',
  createDeal: 'deal',
  updateDeal: 'deal',
  moveDeal: 'deal',
  markDealLost: 'deal',
  reopenDeal: 'deal',
  listPipelines: 'stage',
};

/**
 * Finds the name of a row by its id. A change tool is given ids, and the
 * assistant got each id from an earlier tool result in the conversation (a
 * listing, or the row it created), so the name is there too. With a `kind`,
 * only results about that kind of thing count: an id that belongs to a
 * contact must never put the contact's name on a card about a deal.
 */
export function nameFinder(
  messages: { parts: AnyPart[] }[],
): (id: unknown, kind?: ItemKind) => string | null {
  return (id, kind) => {
    if (typeof id !== 'string' || !id) return null;
    for (let m = messages.length - 1; m >= 0; m -= 1) {
      for (const part of messages[m].parts) {
        const tool = toolName(part);
        if (!tool || !('output' in part)) continue;
        if (kind && KIND_OF_TOOL[tool] !== kind) continue;
        const found = nameOf(part.output, id);
        if (found) return found;
      }
    }
    return null;
  };
}

/** The name of the thing a change is about, when the change names it by `id`. */
export function approvalSubject(
  input: unknown,
  messages: { parts: AnyPart[] }[],
  kind?: ItemKind,
): string | null {
  return nameFinder(messages)((input as { id?: unknown } | null)?.id, kind);
}

/**
 * The question on an approval card. `named` is either the name of the item
 * the change is about, or a way to look names up by id; without it the card
 * falls back to "this campaign".
 */
export function approvalTitle(
  toolName: string,
  input: unknown,
  named?: string | null | ((id: unknown, kind?: ItemKind) => string | null),
): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const find = typeof named === 'function' ? named : () => null;
  // "campaign “X”" when the item's name is known, else "this campaign".
  const the = (label: string, kind: ItemKind) => {
    const subject = typeof named === 'function' ? named(i.id, kind) : named;
    return subject ? `${label} “${subject}”` : `this ${label}`;
  };
  const person = [i.firstName, i.lastName].filter((v) => typeof v === 'string' && v).join(' ');
  switch (toolName) {
    case 'createCampaign': return `Create campaign “${i.name ?? ''}”?`;
    case 'updateCampaign': return `Save changes to ${the('campaign', 'campaign')}?`;
    case 'setCampaignStatus':
      return i.status === 'paused' ? `Pause ${the('campaign', 'campaign')}?` : `Resume ${the('campaign', 'campaign')}?`;
    case 'deleteCampaign': return `Delete ${the('campaign', 'campaign')}?`;
    case 'createCreative': return `Add creative “${i.name ?? ''}”?`;
    case 'updateCreative': return `Save changes to ${the('creative', 'creative')}?`;
    case 'deleteCreative': return `Delete ${the('creative', 'creative')}?`;
    case 'updateAdSettings': return 'Update ad settings?';
    case 'createForm': return `Create lead form “${i.name ?? ''}”?`;
    case 'updateForm': return `Save changes to ${the('lead form', 'form')}?`;
    case 'setFormStatus':
      return i.status === 'active'
        ? `Activate ${the('lead form', 'form')}?`
        : i.status === 'paused'
          ? `Pause ${the('lead form', 'form')}?`
          : `Move ${the('lead form', 'form')} back to draft?`;
    case 'deleteForm': return `Delete ${the('lead form', 'form')}?`;
    case 'createContact': return `Add contact “${person}”?`;
    case 'updateContact': return `Save changes to ${the('contact', 'contact')}?`;
    case 'deleteContact': return `Delete ${the('contact', 'contact')}?`;
    case 'createDeal': {
      const who = find(i.contactId, 'contact');
      return who ? `Add deal “${i.title ?? ''}” for ${who}?` : `Add deal “${i.title ?? ''}”?`;
    }
    case 'updateDeal': return `Save changes to ${the('deal', 'deal')}?`;
    case 'moveDeal': {
      const stage = find(i.stageId, 'stage');
      return stage ? `Move ${the('deal', 'deal')} to ${stage}?` : `Move ${the('deal', 'deal')} to another stage?`;
    }
    case 'markDealLost': return `Mark ${the('deal', 'deal')} as lost?`;
    case 'reopenDeal': return `Reopen ${the('deal', 'deal')}?`;
    case 'deleteDeal': return `Delete ${the('deal', 'deal')}?`;
    default: return 'Approve this change?';
  }
}

export function approvalDetail(toolName: string): string | null {
  if (toolName === 'deleteContact') return 'Their deals are deleted too. This cannot be undone.';
  if (
    toolName === 'deleteCampaign' ||
    toolName === 'deleteCreative' ||
    toolName === 'deleteForm' ||
    toolName === 'deleteDeal'
  ) {
    return 'This cannot be undone.';
  }
  return null;
}

/** True when a message shows something: words, or tool activity. */
export function hasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (p) => (isText(p) && p.text.trim().length > 0) || toolName(p) !== null,
  );
}
