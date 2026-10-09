-- Week 4: AI-captioned photos and votes.
-- A generation is one uploaded photo plus the exact prompt sent to Gemini.
-- Each generation owns a few captions; signed-in users vote once per caption.

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path text not null unique check (split_part(image_path, '/', 1) = user_id::text),
  prompt text not null check (char_length(prompt) <= 4000),
  model text not null check (char_length(model) <= 80),
  theme text not null check (char_length(theme) <= 80),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now()
);
create index generations_feed_idx on public.generations (status, created_at desc);
create index generations_user_idx on public.generations (user_id, created_at desc);

create table public.generated_captions (
  id bigint generated always as identity primary key,
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  body text not null check (char_length(body) between 1 and 280),
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  created_at timestamptz not null default now(),
  unique (generation_id, position)
);
create index generated_captions_user_idx on public.generated_captions (user_id);

create table public.caption_votes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  caption_id bigint not null references public.generated_captions(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, caption_id)
);
create index caption_votes_caption_idx on public.caption_votes (caption_id);

alter table public.generations enable row level security;
alter table public.generated_captions enable row level security;
alter table public.caption_votes enable row level security;

revoke all on public.generations, public.generated_captions, public.caption_votes from anon, authenticated;

-- The feed is public; drafts and failures stay with their owner.
grant select on public.generations to anon, authenticated;
grant insert (image_path, prompt, model, theme) on public.generations to authenticated;
grant update (status) on public.generations to authenticated;
create policy "Read finished generations" on public.generations for select to anon, authenticated
  using (status = 'ready' or (select auth.uid()) = user_id);
create policy "Create own generation" on public.generations for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');
create policy "Finish own pending generation" on public.generations for update to authenticated
  using ((select auth.uid()) = user_id and status = 'pending')
  with check ((select auth.uid()) = user_id and status in ('ready', 'failed'));

-- Counters are maintained by the vote trigger, never written by users.
grant select on public.generated_captions to anon, authenticated;
grant insert (generation_id, position, body) on public.generated_captions to authenticated;
create policy "Read captions of visible generations" on public.generated_captions for select to anon, authenticated
  using (exists (select 1 from public.generations g where g.id = generation_id));
create policy "Add captions to own pending generation" on public.generated_captions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.generations g where g.id = generation_id and g.user_id = (select auth.uid()) and g.status = 'pending')
  );

-- Who voted how is private; only totals are public.
grant select, delete on public.caption_votes to authenticated;
grant insert (caption_id, value) on public.caption_votes to authenticated;
grant update (value) on public.caption_votes to authenticated;
create policy "Read own votes" on public.caption_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Vote as yourself" on public.caption_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.generated_captions c join public.generations g on g.id = c.generation_id where c.id = caption_id and g.status = 'ready')
  );
create policy "Change own vote" on public.caption_votes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Remove own vote" on public.caption_votes for delete to authenticated
  using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Cost guard: five generations per person and 100 overall per rolling day,
-- counted before Gemini is called. Failed attempts still count.
create function private.limit_generations() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('generations'));
  if (select count(*) from public.generations where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'generation_limit' using errcode = 'P0001', hint = 'Five photos per day.';
  end if;
  if (select count(*) from public.generations where created_at > now() - interval '1 day') >= 100 then
    raise exception 'generation_limit' using errcode = 'P0001', hint = 'The app has reached today''s limit.';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_generations() from public, anon, authenticated;
create trigger limit_generations before insert on public.generations for each row execute function private.limit_generations();

create function private.count_vote() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.generated_captions set
      upvotes = upvotes - (old.value = 1)::int,
      downvotes = downvotes - (old.value = -1)::int
    where id = old.caption_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.generated_captions set
      upvotes = upvotes + (new.value = 1)::int,
      downvotes = downvotes + (new.value = -1)::int
    where id = new.caption_id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.count_vote() from public, anon, authenticated;
create trigger count_vote after insert or update or delete on public.caption_votes for each row execute function private.count_vote();

-- Photos are public by URL (the feed is public) but not listable; uploads only into your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snaps', 'snaps', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']);
create policy "Upload own snap" on storage.objects for insert to authenticated
  with check (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own snap" on storage.objects for delete to authenticated
  using (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select auth.uid())::text);
