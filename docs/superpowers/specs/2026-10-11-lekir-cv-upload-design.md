# OpenKuasa Backend — Lekir CV Upload Design (slice 2e)

**Date:** 2026-10-11
**Status:** Draft for review
**Module:** Lekir (`hire`)
**Milestone:** Lekir slice 2, piece 2e of 6 — applicants can upload a PDF CV.
**Builds on:** 2d (`2026-10-11-lekir-public-apply-form-design.md`). 2e cannot start until 2d is merged.

---

## 1. Context & Goals

After 2d an applicant gives a CV as a link. Many applicants have a file, not a link. This
piece lets the apply form take a PDF as well, kept in private storage that only the
workspace can read. It is the riskiest piece of slice 2: strangers writing files.

### Goal
On the apply form, "CV" accepts a link or a PDF up to 5 MB. A recruiter can open the file
from the Applications screen. Nobody outside the workspace can read or list it.

### Success criteria
- A stranger can add one PDF to their own new application and nothing else: no reads, no
  listing, no overwriting, no other file type.
- "Require a CV" is met by a link or a file.
- A refused application stores no file.
- A file is removed when its application or job is deleted.

---

## 2. Scope

### In scope
1. A private storage bucket `hire-cvs` and its policies.
2. A `cv_path` column on `hire_applications`.
3. The apply form's CV field accepts a file or a link; the server action stores the file.
4. "View CV" on the Applications screen, through a short-lived signed link.
5. Lekir can say whether an application has a CV file.
6. Cleanup of files for deleted applications.

### Out of scope
- Lekir reading the file's contents (2f).
- Word documents, images, multiple files, virus scanning, text extraction.
- Replacing a CV after applying.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Who writes the file | The server action, with the service-role client, after its own checks | `anon` gets no storage policy at all. A stranger never talks to storage; the server decides. The service-role key is already used server-side by the agent worker. |
| Order of operations | Validate everything, upload, then call the submit function with the path; delete the file if the function refuses | A refused application must leave no file. |
| File type | PDF only, checked by its first bytes (`%PDF-`) as well as its declared type | A renamed file must not get in. |
| Size | 5 MB, checked before upload and capped by the bucket | Large enough for a CV, small enough to bound abuse. |
| Path | `<org_id>/<job_id>/<random uuid>.pdf` | The org id leads, so the read policy can scope by it; the name is unguessable and never derived from the upload's filename. |
| Reading | Signed link, 5 minutes, made on click | No public links; a copied link expires. |
| Rate limit | The same per-job limit as 2d, checked before the upload | So the limit also bounds storage writes. |

---

## 4. Data model and storage

Migration `hire_cv_upload`:

- `alter table public.hire_applications add column cv_path text;`
- Bucket `hire-cvs`: private, `file_size_limit` 5 MB, `allowed_mime_types`
  `{application/pdf}`.
- One policy on `storage.objects`: members of the workspace may `select` objects in
  `hire-cvs` whose first path segment is their org id
  (`private.is_org_member((storage.foldername(name))[1]::uuid)`), with the restrictive MFA
  policy pattern the other buckets use. No insert, update or delete policy for
  `authenticated` or `anon`: writes and deletes happen only with the service role. The plan
  must read the existing `agent_assets_select` and `chat_attachments_*` policies and follow
  their form.
- `submit_public_application` gains `p_cv_path text default null`. It accepts the path only
  when it matches `^<p_org_id>/<p_job_id>/[0-9a-f-]{36}\.pdf$`, so a caller cannot point an
  application at another workspace's file. `require_cv` is met when either `cv_url` or
  `cv_path` is present. On a repeat application (nothing inserted) it returns `ok_duplicate`
  to the server action, which is how the action knows to remove the file it just uploaded;
  the visitor still sees the same thank-you.

### Cleanup
- A trigger on `hire_applications` after delete records the `cv_path` in
  `private.hire_cv_deletions` (path, deleted_at). Postgres cannot delete storage objects
  safely from SQL, so a server routine removes them: `src/lib/hire/cv-cleanup.ts`, run by
  the existing scheduled route pattern (`/api/agents/poll` is service-key authed; the plan
  adds `/api/hire/cv-cleanup` the same way) and wired to the same scheduler.
- The demo workspace has no uploads, since its board cannot be switched on.

---

## 5. Code

### 5.1 `src/lib/hire/cv-store.ts` (server only)
- `isPdf(bytes)`: true when the first five bytes are `%PDF-`.
- `storeCv(service, orgId, jobId, file)`: checks size and type, uploads to a new random
  path with `upsert: false`, returns the path.
