drop table if exists photos cascade;
drop table if exists albums cascade;

create table albums (
  id text primary key,
  host_token_hash text not null,
  name text not null,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 days',
  deleted_at timestamptz
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  album_id text references albums(id) on delete cascade not null,
  name text not null,
  guest_token_hash text not null,
  created_at timestamptz default now()
);

create table media (
  id uuid primary key default gen_random_uuid(),
  album_id text references albums(id) on delete cascade not null,
  guest_id uuid references guests(id) on delete cascade not null,
  r2_key text not null,
  thumb_key text,
  type text not null check (type in ('photo', 'video')),
  mime text not null,
  size_bytes bigint,
  width int,
  height int,
  created_at timestamptz default now(),
  deleted_at timestamptz,
  report_count int default 0
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  media_id uuid references media(id) on delete cascade not null,
  reason text,
  created_at timestamptz default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  album_id text,
  guest_id uuid,
  name text not null,
  created_at timestamptz default now(),
  meta jsonb
);

alter table albums enable row level security;
alter table guests enable row level security;
alter table media enable row level security;
alter table reports enable row level security;
alter table events enable row level security;

create policy "Anyone can read albums" on albums for select using (true);
create policy "Anyone can read guests" on guests for select using (true);
create policy "Anyone can join as guest" on guests for insert with check (true);
create policy "Anyone can view media" on media for select using (deleted_at is null);
create policy "Anyone can upload media" on media for insert with check (true);
create policy "Anyone can report" on reports for insert with check (true);
create policy "Anyone can log events" on events for insert with check (true);
