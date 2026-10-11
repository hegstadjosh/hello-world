-- Week 5: "Beat the AI." Anyone signed in can add one caption of their own to
-- any finished photo, where it competes with the AI's captions for votes.
-- AI captions keep positions 1-3; a caption without a position was written by a person.

alter table public.generated_captions alter column position drop not null;
alter table public.generated_captions add constraint human_caption_length
  check (position is not null or char_length(body) <= 120);
create unique index generated_captions_one_human_per_user
  on public.generated_captions (generation_id, user_id) where position is null;

-- AI captions go only on the poster's own pending generation, as before.
alter policy "Add captions to own pending generation" on public.generated_captions
  with check (
    (select auth.uid()) = user_id
    and position is not null
    and exists (select 1 from public.generations g where g.id = generation_id and g.user_id = (select auth.uid()) and g.status = 'pending')
  );
create policy "Add your own caption to a finished photo" on public.generated_captions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and position is null
    and exists (select 1 from public.generations g where g.id = generation_id and g.status = 'ready')
  );
grant delete on public.generated_captions to authenticated;
create policy "Remove your own caption" on public.generated_captions for delete to authenticated
  using ((select auth.uid()) = user_id and position is null);

-- No voting on a caption you wrote yourself.
alter policy "Vote as yourself" on public.caption_votes
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.generated_captions c join public.generations g on g.id = c.generation_id
      where c.id = caption_id and g.status = 'ready' and not (c.position is null and c.user_id = (select auth.uid()))
    )
  );

-- Posters can take a finished photo down. The row stays, marked removed, so it
-- still counts toward the daily limit; its captions disappear with it.
alter table public.generations drop constraint generations_status_check;
alter table public.generations add constraint generations_status_check
  check (status in ('pending', 'ready', 'failed', 'removed'));
-- USING is only 'ready', so this policy can never revive a failed generation.
create policy "Take down own generation" on public.generations for update to authenticated
  using ((select auth.uid()) = user_id and status = 'ready')
  with check ((select auth.uid()) = user_id and status = 'removed');

-- The stronger caption model costs about $0.007 a photo, so the shared daily
-- cap drops from 100 to 30. Five per person stays.
create or replace function private.limit_generations() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('generations'));
  if (select count(*) from public.generations where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'generation_limit' using errcode = 'P0001', hint = 'Five photos per day.';
  end if;
  if (select count(*) from public.generations where created_at > now() - interval '1 day') >= 30 then
    raise exception 'generation_limit' using errcode = 'P0001', hint = 'The app has reached today''s limit.';
  end if;
  return new;
end;
$$;
