-- =============================================================================
-- PADRE65 EVENTS — RSVP storage
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Idempotent: safe to re-run.
-- =============================================================================

-- Safe to run inside a project that already hosts another application: this
-- file only ever creates objects prefixed `event_rsvps` or `padre65_`.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.event_rsvps (
  id               uuid primary key default gen_random_uuid(),
  event_slug       text        not null,
  first_name       text        not null,
  last_name        text        not null,
  rsvp_status      text        not null,
  additional_guests jsonb      not null default '[]'::jsonb,
  party_size       smallint    not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.event_rsvps is
  'Guest responses for Padre65 events. Written only by the server-side service role.';
comment on column public.event_rsvps.additional_guests is
  'JSONB array of {first_name, last_name}. Maximum 3 entries.';
comment on column public.event_rsvps.party_size is
  'Server-calculated. 0 when declined, otherwise 1 + additional guests.';

-- -----------------------------------------------------------------------------
-- Guest-array validator.
--
-- CHECK constraints cannot contain subqueries, so per-element validation lives
-- in an IMMUTABLE function that the constraint calls.
-- -----------------------------------------------------------------------------
create or replace function public.padre65_guests_valid(g jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when g is null then false
    when pg_catalog.jsonb_typeof(g) <> 'array' then false
    when pg_catalog.jsonb_array_length(g) > 3 then false
    else coalesce(
      (
        select pg_catalog.bool_and(
          pg_catalog.jsonb_typeof(e) = 'object'
          and coalesce(pg_catalog.btrim(e ->> 'first_name'), '') <> ''
          and coalesce(pg_catalog.btrim(e ->> 'last_name'), '') <> ''
          and pg_catalog.char_length(e ->> 'first_name') <= 80
          and pg_catalog.char_length(e ->> 'last_name') <= 80
          -- Only the two expected keys are permitted.
          and (select count(*) from pg_catalog.jsonb_object_keys(e)) = 2
        )
        from pg_catalog.jsonb_array_elements(g) as e
      ),
      true -- empty array
    )
  end;
$$;

-- -----------------------------------------------------------------------------
-- Constraints — the database is the last line of defence, after Zod.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_status_check') then
    alter table public.event_rsvps
      add constraint event_rsvps_status_check
      check (rsvp_status in ('attending', 'declined'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_slug_check') then
    alter table public.event_rsvps
      add constraint event_rsvps_slug_check
      check (char_length(event_slug) between 1 and 120);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_first_name_check') then
    alter table public.event_rsvps
      add constraint event_rsvps_first_name_check
      check (char_length(btrim(first_name)) between 1 and 80);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_last_name_check') then
    alter table public.event_rsvps
      add constraint event_rsvps_last_name_check
      check (char_length(btrim(last_name)) between 1 and 80);
  end if;

  -- additional_guests must be a JSON array of at most three entries.
  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_guests_is_array') then
    alter table public.event_rsvps
      add constraint event_rsvps_guests_is_array
      check (jsonb_typeof(additional_guests) = 'array');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_guests_max_three') then
    alter table public.event_rsvps
      add constraint event_rsvps_guests_max_three
      check (jsonb_array_length(additional_guests) <= 3);
  end if;

  -- Every entry must be an object carrying a non-empty first and last name.
  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_guests_shape') then
    alter table public.event_rsvps
      add constraint event_rsvps_guests_shape
      check (public.padre65_guests_valid(additional_guests));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_party_size_range') then
    alter table public.event_rsvps
      add constraint event_rsvps_party_size_range
      check (party_size between 0 and 4);
  end if;

  -- Party size must agree with the response.
  if not exists (select 1 from pg_constraint where conname = 'event_rsvps_party_size_matches_status') then
    alter table public.event_rsvps
      add constraint event_rsvps_party_size_matches_status
      check (
        (rsvp_status = 'declined'
          and party_size = 0
          and jsonb_array_length(additional_guests) = 0)
        or
        (rsvp_status = 'attending'
          and party_size between 1 and 4
          and party_size = 1 + jsonb_array_length(additional_guests))
      );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Indexes — the dashboard sorts by submission time within one event.
-- -----------------------------------------------------------------------------
create index if not exists event_rsvps_slug_created_idx
  on public.event_rsvps (event_slug, created_at desc);

create index if not exists event_rsvps_status_idx
  on public.event_rsvps (event_slug, rsvp_status);

-- -----------------------------------------------------------------------------
-- updated_at trigger
--
-- Deliberately prefixed. `set_updated_at` is the name Supabase's own docs use,
-- so an existing project very likely already has one — and `create or replace`
-- would silently overwrite it and break that project's other triggers. Every
-- object this migration creates is namespaced so the file is safe to run inside
-- a database that is already doing something else.
-- -----------------------------------------------------------------------------
create or replace function public.padre65_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_rsvps_set_updated_at on public.event_rsvps;
create trigger event_rsvps_set_updated_at
  before update on public.event_rsvps
  for each row execute function public.padre65_set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- RLS is enabled and NO policies are created. That is deliberate: with RLS on
-- and zero policies, every request made with the anon or authenticated key is
-- denied for select, insert, update and delete. Only the service-role key —
-- which lives exclusively on the server and bypasses RLS — can touch this data.
--
-- Do not add a policy here to "make realtime work". The dashboard uses
-- authenticated server-side polling instead, precisely so this stays closed.
-- -----------------------------------------------------------------------------
alter table public.event_rsvps enable row level security;
alter table public.event_rsvps force row level security;

-- Belt and braces: revoke the default grants the API roles receive.
revoke all on public.event_rsvps from anon, authenticated;

-- =============================================================================
-- Verification (optional — run manually)
-- =============================================================================
-- Each of these must FAIL:
--   insert into public.event_rsvps (event_slug, first_name, last_name, rsvp_status, party_size)
--     values ('x', 'A', 'B', 'maybe', 1);                      -- bad status
--   insert into public.event_rsvps (event_slug, first_name, last_name, rsvp_status, additional_guests, party_size)
--     values ('x', 'A', 'B', 'declined', '[{"first_name":"C","last_name":"D"}]'::jsonb, 0);
--   insert into public.event_rsvps (event_slug, first_name, last_name, rsvp_status, additional_guests, party_size)
--     values ('x', 'A', 'B', 'attending', '[]'::jsonb, 3);      -- size disagrees
