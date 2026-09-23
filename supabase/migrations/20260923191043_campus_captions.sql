-- Run only in Josh's dedicated course Supabase project, after confirming ownership.
-- Never apply this to the shared class or business databases.
create table public.campus_captions (
  id bigint generated always as identity primary key,
  title text not null,
  caption text not null,
  category text not null
);
alter table public.campus_captions enable row level security;
grant select on public.campus_captions to anon, authenticated;
create policy "Public can read campus captions" on public.campus_captions
  for select to anon, authenticated using (true);
-- No public insert, update, or delete policy. These are non-sensitive demo rows.
insert into public.campus_captions (title, caption, category) values
  ('The five-minute break', 'Opened my phone to check the time. It is now a different time.', 'Study break'),
  ('Office hours', 'I understand everything except the part where I do it myself.', 'Coursework'),
  ('The group project', 'We have a group chat, a shared doc, and no shared availability.', 'Teamwork'),
  ('Library optimism', 'Brought three textbooks. Spent an hour finding the right chair.', 'Campus life'),
  ('Deadline math', 'Due tomorrow is a time zone, not a date.', 'Coursework'),
  ('Morning lecture', 'My body is present. My brain has joined remotely.', 'Campus life');
