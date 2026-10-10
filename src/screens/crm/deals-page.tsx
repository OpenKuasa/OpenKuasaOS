import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  createCrmDeal,
  deleteCrmDeal,
  listCrmDealContacts,
  listCrmDeals,
  markCrmDealLost,
  moveCrmDeal,
  parseCrmDealForm,
  readDealId,
  readLostReason,
  readStageId,
  reopenCrmDeal,
  updateCrmDeal,
} from '@/lib/crm/deals';
import type { CrmDealActions, CrmFormState } from '@/lib/crm/form-state';
import {
  createCrmPipeline,
  deleteCrmPipeline,
  ensureDefaultPipeline,
  listCrmPipelines,
  needsDefaultPipeline,
  parseCrmPipelineForm,
  parsePipelineName,
  readPipelineId,
  renameCrmPipeline,
  setDefaultCrmPipeline,
} from '@/lib/crm/pipelines';
import { runCrmWrite } from '@/lib/crm/run-write';
import { createClient } from '@/lib/supabase/server';
import DealsScreen from './deals';

const DEALS_PATH = '/crm/deals';

/**
 * How many deals the page loads, across every pipeline. The board, its
 * figures, search and the filters all run in the browser over these, so this
 * is also how far they reach.
 */
const DEALS_LOADED = 500;

/** How many contacts the New Deal form offers. */
const CONTACTS_OFFERED = 1000;

function runWrite(formData: FormData, failure: string, write: () => Promise<void>) {
  return runCrmWrite(DEALS_PATH, formData, failure, write);
}

async function saveDealAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId, userId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not save the deal.', async () => {
    if (formData.has('dealId')) {
      await updateCrmDeal(supabase, orgId, readDealId(formData), parseCrmDealForm(formData));
    } else {
      // Whoever adds a deal starts as its owner.
      await createCrmDeal(supabase, orgId, parseCrmDealForm(formData), userId);
    }
  });
}

async function moveDealAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not move the deal.', () =>
    moveCrmDeal(supabase, orgId, readDealId(formData), readStageId(formData)),
  );
}

async function markDealLostAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not mark the deal as lost.', () =>
    markCrmDealLost(supabase, orgId, readDealId(formData), readLostReason(formData)),
  );
}

async function reopenDealAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not reopen the deal.', () =>
    reopenCrmDeal(supabase, orgId, readDealId(formData)),
  );
}

async function deleteDealAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not delete the deal.', () =>
    deleteCrmDeal(supabase, orgId, readDealId(formData)),
  );
}

async function createPipelineAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  let id = '';
  const state = await runWrite(formData, 'Could not create the pipeline.', async () => {
    id = await createCrmPipeline(supabase, orgId, parseCrmPipelineForm(formData));
  });
  // The board switches to the pipeline it is told was made.
  return state?.ok ? { ...state, id } : state;
}

async function renamePipelineAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not rename the pipeline.', () =>
    renameCrmPipeline(
      supabase,
      orgId,
      readPipelineId(formData),
      parsePipelineName(String(formData.get('name') ?? '')),
    ),
  );
}

async function makeDefaultPipelineAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not change the default pipeline.', () =>
    setDefaultCrmPipeline(supabase, orgId, readPipelineId(formData)),
  );
}

async function deletePipelineAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not delete the pipeline.', () =>
    deleteCrmPipeline(supabase, orgId, readPipelineId(formData)),
  );
}

const ACTIONS: CrmDealActions = {
  save: saveDealAction,
  move: moveDealAction,
  markLost: markDealLostAction,
  reopen: reopenDealAction,
  remove: deleteDealAction,
  createPipeline: createPipelineAction,
  renamePipeline: renamePipelineAction,
  makeDefaultPipeline: makeDefaultPipelineAction,
  removePipeline: deletePipelineAction,
};

export default async function CrmDealsPage() {
  // No project configured (dev / preview / tests): the sample view.
  if (!hasSupabaseEnv()) return <DealsScreen />;

  // The layout already loaded the viewer for this request; this reuses it.
  const { orgId, role } = await getViewer();
  const supabase = await createClient();
  // Viewers can read deals but the database refuses their writes.
  const canWrite = role !== 'viewer';

  let live: {
    pipelines: Awaited<ReturnType<typeof listCrmPipelines>>;
    deals: Awaited<ReturnType<typeof listCrmDeals>>;
    contacts: Awaited<ReturnType<typeof listCrmDealContacts>>;
  } | null = null;
  try {
    // Fetched together: each trip to the database costs about the same.
    const [pipelines, deals, contacts] = await Promise.all([
      listCrmPipelines(supabase, orgId),
      listCrmDeals(supabase, orgId, DEALS_LOADED),
      // Only the form needs these; the board still shows if they cannot load.
      canWrite
        ? listCrmDealContacts(supabase, orgId, CONTACTS_OFFERED).catch((error) => {
            console.error('[crm/deals] could not load contacts', error);
            return [];
          })
        : [],
    ]);
    live = { pipelines, deals, contacts };
  } catch (error) {
    // The CRM migration is applied to a database separately from a deploy, so
    // the tables can be missing for a while. Keep the page up meanwhile.
    console.error('[crm/deals] could not load deals', error);
  }

  if (!live) return <DealsScreen />;

  // A workspace needs a pipeline before it can hold deals. The first person
  // who can edit sets up the starting one by opening this page.
  if (canWrite && needsDefaultPipeline(live.pipelines)) {
    try {
      await ensureDefaultPipeline(supabase, orgId);
      // `fresh`: this is the same read as above, repeated after a write.
      live.pipelines = await listCrmPipelines(supabase, orgId, { fresh: true });
    } catch (error) {
      // The page says the pipeline could not be set up; it does not fail.
      console.error('[crm/deals] could not set up the default pipeline', error);
    }
  }

  return (
    <DealsScreen
      pipelines={live.pipelines}
      deals={live.deals.deals}
      totalDeals={live.deals.total}
      contacts={live.contacts}
      actions={canWrite ? ACTIONS : undefined}
      now={new Date().toISOString()}
    />
  );
}
