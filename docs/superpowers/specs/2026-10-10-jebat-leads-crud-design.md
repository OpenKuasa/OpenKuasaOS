# OpenKuasa Backend — Jebat Leads CRUD + Promote Design (Slice 3)

**Status:** approved for planning (2026-10-10)
**Builds on:** slice 1 (PR #62) + slice 2 (PRs #72/#73/#75). Reuses slice 2's machinery verbatim: the `ReachData` read seam, the `src/lib/reach/capabilities.ts` single write path, two-layer access (grant ceiling + `is_org_writer` RLS), AI↔UI parity (one Zod schema → AI tool `inputSchema` **and** server action), the approval card (`toolApproval: 'user-approval'` + `sendAutomaticallyWhen`), `id`-bearing AI read tools, widget honesty states, and the demo reseed.

> **Scope was cut after a mid-brainstorm discovery.** Lead **Forms** are already built and merged by another contributor (`forms` table, `src/lib/reach/forms.ts`, `createForm`/actions, a live `lead-forms.tsx`, and a form model with `slug`/`views_count` pointing at a public form page). That contributor explicitly owns **`form_submissions` + the public form page** next (per the `reach_forms` migration comment). So this slice builds **only** the genuinely-unbuilt, Jebat-funnel parts and leaves all forms work to them.

---

## 1. Context & Goals

Jebat owns the **ad-acquisition funnel** (reach `leads`: high-volume, channel-attributed ad responses). Kasturi owns the **curated contact book** (`crm_contacts` + deals, with full CRUD at `/crm/contacts`). They are deliberately separate surfaces connected by a one-way **promote** handoff. Today reach `leads` is read-only, and the reach "Contacts" screen is a static placeholder rendering fabricated CRM-shaped data in prod.

### Goal of this slice
Make the reach lead **funnel** writable with AI↔UI parity, give it a real screen, and connect qualified leads to the CRM:
1. reach `leads` writable (create / edit / delete / advance stage).
2. A live reach-native **Lead Funnel** screen replacing the static reach "Contacts" screen.
3. A **promote lead → Kasturi contact** bridge (UI action + approval-gated AI tool), reusing Kasturi's `createCrmContact`.

### Success criteria
1. A writer can create / edit / delete / advance-stage reach leads from **both** the UI and chat (each AI write approval-gated).
2. A writer can **promote** a lead into a `crm_contacts` row (UI + approval-gated AI tool); the lead is marked promoted and cannot double-promote.
3. The reach "Contacts" nav item is replaced by a live **Lead Funnel** screen backed by real reach `leads` — removing the fake-data screen at `/reach/contacts`.
4. All new AI read tools carry `id`; the "every write tool is approval-gated" regression test passes with the new tools.
5. Kasturi's `/crm/contacts`, the shared `contacts.tsx` component, and the contributor's `forms` work are **untouched**; demo stays fresh.

---

## 2. Scope

### In scope
1. **`leads` → writable** (grants + `is_org_writer` policy) + a nullable `promoted_contact_id` column.
2. **Lead capabilities** (`capabilities.ts`): `createLead`, `updateLead`, `setLeadStage`, `deleteLead`, `promoteLeadToContact`.
3. **UI server actions** (`src/app/(app)/reach/actions.ts`): one per capability, `edit-data`-gated, same Zod schema.
4. **AI tools**: approval-gated write tools for all five; `WRITE_TOOL_NAMES` + the parity/all-gated regression tests extended; the existing leads read tool (`listContacts`) already carries `id`.
5. **Lead Funnel screen** (`src/screens/reach/leads.tsx`, NEW, reach-native): live `leads`, CRUD + stage advance + Promote; nav "Contacts" → "Lead Funnel" (slug `leads`); remove `reach/contacts` from nav + registry.
6. **Promote bridge**: `promoteLeadToContact` reuses `createCrmContact` (`@/lib/crm/contacts`), mapping lead→contact, idempotent via `promoted_contact_id`.
7. **Prompt**: `JEBAT_SYSTEM` notes the lead + promote capabilities.

### Out of scope (other contributors / modules)
- **Forms / form_submissions / public form page** — built or owned by the forms contributor. We do not touch `forms`, `src/lib/reach/forms.ts`, `lead-forms.tsx`, or the forms capability/actions. Their future `form_submissions.lead_id` will reference the `leads` we make writable — a clean handoff.
- **Kasturi's contact book, deals, pipelines** — untouched; promote only *creates* a contact (one-way), never edits CRM data.
- **Merging reach `leads` into `crm_contacts`**, bidirectional sync, editing a promoted contact from Jebat.
- Appointments / agents / reports CRUD (slice 4).

### Roadmap position
Slice 3 of 4, re-scoped. Entities: `leads` (writes + `promoted_contact_id`). Cross-module: one-way write into existing `crm_contacts`. No new tables.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|----------|--------|-----|
| Forms | **Out — owned by another contributor** | `forms` CRUD is merged; `form_submissions` + public page are explicitly their next work. Building it here duplicates/collides. |
| Leads vs contacts | **Two separate surfaces + one-way promote handoff** | Ad funnel (high-volume, mostly never convert) vs. curated contact book are different jobs; merging pollutes the CRM and couples Jebat to Kasturi's schema. The handoff is the missing piece. |
| Promote implementation | **Reuse Kasturi's `createCrmContact(client, payload)`** | Don't duplicate `crm_contacts` write logic or couple to its table; depend on its public create fn. RLS (`is_org_writer` on `crm_contacts`) already guards it; the promoter is a writer in the same org — no new grant. |
| Promote idempotency | **Nullable `leads.promoted_contact_id uuid` (no cross-schema FK)** | Marks a lead promoted + stores the contact id for a "Promoted ✓" badge and double-promote prevention, without a hard reach→crm FK (keeps module schemas decoupled). If the CRM contact is later deleted, promote re-checks that the stored contact still exists and allows re-promotion — no permanently-stuck "Promoted ✓" (see §4.2). |
| Lead extension | **No `company`/`score`/`status` on reach `leads`** | Those live on `crm_contacts`; adding them duplicates the CRM. reach `leads` stays the thin ad-funnel record. |
| Contacts screen | **Replace static `/reach/contacts` with a live reach-native Lead Funnel** | Fixes an honesty bug (prod shows fabricated CRM-shaped numbers); the CRM-shared `contacts.tsx` is left for `/crm/contacts`. |
| Everything else | **Reuse slice-2 machinery verbatim** | Capability layer, two-layer RLS, approval card, parity/all-gated tests, honesty states, `id`-in-reads. |

---

## 4. Data model

Conventions per slice-1/2. Only `leads` changes; no new tables.

### 4.1 `leads` → writable (migration `reach_leads_writes`, timestamp **after** `20261011120000_reach_forms.sql`)

```sql
alter table public.leads add column promoted_contact_id uuid;  -- set when promoted to a crm_contact; no FK (module-decoupled)
create policy leads_write on public.leads for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.leads to authenticated;
grant update (name, channel, stage, source, promoted_contact_id) on public.leads to authenticated;
grant delete on public.leads to authenticated;
```

`src/lib/reach/types.ts` `Lead` gains `promoted_contact_id: string | null`. The reach provider's `listLeads` select must add `promoted_contact_id`. Reach `leads` stage values are unchanged: `lead | contacted | qualified | booked | won`.

### 4.2 Promote mapping (`leads` → `crm_contacts`)

`promoteLeadToContact` builds a `CrmContactInsert` and calls `createCrmContact(ctx.client, payload)` (signature confirmed: `CrmContactInsert = { first_name, last_name: string|null, email, phone: string|null, company: string|null, country, status, lead_score, tags: string[], org_id, owner_user_id? }`):
- `first_name` / `last_name`: split `lead.name` on the first space (`last_name` null if no space).
- `email: ''`, `phone: null`, `company: null`, `country: ''` — ad leads rarely carry these; the CRM user fills them later.
- `status`: map reach stage → crm status (`crm_contacts.status ∈ lead|contacted|qualified|customer|archived`): `lead→lead`, `contacted→contacted`, `qualified→qualified`, `booked→qualified`, `won→customer`.
- `lead_score`: derive from stage (`lead 20, contacted 40, qualified 60, booked 80, won 100`).
- `tags: [lead.channel]` (plus `lead.source` when present) — keeps the acquisition channel visible in the CRM.
- `org_id: ctx.orgId`; `owner_user_id`: the promoting user when the surface has it (server action passes `viewer.userId`; omit otherwise).
- Then `update leads set promoted_contact_id = <new contact id> where id = lead.id and org_id = ctx.orgId`.
- **Idempotent:** if `lead.promoted_contact_id` is set **and that `crm_contacts` row still exists** (looked up scoped to the org), return `{ ok:false, error:'Already promoted to a contact.' }` without inserting. If the stored contact was deleted in CRM, re-promote (create a fresh contact + re-stamp), so a lead is never permanently stuck as promoted.

---

## 5. Capability layer (`src/lib/reach/capabilities.ts`)

Same shape as slice 2 (`ReachWriteContext {client, orgId}`, `CapResult<T>`, parse-at-boundary, `org_id` from ctx, `writeFailed()` logging). New schemas + functions:
- **Leads:** `createLeadInput` (name, channel, stage default `lead`, source optional), `updateLeadInput` (id + partial), `setLeadStageInput` (id, stage), `deleteLeadInput` (id) → `createLead`, `updateLead`, `setLeadStage`, `deleteLead`. Writes `{...input, org_id: ctx.orgId}`; update/delete `.eq('id',id).eq('org_id',ctx.orgId)`; never writes `promoted_contact_id` from user input.
- **Promote:** `promoteLeadToContactInput` (id) → `promoteLeadToContact` (reads the lead scoped to the org, checks idempotency, maps per §4.2, calls `createCrmContact`, stamps `promoted_contact_id`). Returns the new contact id. If the contact insert succeeds but the stamp fails, log and still return ok with the contact id (worst case a re-promote is blocked only by the stamp — acceptable, see §13).

---

## 6. Two surfaces over one capability

### 6.1 UI server actions (`src/app/(app)/reach/actions.ts`)
One action per capability through the existing `run(schema, input, fn)` helper (guards `!viewer.isDemo && can(viewer.role,'edit-data')`, parses, calls the capability, `revalidatePath`). Add `/reach/leads` to the revalidate set. `promoteLeadToContactAction` passes `viewer.userId` as the contact owner and additionally revalidates `/crm/contacts`.

### 6.2 AI tools (`src/lib/ai/tools.ts` + `orchestrator.ts`)
New write tools (ids-only inputs; `inputSchema` IS the capability schema): `createLead`, `updateLead`, `setLeadStage`, `deleteLead`, `promoteLeadToContact`. Each added to `WRITE_TOOL_NAMES` (so `toolApproval: 'user-approval'` covers them) and to the approval-card copy (`approvalTitle`/`approvalDetail` in `ask-jebat-hero.tsx`; promote + delete get explicit descriptions). The leads read tool `listContacts` already returns `id` (slice-2 follow-up); confirm it still does. The slice-2 all-write-tools-gated regression test (exact-set match) covers the new names automatically.

---

## 7. Screen

- **Lead Funnel** (`src/screens/reach/leads.tsx`, NEW, reach-native): live `leads` via the provider; a funnel/table with CRUD (create, edit, delete), **advance stage** (lead→…→won), and **Promote to CRM** (shows "Promoted ✓" when `promoted_contact_id` is set; the action is disabled once promoted). Write controls gated on `!viewer.isDemo && can(viewer.role,'edit-data')`; sourceless widgets honest ("Not available yet" for a real org). Reuse the slice-2 client-component pattern (`useTransition`, inline confirm for delete, `role=alert`, `rm`/types from `@/lib/reach/*` — **never** `@/lib/ai/tools`). **Nav:** reach "Contacts" item → label "Lead Funnel", slug `leads`; remove `reach/contacts` from `nav.ts` + `registry.ts`; add `reach/leads` → the new screen. **Do NOT touch** `src/screens/reach/contacts.tsx` (CRM reuses it) or the forms screens.

---

## 8. Demo seed + freshness
The demo reseed (`private.reseed_demo_reach()`, redefined by the forms contributor's `reach_forms` migration) already seeds the 342 leads. **No reseed change is required** — `promoted_contact_id` defaults null for demo leads (the Lead Funnel shows them as not-yet-promoted). Do not modify the reseed function (it is now co-owned with the forms work). The `leads_writes` migration only ALTERs grants/policy/column.

---

## 9. Data flow
**UI write:** client → server action → `getViewer` guard → Zod parse → capability (`org_id` from session) → Postgres (`is_org_writer` + grant) → `revalidatePath`. **Promote:** same, but the capability calls `createCrmContact` (RLS-guarded by `crm_contacts`' own writer policy) then stamps the lead.
**AI write:** chat → write tool (approval-gated) → card → Approve → capability (same path). `org_id` always from session, never the model.

---

## 10. Error handling
Capabilities return `{ ok:false, error }` (friendly, no raw SQL) + `console.error` the DB error (`writeFailed`). Promote surfaces "Already promoted…" and CRM errors as friendly messages. UI inline/`role=alert`; AI tool errors → brief model apology. Non-writers: no write tools / forbidden action; RLS backstops.

---

## 11. Security & Independence
- Two-layer access on `leads`; `id`/`org_id` never in an UPDATE grant; `org_id` from session.
- Promote writes `crm_contacts` only via `createCrmContact` under the caller's session (RLS `is_org_writer` on `crm_contacts`); no new grant, no cross-schema FK.
- All AI writes approval-gated; `JEBAT_SYSTEM` injection clause present; add lead + promote capability lines.
- Fictional Rimba data only; no Kuasa names in `src/`; no purple/violet.

---

## 12. Testing
- **RLS writes:** owner create/update/delete/setStage leads; cross-org denied; viewer denied.
- **Promote:** owner promotes a lead → a `crm_contacts` row exists for the org with the mapped status/score/tags; the lead's `promoted_contact_id` is set; **double-promote refused**; a second org cannot promote into the owner's org.
- **Capability/parity:** Zod validation; each new tool's `inputSchema` is the capability schema; the all-write-tools-gated regression (exact-set match) passes with the new names; `listContacts` output includes `id`.
- **Promote mapping (pure):** name split, stage→status, stage→score, channel tag.
- Reuses the slice-1/2 harness (anon sign-in → `create_org_for_current_user`; owner = writer, and a writer in an org can write both `leads` and `crm_contacts`).

---

## 13. Migration baseline & risks (plan-stage safeguards)
- Apply via `mcp__openkuasa-supabase__apply_migration`; verify `get_advisors` (expect only the by-design `auth_allow_anonymous_sign_ins` WARN on `leads`, matching campaigns/creatives).
- **`createCrmContact` is a cross-module dependency** — pin the import and the `CrmContactInsert` fields in the plan; a Kasturi change to its shape is caught by the promote capability's type-check (and a test). `email`/`country` are non-null `string` in `CrmContactFields`; pass `''` (DB columns are nullable; `''` is a valid, intentionally-empty value a CRM user later fills).
- **Promote is two non-transactional writes** (insert contact, then stamp lead). If the stamp fails after the insert, a contact exists but the lead isn't marked (risking a re-promote). Mitigation: order insert→stamp, log a stamp failure, return the contact id; a later re-promote creating a duplicate contact is a rare, low-harm edge. (A SECURITY DEFINER RPC doing both atomically is the escalation path if this ever matters.)
- **Coordination:** `leads` is still read-only on main and no lead capability exists (surveyed 2026-10-10), but the repo has several parallel contributors (forms landed mid-brainstorm). Re-check `git pull` state at plan execution; if someone else has started leads-writable, reconcile before building.

---

## 14. Affected / new files (orientation for the plan)
**New:** `supabase/migrations/<ts>_reach_leads_writes.sql`, `src/screens/reach/leads.tsx`, `src/components/reach/lead-funnel-table.tsx`, tests (`reach-leads-writes.rls.test.ts`, `reach-promote.rls.test.ts`, extend `reach-capabilities`/`reach-ai-parity`).
**Modified:** `src/lib/reach/types.ts` (Lead +`promoted_contact_id`), `src/lib/reach/supabase.ts` (listLeads select +`promoted_contact_id`), `src/lib/reach/capabilities.ts` (lead + promote), `src/app/(app)/reach/actions.ts`, `src/lib/ai/tools.ts` (+write tools), `src/lib/ai/agents/orchestrator.ts` (WRITE_TOOL_NAMES), `src/components/reach/ask-jebat-hero.tsx` (approval copy), `src/lib/ai/agents/prompts.ts`, `src/config/nav.ts` + `src/screens/registry.ts` (reach contacts→leads). **Untouched:** everything under forms (`forms.ts`, `lead-forms.tsx`, forms migration/capability/actions), `src/screens/reach/contacts.tsx`, all `crm_*`/`src/lib/crm/*` except the single `createCrmContact` import.

---

## 15. Plan ordering (enforced in the plan)
**Leads core first, then the cross-module promote, then the screen:**
1. Migration (`leads` writable + `promoted_contact_id`); types + provider select.
2. Lead capabilities (create/update/setStage/delete) + Zod + RLS write tests.
3. Lead server actions (edit-data gated) + action guard tests.
4. Lead AI write tools + `WRITE_TOOL_NAMES` + approval copy + parity/all-gated tests.
5. **Promote bridge** (capability reusing `createCrmContact` + mapping + idempotency) → action → AI tool → RLS/promote tests — the cross-module step.
6. Lead Funnel screen (live leads + CRUD + stage + Promote), nav/registry contacts→leads.
7. `JEBAT_SYSTEM` lead/promote lines; final parity/regression sweep.

**Clean mid-slice cut** (if needed): after step 4 — leads CRUD shipped as "3a"; the promote bridge + Lead Funnel screen become "3b". This slice is much tighter than slice 2, so a single run is likely fine.
