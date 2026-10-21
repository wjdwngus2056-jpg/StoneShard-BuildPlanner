-- Apply once in the new Supabase project's SQL Editor.
begin;
create table public.published_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 30),
  summary text not null default '' check (char_length(summary) <= 240),
  character_id text not null check (character_id in ('arna','jorgrim','dirwin','jonna','velmir','mahir','leosthenes','hilda')),
  level smallint not null check (level between 1 and 30),
  trees text[] not null default '{}' check (cardinality(trees) <= 3 and trees <@ array['sword','axe','mace','dagger','two-handed-sword','two-handed-axe','two-handed-mace','spear','ranged','shield','staff','dual-wielding','athletics','survival','warfare','armored-combat','magic-mastery','pyromancy','geomancy','electromancy','arcanistics']::text[]),
  build jsonb not null check (
    jsonb_typeof(build) = 'object' and octet_length(build::text) <= 262144
    and build->>'schemaVersion' = '2'
    and build->>'characterId' = character_id and build->>'name' = title
    and jsonb_typeof(build->'events') = 'array'
    and jsonb_array_length(build->'events') <= 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index published_builds_latest on public.published_builds (created_at desc, id desc);
create index published_builds_character on public.published_builds (character_id, created_at desc, id desc);
create index published_builds_owner on public.published_builds (owner_id, created_at desc, id desc);

create function public.touch_published_build() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger published_build_updated before update on public.published_builds for each row execute function public.touch_published_build();

alter table public.published_builds enable row level security;
revoke all on public.published_builds from anon, authenticated;
grant select on public.published_builds to anon, authenticated;
grant insert (title,author_name,summary,character_id,level,trees,build) on public.published_builds to authenticated;
grant update (title,author_name,summary,character_id,level,trees,build) on public.published_builds to authenticated;
grant delete on public.published_builds to authenticated;
create policy "Anyone may read published builds" on public.published_builds for select to anon, authenticated using (true);
create policy "Authors may publish" on public.published_builds for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Authors may update their builds" on public.published_builds for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Authors may delete their builds" on public.published_builds for delete to authenticated using ((select auth.uid()) = owner_id);
commit;
