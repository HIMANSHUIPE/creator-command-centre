-- Creator Command Centre: core schema
-- Every table is scoped to a workspace. Members get a role (owner, admin, editor, viewer)
-- so more people can be added later without changing the data model.
-- OAuth tokens live in a table with RLS on and NO client policies: only edge functions
-- (service role) can read them, and they are stored AES-GCM encrypted with a key that
-- exists only as an edge function secret.

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.platform as enum ('instagram', 'youtube');
create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.content_format as enum ('reel', 'short', 'video', 'post', 'carousel', 'story', 'live');
create type public.calendar_status as enum ('idea', 'draft', 'ready', 'scheduled', 'published', 'repurpose');
create type public.deal_type as enum ('paid', 'barter', 'affiliate', 'hybrid');
create type public.payment_status as enum ('not_due', 'invoiced', 'pending', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.account_status as enum ('active', 'needs_reauth', 'error', 'disconnected');

-- ---------- Workspaces and membership ----------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Creator Studio',
  niche text default 'Children''s education',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  default_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Role helpers (security definer so policies don't recurse into workspace_members RLS)
create or replace function public.has_workspace_role(ws uuid, min_role public.member_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and case min_role
            when 'viewer' then true
            when 'editor' then m.role in ('owner','admin','editor')
            when 'admin'  then m.role in ('owner','admin')
            when 'owner'  then m.role = 'owner'
          end
  );
$$;

-- New user => profile + personal workspace where they are owner
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces (name) values ('My Creator Studio') returning id into ws;
  insert into public.profiles (id, display_name, default_workspace_id)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), ws);
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Connected accounts ----------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.platform not null,
  external_id text not null,              -- IG user id or YouTube channel id
  handle text,
  display_name text,
  avatar_url text,
  status public.account_status not null default 'active',
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

-- Service-role only. Ciphertext format: base64(iv).base64(ciphertext) (AES-256-GCM)
create table public.oauth_tokens (
  account_id uuid primary key references public.social_accounts(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now()
);

-- Short-lived CSRF state for OAuth round trips. Service-role only.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.platform not null,
  redirect_to text,
  created_at timestamptz not null default now()
);

-- ---------- Metrics (daily snapshots) ----------
create table public.account_daily_metrics (
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  date date not null,
  followers integer,                       -- IG followers / YT subscribers (end of day)
  followers_gained integer,
  followers_lost integer,
  views bigint,
  reach bigint,
  accounts_engaged integer,
  profile_visits integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  watch_time_minutes numeric,
  avg_view_duration_s numeric,
  source text not null default 'api',      -- 'api' or 'snapshot' (derived from daily total diff)
  primary key (account_id, date)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform public.platform not null,
  external_id text not null,
  title text,
  caption text,
  format public.content_format not null default 'reel',
  category text,                           -- auto-tagged or user-set topic
  published_at timestamptz,
  permalink text,
  thumbnail_url text,
  duration_s integer,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);

-- Lifetime totals captured each sync day, so growth per post can be charted.
create table public.content_metrics_snapshots (
  content_id uuid not null references public.content_items(id) on delete cascade,
  date date not null,
  views bigint,
  reach bigint,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  followers_gained integer,
  watch_time_minutes numeric,
  avg_view_duration_s numeric,
  avg_view_percentage numeric,
  primary key (content_id, date)
);

create view public.content_latest with (security_invoker = true) as
select distinct on (c.id)
  c.*, s.date as metrics_date, s.views, s.reach, s.likes, s.comments, s.shares, s.saves,
  s.followers_gained, s.watch_time_minutes, s.avg_view_duration_s, s.avg_view_percentage
from public.content_items c
left join public.content_metrics_snapshots s on s.content_id = c.id
order by c.id, s.date desc nulls last;

create table public.sync_runs (
  id bigint generated always as identity primary key,
  account_id uuid references public.social_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',  -- running | ok | partial | error
  items_synced integer default 0,
  error text
);

