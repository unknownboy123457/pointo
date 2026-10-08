-- ====================================================================
-- LRD PointCalc — Complete Supabase Database Schema & RLS Policies
-- Execute this entire script in your Supabase Project's SQL Editor
-- ====================================================================

-- 1. PROFILES TABLE (Linked to auth.users)
-- ====================================================================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TOURNAMENTS TABLE
-- ====================================================================
create table if not exists public.tournaments (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  team_count integer not null default 12,
  game_mode text not null default 'squad',
  scoring_system text not null default 'default',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TEAMS TABLE
-- ====================================================================
create table if not exists public.teams (
  id text primary key,
  tournament_id text references public.tournaments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. PLAYERS TABLE
-- ====================================================================
create table if not exists public.players (
  id text primary key,
  team_id text references public.teams(id) on delete cascade not null,
  tournament_id text references public.tournaments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. MATCHES TABLE
-- ====================================================================
create table if not exists public.matches (
  id text primary key,
  tournament_id text references public.tournaments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  match_number integer not null default 1,
  match_name text,
  status text not null default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. MATCH RESULTS TABLE
-- ====================================================================
create table if not exists public.match_results (
  id text primary key,
  match_id text references public.matches(id) on delete cascade not null,
  tournament_id text references public.tournaments(id) on delete cascade not null,
  team_id text references public.teams(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  placement integer not null default 0,
  kills integer not null default 0,
  placement_points integer not null default 0,
  kill_points integer not null default 0,
  total_points integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ====================================================================
-- PERFORMANCE INDICES
-- ====================================================================
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_tournaments_user_id on public.tournaments(user_id);
create index if not exists idx_teams_tournament_id on public.teams(tournament_id);
create index if not exists idx_teams_user_id on public.teams(user_id);
create index if not exists idx_players_team_id on public.players(team_id);
create index if not exists idx_players_tournament_id on public.players(tournament_id);
create index if not exists idx_players_user_id on public.players(user_id);
create index if not exists idx_matches_tournament_id on public.matches(tournament_id);
create index if not exists idx_matches_user_id on public.matches(user_id);
create index if not exists idx_match_results_match_id on public.match_results(match_id);
create index if not exists idx_match_results_tournament_id on public.match_results(tournament_id);
create index if not exists idx_match_results_team_id on public.match_results(team_id);
create index if not exists idx_match_results_user_id on public.match_results(user_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) ACTIVATION
-- ====================================================================
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_results enable row level security;

-- ====================================================================
-- RLS POLICIES FOR PROFILES
-- ====================================================================
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Profiles can be inserted by owner" on public.profiles;
create policy "Profiles can be inserted by owner"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Profiles can be updated by owner" on public.profiles;
create policy "Profiles can be updated by owner"
  on public.profiles for update
  using (auth.uid() = user_id);

drop policy if exists "Profiles can be deleted by owner" on public.profiles;
create policy "Profiles can be deleted by owner"
  on public.profiles for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- RLS POLICIES FOR TOURNAMENTS
-- ====================================================================
drop policy if exists "Tournaments are viewable by owner" on public.tournaments;
create policy "Tournaments are viewable by owner"
  on public.tournaments for select
  using (auth.uid() = user_id);

drop policy if exists "Tournaments can be created by owner" on public.tournaments;
create policy "Tournaments can be created by owner"
  on public.tournaments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Tournaments can be updated by owner" on public.tournaments;
create policy "Tournaments can be updated by owner"
  on public.tournaments for update
  using (auth.uid() = user_id);

drop policy if exists "Tournaments can be deleted by owner" on public.tournaments;
create policy "Tournaments can be deleted by owner"
  on public.tournaments for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- RLS POLICIES FOR TEAMS
-- ====================================================================
drop policy if exists "Teams are viewable by owner" on public.teams;
create policy "Teams are viewable by owner"
  on public.teams for select
  using (auth.uid() = user_id);

drop policy if exists "Teams can be created by owner" on public.teams;
create policy "Teams can be created by owner"
  on public.teams for insert
  with check (auth.uid() = user_id);

drop policy if exists "Teams can be updated by owner" on public.teams;
create policy "Teams can be updated by owner"
  on public.teams for update
  using (auth.uid() = user_id);

drop policy if exists "Teams can be deleted by owner" on public.teams;
create policy "Teams can be deleted by owner"
  on public.teams for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- RLS POLICIES FOR PLAYERS
-- ====================================================================
drop policy if exists "Players are viewable by owner" on public.players;
create policy "Players are viewable by owner"
  on public.players for select
  using (auth.uid() = user_id);

drop policy if exists "Players can be created by owner" on public.players;
create policy "Players can be created by owner"
  on public.players for insert
  with check (auth.uid() = user_id);

drop policy if exists "Players can be updated by owner" on public.players;
create policy "Players can be updated by owner"
  on public.players for update
  using (auth.uid() = user_id);

drop policy if exists "Players can be deleted by owner" on public.players;
create policy "Players can be deleted by owner"
  on public.players for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- RLS POLICIES FOR MATCHES
-- ====================================================================
drop policy if exists "Matches are viewable by owner" on public.matches;
create policy "Matches are viewable by owner"
  on public.matches for select
  using (auth.uid() = user_id);

drop policy if exists "Matches can be created by owner" on public.matches;
create policy "Matches can be created by owner"
  on public.matches for insert
  with check (auth.uid() = user_id);

drop policy if exists "Matches can be updated by owner" on public.matches;
create policy "Matches can be updated by owner"
  on public.matches for update
  using (auth.uid() = user_id);

drop policy if exists "Matches can be deleted by owner" on public.matches;
create policy "Matches can be deleted by owner"
  on public.matches for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- RLS POLICIES FOR MATCH RESULTS
-- ====================================================================
drop policy if exists "Match results are viewable by owner" on public.match_results;
create policy "Match results are viewable by owner"
  on public.match_results for select
  using (auth.uid() = user_id);

drop policy if exists "Match results can be created by owner" on public.match_results;
create policy "Match results can be created by owner"
  on public.match_results for insert
  with check (auth.uid() = user_id);

drop policy if exists "Match results can be updated by owner" on public.match_results;
create policy "Match results can be updated by owner"
  on public.match_results for update
  using (auth.uid() = user_id);

drop policy if exists "Match results can be deleted by owner" on public.match_results;
create policy "Match results can be deleted by owner"
  on public.match_results for delete
  using (auth.uid() = user_id);

-- ====================================================================
-- AUTOMATIC PROFILE TRIGGER ON AUTH SIGN-UP / SIGN-IN
-- ====================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer;

-- Trigger firing on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
