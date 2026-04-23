
create table public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(username) between 1 and 32),
  wallet text not null check (char_length(wallet) between 4 and 128),
  score integer not null default 0,
  wave integer not null default 1,
  kills integer not null default 0,
  gold integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "Anyone can read leaderboard"
  on public.leaderboard for select
  using (true);

create policy "Anyone can submit a score"
  on public.leaderboard for insert
  with check (
    char_length(username) between 1 and 32
    and char_length(wallet) between 4 and 128
    and score >= 0 and score <= 1000000
  );

create index leaderboard_score_idx on public.leaderboard (score desc, created_at desc);

alter publication supabase_realtime add table public.leaderboard;
