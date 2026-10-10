-- Lekir slice 2c: what the public apply form asks for. Four switches on the
-- workspace's settings row, all off until a workspace turns them on. The
-- row's policies (members read, writers write) already cover them; only the
-- list of columns a writer may update needs widening.

alter table public.hire_settings
  add column require_cv boolean not null default false,
  add column require_cover_letter boolean not null default false,
  add column ask_portfolio boolean not null default false,
  add column ask_expected_salary boolean not null default false;

grant update (require_cv, require_cover_letter, ask_portfolio, ask_expected_salary) on public.hire_settings to authenticated;
