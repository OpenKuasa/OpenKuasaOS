/**
 * The wording of an approval card: what a change is, and the name of the
 * thing it is about. Pure, so the server can word a change a specialist
 * prepared and the chat can word one it finds in a message.
 */

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
export type ItemKind =
  | 'campaign'
  | 'creative'
  | 'form'
  | 'lead'
  | 'contact'
  | 'deal'
  | 'stage';
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
  listContacts: 'lead',
  createLead: 'lead',
  updateLead: 'lead',
  setLeadStage: 'lead',
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
  deleteContact: 'contact',
  deleteDeal: 'deal',
};

/** Names by `kind:id`, so a later turn can still say what an id refers to. */
export type KnownNames = Record<string, string>;

const NAMES_MAX = 200;

function gather(value: unknown, kind: ItemKind, into: KnownNames, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 3) return;
  if (Array.isArray(value)) {
    for (const item of value) gather(item, kind, into, depth + 1);
    return;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id === 'string' && typeof row.name === 'string' && row.name.trim()) {
    if (Object.keys(into).length < NAMES_MAX) into[`${kind}:${row.id}`] = row.name.trim();
  }
  for (const inner of Object.values(row)) gather(inner, kind, into, depth + 1);
}

/** Every named row in a set of tool results, by the kind of thing its tool is about. */
export function collectNames(results: ToolResult[], into: KnownNames = {}): KnownNames {
  for (const result of results) {
    const kind = KIND_OF_TOOL[result.tool];
    if (kind) gather(result.output, kind, into);
  }
  return into;
}

/** What a tool returned, by the tool's name. */
export type ToolResult = { tool: string; output: unknown };

/** Looks up the name of a row by its id, optionally only among results of one kind. */
export type NameFinder = (id: unknown, kind?: ItemKind) => string | null;

/**
 * Finds the name of a row by its id. A change tool is given ids, and the
 * assistant got each id from an earlier tool result (a listing, or the row it
 * created), so the name is there too. With a `kind`, only results about that
 * kind of thing count: an id that belongs to a contact must never put the
 * contact's name on a card about a deal. Later results win.
 */
export function nameIn(results: ToolResult[]): NameFinder {
  return (id, kind) => {
    if (typeof id !== 'string' || !id) return null;
    for (let r = results.length - 1; r >= 0; r -= 1) {
      if (kind && KIND_OF_TOOL[results[r].tool] !== kind) continue;
      const found = nameOf(results[r].output, id);
      if (found) return found;
    }
    return null;
  };
}

/**
 * The question on an approval card. `named` is either the name of the item
 * the change is about, or a way to look names up by id; without it the card
 * falls back to "this campaign".
 */
export function approvalTitle(
  toolName: string,
  input: unknown,
  named?: string | null | NameFinder,
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
    case 'createLead': return `Create lead “${i.name ?? ''}”?`;
    case 'updateLead': return `Save changes to ${the('lead', 'lead')}?`;
    case 'setLeadStage': return `Move ${the('lead', 'lead')} to “${i.stage ?? ''}”?`;
    case 'deleteLead': return `Delete ${the('lead', 'lead')}?`;
    case 'promoteLeadToContact': return `Promote ${the('lead', 'lead')} to a CRM contact?`;
    default: return 'Approve this change?';
  }
}

export function approvalDetail(toolName: string): string | null {
  if (toolName === 'deleteContact') return 'Their deals are deleted too. This cannot be undone.';
  if (
    toolName === 'deleteCampaign' ||
    toolName === 'deleteCreative' ||
    toolName === 'deleteForm' ||
    toolName === 'deleteDeal' ||
    toolName === 'deleteLead'
  ) {
    return 'This cannot be undone.';
  }
  return null;
}
