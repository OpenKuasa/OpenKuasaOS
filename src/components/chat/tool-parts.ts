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
  listContacts: { label: 'Contacts', Icon: Users },
  listForms: { label: 'Lead forms', Icon: ClipboardList },
  listBroadcasts: { label: 'Broadcasts', Icon: Send },
  listAutomations: { label: 'Automations', Icon: Zap },
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

/**
 * The name of the thing a change is about. A change tool is given an id, and
 * the assistant got that id from an earlier tool result in the conversation
 * (a listing, or the row it created), so the name is there too.
 */
export function approvalSubject(input: unknown, messages: { parts: AnyPart[] }[]): string | null {
  const id = (input as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) return null;
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    for (const part of messages[m].parts) {
      if (!toolName(part) || !('output' in part)) continue;
      const found = nameOf(part.output, id);
      if (found) return found;
    }
  }
  return null;
}

/** The question on an approval card. `subject` names the item when it is known. */
export function approvalTitle(toolName: string, input: unknown, subject?: string | null): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const the = (kind: string) => (subject ? `${kind} “${subject}”` : `this ${kind}`);
  switch (toolName) {
    case 'createCampaign': return `Create campaign “${i.name ?? ''}”?`;
    case 'updateCampaign': return `Save changes to ${the('campaign')}?`;
    case 'setCampaignStatus':
      return i.status === 'paused' ? `Pause ${the('campaign')}?` : `Resume ${the('campaign')}?`;
    case 'deleteCampaign': return `Delete ${the('campaign')}?`;
    case 'createCreative': return `Add creative “${i.name ?? ''}”?`;
    case 'updateCreative': return `Save changes to ${the('creative')}?`;
    case 'deleteCreative': return `Delete ${the('creative')}?`;
    case 'updateAdSettings': return 'Update ad settings?';
    case 'createForm': return `Create lead form “${i.name ?? ''}”?`;
    case 'updateForm': return `Save changes to ${the('lead form')}?`;
    case 'setFormStatus':
      return i.status === 'active'
        ? `Activate ${the('lead form')}?`
        : i.status === 'paused'
          ? `Pause ${the('lead form')}?`
          : `Move ${the('lead form')} back to draft?`;
    case 'deleteForm': return `Delete ${the('lead form')}?`;
    default: return 'Approve this change?';
  }
}

export function approvalDetail(toolName: string): string | null {
  if (toolName === 'deleteCampaign' || toolName === 'deleteCreative' || toolName === 'deleteForm') {
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
