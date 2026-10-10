# Kasturi CRM backend spine

This slice turns Kasturi from a screen-only CRM shell into a database-ready module.

## Scope

Tables added:

- `crm_pipelines`
- `crm_pipeline_stages`
- `crm_contacts`
- `crm_deals`
- `crm_activities`
- `crm_notes`
- `crm_attachments`
- `crm_audit_logs`

## Workflow covered

1. A user belongs to an organisation through `org_members`.
2. The organisation owns pipelines and stages.
3. Contacts belong to the organisation.
4. Deals belong to contacts, pipelines and stages.
5. Activities, notes and attachments can sit on a contact or a deal.
6. Audit logs record important CRM changes.

## How the tables map to the Kasturi pages

The columns follow what the screens already show.

| Page | Backed by | Notes |
|---|---|---|
| Contacts | `crm_contacts` | `first_name`, `last_name`, `company`, `email`, `phone`, `country`, `status`, `lead_score`, `last_interaction_at`. The person in charge is `owner_user_id`; the display name comes from `profiles.full_name`. |
| Contacts: follow-ups | `crm_activities` | A follow-up is an activity of `type = 'task'` on a contact, with a `title` and an optional `due_at`. Marking it done sets `completed_at`. The page lists the open ones under each contact. |
| Deals | `crm_deals`, `crm_pipelines`, `crm_pipeline_stages` | A board column is a stage of the selected pipeline, in `position` order, empty ones included. A card shows the contact's `company`, `title`, `value_cents`, `tag`, the owner (`owner_user_id`, named from `profiles` like a contact's person in charge), `last_activity_at` and `expected_close_date`. People who can write add, edit, move, mark as lost, reopen and delete deals from the page. |
| Overview, Reports | read from the tables above | No tables of their own. |
| Appointments, Calendar | `appointments` (Jebat foundation) | Already on `main`; Kasturi should read the same table and not add a second one. |
| Lead Forms, Broadcast, AI Chatbot, Automations, Landing Page, Billings, Plugins, Settings, AI Agents | not in this slice | Each gets its own table when its page is wired up. |

Money is stored in cents (`value_cents bigint`), the same as `campaigns.spend_cents`.

Contact `status` values are `lead`, `contacted`, `qualified`, `customer` and `archived`. The screen labels them New Leads, Contacted, Qualified and Customer.

## How the Contacts page finds and filters

The page loads the 500 most recent contacts and their open follow-ups. Views, search, the lead score, person-in-charge, country and tag filters, and the follow-up filter all run in the browser over those rows (`src/lib/crm/contact-filters.ts`). This keeps the page quick while each database call is slow, and it works on the sample screens too.

It stops being enough once a workspace has more than 500 contacts. The next step is to move search and filtering into the database with paging, backed by indexes: a trigram or full-text index for search, a GIN index on `tags`, and composite indexes on `(org_id, status)` and `(org_id, created_at)`.

Import reads a CSV or Excel (`.xlsx`) file in the browser, lets the person match columns to fields, and sends only the matched columns. The server validates every row again, skips rows whose email is already in the workspace, and inserts the rest (`src/lib/crm/import.ts`). One file can bring in up to 500 rows.

## How the Deals page works

**Pipeline.** A workspace needs a pipeline before it can hold deals. The first time someone who can write opens the page in a workspace with none, the page creates "Sales pipeline" (`is_default`) with the stages Lead (10%), Qualified (30%), Proposal (50%), Negotiation (70%) and Won (100%) (`ensureDefaultPipeline` in `src/lib/crm/pipelines.ts`). Two tabs doing this at once is safe: a unique violation means the other one got there first. If it fails the page still loads and says so. A viewer in a workspace with no pipeline sees an explanation and no board.

**Status and stage.** A deal's `status` (`open`, `won`, `lost`) is separate from its stage.

- Moving a deal into the stage named "Won" (any capitals) sets `status = 'won'` and `won_at`. This also applies when the edit form changes the stage, and when a deal is added straight into Won.
- Moving a won deal to any other stage sets it back to `open` and clears `won_at`.
- Mark as lost sets `status = 'lost'`, `lost_at` and an optional `lost_reason` (at most 200 characters), and clears `won_at`. The deal stays in its stage.
- Reopen clears `lost_at` and `lost_reason` and sets the deal back to `open`. A lost deal that sits in the Won stage becomes `won` again, so no open deal sits in Won.
- A lost deal moved between other stages stays lost; moved into Won it is won.

**Writes.** Every write is scoped by `id` and `org_id` and sets `updated_at` and `last_activity_at`. A new deal's `pipeline_id` is read from the stage that was chosen, never taken from the form, and its creator becomes `owner_user_id`. A stage from another pipeline is refused. A contact or stage deleted meanwhile (Postgres `23503`) becomes a message beside the form. Deleting a deal also deletes its activities, notes and attachment rows, through the tables' cascades. Value is typed in ringgit and stored in cents.

**What the page loads.** The pipelines with their stages, the 500 most recent deals across every pipeline, and up to 1,000 contacts for the form's contact select. Switching pipeline, search (title, company, contact name, tag, owner), the owner filter and the status view (Open and won by default, which hides only lost deals; then Open, Won, Lost, All deals) all run in the browser over those deals (`src/lib/crm/deal-filters.ts`). Past 500 deals the page says how many it covers; the next step is the same as for Contacts, moving filtering into the database.

**Figures.** All computed from the loaded deals of the selected pipeline, not narrowed by search, owner or status view (`src/lib/crm/deal-stats.ts`): pipeline value, open deals and average deal size count open deals; win rate is won ÷ (won + lost). "Deals created vs won" covers the last eight weeks from `created_at` and `won_at`, a week being seven days ending today. The Daily Report shows deals created today, deals won today and their value, open pipeline value, and open deals whose `expected_close_date` falls within the next seven days. "Today" is the calendar day in Asia/Kuala_Lumpur.

## Consistency rules

- Deals, activities, notes and attachments reference their contact or deal by `(id, org_id)`, so a row cannot point at another workspace's record.
- A deal references its stage by `(stage_id, pipeline_id)`, so the stage always belongs to the deal's pipeline.

## Access rule

All CRM records are scoped by `org_id`.

- Org members can read.
- Org writers can create, update and delete.
- Audit logs are insert and read only, and `actor_user_id` must be the signed-in user.
- Every table carries the restrictive `mfa_required` policy and explicit grants to `authenticated`, the same shape as the Jebat foundation migration. `anon` has no access.

The migration reuses the private tenancy helper functions:

- `private.is_org_member(org_id)`
- `private.is_org_writer(org_id)`

## Not included yet

- UI wiring and server actions for pages other than Contacts and Deals
- Creating, renaming or reordering pipelines and stages (the Deals page only creates the starting pipeline)
- Changing a deal's owner, and dragging cards between stages
- Activities and notes on a deal
- Supabase Storage bucket policies
- Audit trigger functions
- Keeping `updated_at`, `last_interaction_at` and `last_activity_at` current (the write paths set them)
- Turning a Jebat lead into a Kasturi contact
- Seed demo CRM data

Those should come as smaller follow-up slices.