- `removeCv(service, path)`.
- `signedCvUrl(client, path)`: a 5-minute signed link made with the *member's* client, so
  RLS on storage decides whether they may read it.

### 5.2 Apply action
`applyAction` (2d) changes: read the file from the form data; if present, validate it; run
the 2d field validation; check the job is accepting (a cheap pre-check through
`get_public_job`) so obviously refused requests upload nothing; upload; call the submit
function with `p_cv_path`; if the answer is anything but `ok`, remove the file. The request
body limit for this route is raised to 6 MB; read the Next.js guide for server action body
size in `node_modules/next/dist/docs/` first.

### 5.3 The form's CV field
- One field group labelled "CV" with two ways to give it: a file input and a link input,
  with "or" between them. When `require_cv` is on the group is marked required and its
  helper text says "Upload a PDF or paste a link". When it is off, the group is shown as
  optional.
- The file input is a real `<input type="file" accept="application/pdf">` with a visible
  label; a styled button may sit over it but the native control stays focusable. It states
  "PDF, up to 5 MB" before the user chooses, not after they fail.
- After choosing: the file's name and size are shown with a "Remove" button; a wrong type
  or an oversize file is refused at once, under the field, with the fix ("Choose a PDF
  file" / "This file is 7.2 MB. Choose one under 5 MB.").
- While sending, the button shows "Sending…" and, where the browser supports it, upload
  progress; the form cannot be submitted twice.
- If the upload fails, what the applicant typed is kept and the message says the
  application was not sent.
- Without JavaScript the plain file input and form post still work.

### 5.4 Inside the app
- **Applications screen:** the details panel shows "View CV" when `cv_path` is set. It is a
  button that asks the server for a signed link and opens it in a new tab; it shows a
  pending state, and a failure says "Couldn't open the CV. Try again." If both a file and a
  link exist, both are shown.
- **Server action** `viewCvAction(applicationId)`: checks the application belongs to the
  caller's workspace, then returns `signedCvUrl`.
- **`listApplications` tool:** with `includeContact`, adds `has_cv_file: boolean`. It never
  returns the path or a link.

---

## 6. Error handling
- Any storage failure → the application is not sent and nothing is recorded.
- A file removed by cleanup but still referenced (should not happen) → "View CV" says the
  file is no longer available.
- Cleanup failures are logged and retried on the next run; the deletions table keeps the
  row until the object is gone.

---

## 7. Testing
- **`cv-store.ts`:** `isPdf` on a PDF, a renamed text file, an empty file; size limit; path
  shape; never uses the upload's filename.
- **Migration** (text): bucket private with the limit and type; a select policy only; no
  write policy for `anon` or `authenticated`; the path check in the function.
- **Storage, live:** as `anon`: cannot upload, read, list or delete in `hire-cvs`. As a
  member of workspace A: can sign a link for A's file, cannot for B's. As a viewer: can
  read (it is a read). Test files are removed afterwards.
- **Function, live:** a path for another org or job is refused; `require_cv` met by a path
  alone; a duplicate returns `ok_duplicate`.
- **Action:** a refused application leaves no object; a duplicate leaves no object; a
  non-PDF and an oversize file are refused before upload.
- **Cleanup:** deleting an application records the path; the routine removes the object and
  the record.
- **Form:** the field group's labels, the required mark, the stated limits, the chosen-file
  summary and Remove; errors under the field.
- **Smoke, local then production:** apply with a PDF from a private window; open it from
  the Applications screen; confirm the signed link stops working after it expires; try a
  renamed `.txt`; delete the test application and confirm the object goes on the next
  cleanup run.

---

## 8. Security & Independence
- No storage policy lets a stranger do anything. The only writer is the server, after
  checks.
- Files are served only through signed links, with `Content-Disposition: attachment` or an
  explicit `application/pdf` type and never rendered inline in the app's origin.
- The stored name is random; the original filename is not kept, so it cannot carry
  personal data or path tricks.
- A PDF can still contain anything. It is never executed, parsed or fetched from by the
  server in this piece.

---

## 9. Delivery
Branch from `main` after 2d merges. One migration, applied before the merge deploys after a
yes. The scheduler entry for cleanup is an operator step, listed in the pull request. One
pull request.

## 10. Affected / new files
- **New:** one migration; `src/lib/hire/{cv-store,cv-cleanup}.ts`;
  `src/app/api/hire/cv-cleanup/route.ts`; tests.
- **Changed:** `src/lib/hire/{types,supabase,public-applications}.ts`;
  `src/app/careers/[orgId]/[jobId]/{actions.ts,apply-form.tsx}`;
  `src/app/(app)/hire/actions.ts`; `src/screens/hire/application-details.tsx`;
  `src/lib/ai/hire-tools.ts`.
