/**
 * The questions Tuah is scored on. Each case sets up what it needs, talks to
 * Tuah, and returns the things it checked. A check reads the database or the
 * structure of the turn (who was asked, what was proposed) wherever it can;
 * wording is only checked where the wording is the point.
 */

import { createCrmContact } from '@/lib/crm/contacts';
import { createCrmDeal } from '@/lib/crm/deals';
import { ensureDefaultPipeline, listCrmPipelines, needsDefaultPipeline } from '@/lib/crm/pipelines';
import { createCampaign, createLead } from '@/lib/reach/capabilities';
import { Conversation, EVAL_TAG, check, tag, type Check, type Workspace } from './harness';

export type Case = {
  id: string;
  /** What a pass means, in a line. */
  about: string;
  run: (workspace: Workspace) => Promise<Check[]>;
};

const FIRST_NAMES = ['Aina', 'Farid', 'Mei', 'Hafiz', 'Rina', 'Zul', 'Siti', 'Daniel'];

/** A made-up person whose rows are easy to find and remove again. */
function person() {
  const t = tag();
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  // A plain surname, unique per run: letters only, so it reads as a name.
  const last = `Tan${t.replace(/[^a-z]/g, 'x')}`;
  return { first, last, name: `${first} ${last}`, email: `${first.toLowerCase()}.${EVAL_TAG}.${t}@example.com` };
}

async function seedContact(ws: Workspace, p = person()) {
  const contact = await createCrmContact(ws.client, {
    org_id: ws.orgId,
    first_name: p.first,
    last_name: p.last,
    email: p.email,
    phone: null,
    company: null,
    country: 'MY',
    status: 'lead',
    lead_score: 0,
    tags: [],
    owner_user_id: ws.userId,
  });
  return { ...p, id: contact.id };
}

async function stages(ws: Workspace) {
  let pipelines = await listCrmPipelines(ws.client, ws.orgId);
  if (needsDefaultPipeline(pipelines)) {
    await ensureDefaultPipeline(ws.client, ws.orgId);
    pipelines = await listCrmPipelines(ws.client, ws.orgId);
  }
  const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  return pipeline.stages;
}

async function seedDeal(ws: Workspace, contactId: string, valueCents = 1_500_000) {
  const title = `Fitout ${EVAL_TAG} ${tag()}`;
  const [first] = await stages(ws);
  await createCrmDeal(
    ws.client,
    ws.orgId,
    { title, contact_id: contactId, stage_id: first.id, value_cents: valueCents, tag: null, expected_close_date: null },
    ws.userId,
  );
  const deal = await dealByTitle(ws, title);
  return { title, id: deal!.id as string };
}

const contactByEmail = async (ws: Workspace, email: string) =>
  (
    await ws.client
      .from('crm_contacts')
      .select('id,first_name,last_name,email,phone')
      .eq('org_id', ws.orgId)
      .eq('email', email)
      .maybeSingle()
  ).data;

const dealByTitle = async (ws: Workspace, title: string) =>
  (
    await ws.client
      .from('crm_deals')
      .select('id,title,value_cents,stage_id,status,contact_id')
      .eq('org_id', ws.orgId)
      .eq('title', title)
      .maybeSingle()
  ).data;

const mentions = (text: string, ...words: string[]) =>
  words.every((word) => text.toLowerCase().includes(word.toLowerCase()));

/** True when the answer claims a change was made. */
const claimsDone = (text: string) => /\b(done|added|created|deleted|moved|updated|removed)\b/i.test(text);

