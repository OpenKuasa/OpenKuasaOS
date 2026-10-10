import { stageStatusPatch, type CrmDeal } from '@/lib/crm/deals';
import { isWonStage, type CrmPipelineStage } from '@/lib/crm/pipelines';

/** A card dropped on a stage, before the server has answered. */
export type DealMove = {
  dealId: string;
  /** The stage it was dropped on. */
  stage: Pick<CrmPipelineStage, 'id' | 'name'>;
  /** When it was dropped, as an ISO string. */
  at: string;
};

/** Whether dropping a deal on a stage would move it: not onto the stage it is in. */
export function canDropDeal(
  deal: Pick<CrmDeal, 'stageId'> | null | undefined,
  stageId: string,
): boolean {
  return Boolean(deal) && deal?.stageId !== stageId;
}

/**
 * The deals as the board shows them straight after a drop, ahead of the
 * server: the deal sits in its new stage with the status the move will give
 * it, by the same rules the write uses. Every other deal is untouched, and a
 * deal that is not there, or is already in that stage, changes nothing.
 */
export function applyDealMove(deals: CrmDeal[], move: DealMove): CrmDeal[] {
  const deal = deals.find((d) => d.id === move.dealId);
  if (!deal || !canDropDeal(deal, move.stage.id)) return deals;

  const patch = stageStatusPatch(deal.status, isWonStage(move.stage.name), move.at);
  const moved: CrmDeal = {
    ...deal,
    stageId: move.stage.id,
    status: patch.status ?? deal.status,
    wonAt: patch.won_at === undefined ? deal.wonAt : patch.won_at,
    lostAt: patch.lost_at === undefined ? deal.lostAt : patch.lost_at,
    lostReason: patch.lost_reason === undefined ? deal.lostReason : patch.lost_reason,
    // The edit form, if opened meanwhile, starts on the new stage.
    ...(deal.form ? { form: { ...deal.form, stageId: move.stage.id } } : {}),
  };
  return deals.map((d) => (d.id === move.dealId ? moved : d));
}
