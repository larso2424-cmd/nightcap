-- Add user_id to albums so hosts can find their albums after login
alter table albums add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Index for fast lookup by user
create index if not exists albums_user_id_idx on albums(user_id);

-- Allow authenticated users to see their own albums
create policy "Users can read own albums" on albums
  for select using (auth.uid() = user_id);

-- Allow authenticated users to update their own albums
create policy "Users can update own albums" on albums
  for update using (auth.uid() = user_id);