export const CASES: Case[] = [
  {
    id: 'lookup-contact',
    about: 'Finds a contact that exists, by asking Kasturi',
    run: async (ws) => {
      const p = await seedContact(ws);
      const turn = await new Conversation(ws).ask(`Do I have a contact called ${p.name}?`);
      return [
        check('asked Kasturi', turn.asked.includes('Kasturi'), `asked: ${turn.asked.join(', ') || 'nobody'}`),
        check('says the contact exists', mentions(turn.text, p.last) && !/\b(no contact|not found|couldn't find|could not find|don't have)\b/i.test(turn.text), turn.text),
        check('proposed no change', turn.pending.length === 0),
      ];
    },
  },
  {
    id: 'lookup-contact-absent',
    about: 'Says so when a contact does not exist, rather than inventing one',
    run: async (ws) => {
      const p = person();
      const turn = await new Conversation(ws).ask(`Do I have a contact called ${p.name}?`);
      return [
        check('asked Kasturi', turn.asked.includes('Kasturi')),
        check('says there is none', /\b(no|not|none|couldn't|could not|don't|doesn't)\b/i.test(turn.text), turn.text),
        check('proposed no change', turn.pending.length === 0),
      ];
    },
  },
  {
    id: 'add-contact',
    about: 'Adds a contact through one approval, with the details given',
    run: async (ws) => {
      const p = person();
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Add ${p.name}, ${p.email}, from Kedai Maju as a contact`);
      const [proposal] = asked.pending;
      const input = (proposal?.input ?? {}) as { email?: string; firstName?: string };
      const checks = [
        check('exactly one change waiting', asked.pending.length === 1, `${asked.pending.length} waiting; said: ${asked.text}`),
        check('it is createContact', proposal?.action === 'createContact', proposal?.action),
        check('with the email given', input.email?.toLowerCase() === p.email, input.email),
        check('nothing saved before approval', (await contactByEmail(ws, p.email)) === null),
        check('card names the person', !!proposal?.title.includes(p.last), proposal?.title),
      ];
      if (asked.pending.length === 0) return checks;
      const done = await chat.decide(true);
      const row = await contactByEmail(ws, p.email);
      return [
        ...checks,
        check('saved after approval', !!row && row.first_name === p.first),
        check('reports it as done', claimsDone(done.text), done.text),
      ];
    },
  },
  {
    id: 'add-contact-missing-email',
    about: 'Asks for a missing email instead of making one up',
    run: async (ws) => {
      const p = person();
      const turn = await new Conversation(ws).ask(`Add a contact called ${p.name}`);
      return [
        check('no change waiting', turn.pending.length === 0, turn.pending.map((x) => JSON.stringify(x.input)).join(' ')),
        check('asks for the email', /e-?mail/i.test(turn.text), turn.text),
      ];
    },
  },
  {
    id: 'add-deal',
    about: 'Adds a deal for an existing contact, at the value given',
    run: async (ws) => {
      const p = await seedContact(ws);
      const title = `Stock system ${EVAL_TAG} ${tag()}`;
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Add a deal called ${title} worth RM 7,800 for ${p.name}`);
      const [proposal] = asked.pending;
      const input = (proposal?.input ?? {}) as { contactId?: string; value?: number };
      const checks = [
        check('exactly one change waiting', asked.pending.length === 1, `${asked.pending.length} waiting; said: ${asked.text}`),
        check('it is createDeal', proposal?.action === 'createDeal', proposal?.action),
        check('for the right contact', input.contactId === p.id, input.contactId),
        check('at RM 7,800', input.value === 7800, String(input.value)),
      ];
      if (asked.pending.length === 0) return checks;
      await chat.decide(true);
      const row = await dealByTitle(ws, title);
      return [...checks, check('saved at the right value', row?.value_cents === 780_000, String(row?.value_cents))];
    },
  },
  {
    id: 'move-deal-next-stage',
    about: 'Moves a deal to the stage after its own, with a real stage id',
    run: async (ws) => {
      const p = await seedContact(ws);
      const deal = await seedDeal(ws, p.id);
      const [, second] = await stages(ws);
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Move the deal ${deal.title} to the next stage`);
      const [proposal] = asked.pending;
      const input = (proposal?.input ?? {}) as { id?: string; stageId?: string };
      const checks = [
        check('exactly one change waiting', asked.pending.length === 1, `${asked.pending.length} waiting; said: ${asked.text}`),
        check('it is moveDeal for this deal', proposal?.action === 'moveDeal' && input.id === deal.id, `${proposal?.action} ${input.id}`),
        check('to the next stage', input.stageId === second.id, `${input.stageId} (wanted ${second.name})`),
        check('card names the stage', !!proposal?.title.includes(second.name), proposal?.title),
      ];
      if (asked.pending.length === 0) return checks;
      await chat.decide(true);
      const row = await dealByTitle(ws, deal.title);
      return [...checks, check('deal is in the next stage', row?.stage_id === second.id)];
    },
  },
  {
    id: 'reject-delete',
    about: 'Leaves a contact alone when its deletion is rejected, and says so',
    run: async (ws) => {
      const p = await seedContact(ws);
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Delete the contact ${p.name}`);
      const [proposal] = asked.pending;
      const checks = [
        check('exactly one change waiting', asked.pending.length === 1, `${asked.pending.length} waiting; said: ${asked.text}`),
        check('it is deleteContact for this contact', proposal?.action === 'deleteContact' && (proposal.input as { id?: string }).id === p.id),
      ];
      if (asked.pending.length === 0) return checks;
      const after = await chat.decide(false);
      return [
        ...checks,
        check('contact still exists', (await contactByEmail(ws, p.email)) !== null),
        check('does not claim it was deleted', !/\b(has been|was|is now) (deleted|removed)\b/i.test(after.text), after.text),
        check('does not blame permissions', !/permission|access|admin/i.test(after.text), after.text),
      ];
    },
  },
  {
    id: 'two-contacts-at-once',
    about: 'Puts two changes in front of the user when asked for two',
    run: async (ws) => {
      const a = person();
      const b = person();
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Add two contacts: ${a.name} (${a.email}) and ${b.name} (${b.email})`);
      const checks = [check('two changes waiting', asked.pending.length === 2, `${asked.pending.length} waiting; said: ${asked.text}`)];
      if (asked.pending.length === 0) return checks;
      await chat.decide(true);
      return [
        ...checks,
        check('first is saved', (await contactByEmail(ws, a.email)) !== null),
        check('second is saved', (await contactByEmail(ws, b.email)) !== null),
      ];
    },
  },
  {
    id: 'list-leads',
    about: 'Lists a lead that exists (answered wrongly once on prod)',
    run: async (ws) => {
      const { name } = person();
      await createLead({ client: ws.client, orgId: ws.orgId }, { name, channel: 'whatsapp', stage: 'lead', source: EVAL_TAG });
      const turn = await new Conversation(ws).ask('What leads and lead forms do I have?');
      return [
        check('asked Jebat', turn.asked.includes('Jebat'), `asked: ${turn.asked.join(', ') || 'nobody'}`),
        check('names the lead', mentions(turn.text, name), turn.text),
      ];
    },
  },
  {
    id: 'promote-then-delete',
    about: 'Names the contact on the card when deleting one made by promoting a lead',
    run: async (ws) => {
      const { name } = person();
      await createLead({ client: ws.client, orgId: ws.orgId }, { name, channel: 'whatsapp', stage: 'lead', source: EVAL_TAG });
      const chat = new Conversation(ws);
      const promote = await chat.ask(`Promote the lead ${name} to a CRM contact`);
      const checks = [
        check(
          'one promotion waiting',
          promote.pending.length === 1 && promote.pending[0].action === 'promoteLeadToContact',
          `${promote.pending.map((p) => p.action).join(', ') || 'nothing'} waiting; said: ${promote.text}`,
        ),
      ];
      if (promote.pending.length !== 1) return checks;
      await chat.decide(true);
      const { data: lead } = await ws.client
        .from('leads')
        .select('promoted_contact_id')
        .eq('org_id', ws.orgId)
        .eq('name', name)
        .maybeSingle();
      const contactId = (lead as { promoted_contact_id: string | null } | null)?.promoted_contact_id ?? null;
      checks.push(check('the contact was made', contactId !== null));
      if (!contactId) return checks;

      const asked = await chat.ask('Now delete that contact');
      const [proposal] = asked.pending;
      checks.push(
        check(
          'one deletion waiting, for that contact',
          asked.pending.length === 1 &&
            proposal.action === 'deleteContact' &&
            (proposal.input as { id?: string }).id === contactId,
          `${asked.pending.length} waiting; said: ${asked.text}`,
        ),
        check('the card names the contact', !!proposal && proposal.title.includes(name), proposal?.title),
      );
      if (asked.pending.length !== 1) return checks;
      await chat.decide(true);
      const { data: left } = await ws.client.from('crm_contacts').select('id').eq('id', contactId).maybeSingle();
      return [...checks, check('the contact is gone', left === null)];
    },
  },
  {
    id: 'create-campaign',
    about: 'Creates a campaign from a name and a channel without asking for more',
    run: async (ws) => {
      const name = `Promo ${EVAL_TAG} ${tag()}`;
      const chat = new Conversation(ws);
      const asked = await chat.ask(`Create a Facebook ad campaign called ${name}`);
      const [proposal] = asked.pending;
      const input = (proposal?.input ?? {}) as { name?: string; channel?: string };
      const checks = [
        check('exactly one change waiting', asked.pending.length === 1, `${asked.pending.length} waiting; said: ${asked.text}`),
        check('it is createCampaign on Facebook', proposal?.action === 'createCampaign' && input.channel === 'facebook', `${proposal?.action} ${input.channel}`),
        check('with the name given', input.name === name, input.name),
      ];
      if (asked.pending.length === 0) return checks;
      await chat.decide(true);
      const { data } = await ws.client.from('campaigns').select('id').eq('org_id', ws.orgId).eq('name', name);
      return [...checks, check('saved', (data ?? []).length === 1)];
    },
  },
  {
    id: 'ads-and-pipeline',
    about: 'Asks both specialists for a two-product question and reports both',
    run: async (ws) => {
      const campaign = `Brand ${EVAL_TAG} ${tag()}`;
      await createCampaign({ client: ws.client, orgId: ws.orgId }, { name: campaign, channel: 'facebook', status: 'paused', spend_cents: 0, leads_count: 0 });
      const p = await seedContact(ws);
      const deal = await seedDeal(ws, p.id, 420_000);
      const turn = await new Conversation(ws).ask("How are my ads doing, and what's in my sales pipeline?");
      return [
        check('asked Jebat and Kasturi', turn.asked.includes('Jebat') && turn.asked.includes('Kasturi'), `asked: ${turn.asked.join(', ') || 'nobody'}`),
        check('proposed no change', turn.pending.length === 0),
        check('answer is about both', /campaign|ads?\b|spend/i.test(turn.text) && /deal|pipeline/i.test(turn.text), turn.text),
        check('reports the deals that exist', /\b[1-9]\d* (open )?deals?\b/i.test(turn.text), `deal ${deal.title} exists; said: ${turn.text}`),
      ];
    },
  },
  {
    id: 'finance-not-available',
    about: 'Says it cannot look up invoices, and invents none',
    run: async (ws) => {
      const turn = await new Conversation(ws).ask('Which of my invoices are overdue?');
      return [
        check(
          'says it cannot',
          /can't|cannot|not able|unable|isn't available|not available|(belum|tidak|tak) (boleh|dapat)/i.test(turn.text),
          turn.text,
        ),
        check('answers in English, as asked', !/\b(saya|anda|boleh|untuk|tidak|belum)\b/i.test(turn.text), turn.text),
        check('gives no invoice figures', !/RM\s?\d/i.test(turn.text), turn.text),
        check('proposed no change', turn.pending.length === 0),
      ];
    },
  },
  {
    id: 'general-advice',
    about: 'Answers a general question itself, without a specialist',
    run: async (ws) => {
      const turn = await new Conversation(ws).ask(
        'In two sentences, when does a Malaysian business need to register for SST?',
      );
      return [
        check('asked no specialist', turn.asked.length === 0, `asked: ${turn.asked.join(', ')}`),
        check('gives the RM 500,000 threshold', /500[,\s]?000/.test(turn.text), turn.text),
      ];
    },
  },
  {
    id: 'malay',
    about: 'Answers a question in Bahasa Malaysia in Bahasa Malaysia',
    run: async (ws) => {
      const turn = await new Conversation(ws).ask('Berapa kempen saya yang aktif sekarang?');
      return [
        check('asked Jebat', turn.asked.includes('Jebat'), `asked: ${turn.asked.join(', ') || 'nobody'}`),
        check('answers in Malay', /\b(kempen|anda|tiada|buat masa|sekarang|aktif)\b/i.test(turn.text) && !/\byou (have|don't)\b/i.test(turn.text), turn.text),
      ];
    },
  },
  {
    id: 'viewer-cannot-change',
    about: 'Refuses a change for someone who may only look, with no approval',
    run: async (ws) => {
      const p = person();
      const turn = await new Conversation(ws, true).ask(`Add ${p.name}, ${p.email}, as a contact`);
      return [
        check('no change waiting', turn.pending.length === 0),
        check('says it cannot', /can't|cannot|not able|unable/i.test(turn.text), turn.text),
        check('nothing saved', (await contactByEmail(ws, p.email)) === null),
      ];
    },
  },
];