-- ---------- Planning and business ----------
create table public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  platform public.platform not null,
  format public.content_format not null default 'reel',
  category text,
  planned_date date not null,
  status public.calendar_status not null default 'draft',
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 high, 3 low
  hook text,
  caption text,
  script text,
  hashtags text[],
  content_id uuid references public.content_items(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_collaborations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  collaboration_type text,                 -- e.g. Dedicated Reel, Integration, Story set
  deal_type public.deal_type not null default 'paid',
  currency text not null default 'INR',
  quoted_amount numeric,
  final_amount numeric,
  deliverables text,
  campaign_deadline date,
  payment_status public.payment_status not null default 'not_due',
  stage text not null default 'lead',      -- lead | negotiating | confirmed | live | completed | lost
  performance_notes text,
  linked_content_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,                      -- strategist | ideas | projection | report_summary
  question text,
  data_snapshot jsonb,                     -- the actual numbers sent to the model
  response jsonb not null,                 -- { facts: [...], predictions: [...], ... }
  model text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period text not null check (period in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, period, period_start)
);

-- ---------- Indexes ----------
create index on public.social_accounts (workspace_id);
create index on public.account_daily_metrics (date);
create index on public.content_items (account_id, published_at desc);
create index on public.content_metrics_snapshots (date);
create index on public.calendar_items (workspace_id, planned_date);
create index on public.brand_collaborations (workspace_id, campaign_deadline);
create index on public.ai_insights (workspace_id, created_at desc);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger calendar_touch before update on public.calendar_items for each row execute function public.touch_updated_at();
create trigger brands_touch before update on public.brand_collaborations for each row execute function public.touch_updated_at();

-- ---------- Row level security ----------
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.social_accounts enable row level security;
alter table public.oauth_tokens enable row level security;     -- no policies: service role only
alter table public.oauth_states enable row level security;     -- no policies: service role only
alter table public.account_daily_metrics enable row level security;
alter table public.content_items enable row level security;
alter table public.content_metrics_snapshots enable row level security;
alter table public.sync_runs enable row level security;
alter table public.calendar_items enable row level security;
alter table public.brand_collaborations enable row level security;
alter table public.ai_insights enable row level security;
alter table public.reports enable row level security;

create policy "members read workspace" on public.workspaces for select using (public.has_workspace_role(id, 'viewer'));
create policy "admins update workspace" on public.workspaces for update using (public.has_workspace_role(id, 'admin'));

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "update own profile" on public.profiles for update using (id = auth.uid());

create policy "members read membership" on public.workspace_members for select using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "owners manage membership" on public.workspace_members for all
  using (public.has_workspace_role(workspace_id, 'owner')) with check (public.has_workspace_role(workspace_id, 'owner'));

create policy "members read accounts" on public.social_accounts for select using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "admins update accounts" on public.social_accounts for update using (public.has_workspace_role(workspace_id, 'admin'));
create policy "admins delete accounts" on public.social_accounts for delete using (public.has_workspace_role(workspace_id, 'admin'));

create policy "members read daily metrics" on public.account_daily_metrics for select using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.has_workspace_role(a.workspace_id, 'viewer')));
create policy "members read content" on public.content_items for select using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.has_workspace_role(a.workspace_id, 'viewer')));
create policy "editors tag content" on public.content_items for update using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.has_workspace_role(a.workspace_id, 'editor')));
create policy "members read content metrics" on public.content_metrics_snapshots for select using (
  exists (select 1 from public.content_items c join public.social_accounts a on a.id = c.account_id
          where c.id = content_id and public.has_workspace_role(a.workspace_id, 'viewer')));
create policy "members read sync runs" on public.sync_runs for select using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.has_workspace_role(a.workspace_id, 'viewer')));

-- Planning tables: viewers read, editors write
do $$
declare t text;
begin
  foreach t in array array['calendar_items','brand_collaborations','ai_insights','reports'] loop
    execute format('create policy "members read %1$s" on public.%1$I for select using (public.has_workspace_role(workspace_id, ''viewer''))', t);
    execute format('create policy "editors insert %1$s" on public.%1$I for insert with check (public.has_workspace_role(workspace_id, ''editor''))', t);
    execute format('create policy "editors update %1$s" on public.%1$I for update using (public.has_workspace_role(workspace_id, ''editor''))', t);
    execute format('create policy "editors delete %1$s" on public.%1$I for delete using (public.has_workspace_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
