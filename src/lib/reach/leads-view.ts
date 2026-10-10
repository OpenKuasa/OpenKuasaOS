import type { Lead } from '@/lib/reach/types';

/**
 * A promoted lead stores the CRM contact's id in `promoted_contact_id`, and the
 * Lead Funnel shows it as "Promoted ✓". There is no FK, so a contact deleted in
 * Kasturi leaves that id dangling. For display, treat a lead whose contact no
 * longer exists as unpromoted, so the owner can promote it again (the promote
 * capability re-checks existence and makes a fresh contact).
 */
export function clearDanglingPromotions(
  leads: Lead[],
  existingContactIds: ReadonlySet<string>,
): Lead[] {
  return leads.map((lead) =>
    lead.promoted_contact_id && !existingContactIds.has(lead.promoted_contact_id)
      ? { ...lead, promoted_contact_id: null }
      : lead,
  );
}
