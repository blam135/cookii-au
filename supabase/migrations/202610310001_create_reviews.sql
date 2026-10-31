begin;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name ~ '[^[:space:]]'),
  rating smallint not null check (rating between 1 and 5),
  text text not null check (char_length(text) between 1 and 400 and text ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);

create index reviews_created_at_idx on public.reviews (created_at desc, id desc);
alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (name, rating, text) on public.reviews to anon, authenticated;

create policy "Anyone can read reviews" on public.reviews
  for select to anon, authenticated using (true);
create policy "Anyone can submit reviews" on public.reviews
  for insert to anon, authenticated with check (true);

commit;
