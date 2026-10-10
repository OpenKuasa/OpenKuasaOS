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
| Deals | `crm_deals`, `crm_pipelines`, `crm_pipeline_stages` | A board column is a stage. A card shows the contact's `company`, `title`, `value_cents`, `tag`, the owner and `last_activity_at`. |
| Overview, Reports | read from the tables above | No tables of their own. |
| Appointments, Calendar | `appointments` (Jebat foundation) | Already on `main`; Kasturi should read the same table and not add a second one. |
| Lead Forms, Broadcast, AI Chatbot, Automations, Landing Page, Billings, Plugins, Settings, AI Agents | not in this slice | Each gets its own table when its page is wired up. |

Money is stored in cents (`value_cents bigint`), the same as `campaigns.spend_cents`.

Contact `status` values are `lead`, `contacted`, `qualified`, `customer` and `archived`. The screen labels them New Leads, Contacted, Qualified and Customer.

## How the Contacts page finds and filters

The page loads the 500 most recent contacts and their open follow-ups. Views, search, the lead score, person-in-charge, country and tag filters, and the follow-up filter all run in the browser over those rows (`src/lib/crm/contact-filters.ts`). This keeps the page quick while each database call is slow, and it works on the sample screens too.

It stops being enough once a workspace has more than 500 contacts. The next step is to move search and filtering into the database with paging, backed by indexes: a trigram or full-text index for search, a GIN index on `tags`, and composite indexes on `(org_id, status)` and `(org_id, created_at)`.

Import reads a CSV or Excel (`.xlsx`) file in the browser, lets the person match columns to fields, and sends only the matched columns. The server validates every row again, skips rows whose email is already in the workspace, and inserts the rest (`src/lib/crm/import.ts`). One file can bring in up to 500 rows.

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

- UI wiring
- Server actions
- CSV import
- Supabase Storage bucket policies
- Audit trigger functions
- Keeping `updated_at`, `last_interaction_at` and `last_activity_at` current (the write paths set them)
- Turning a Jebat lead into a Kasturi contact
- Seed demo CRM data

Those should come as smaller follow-up slices.
