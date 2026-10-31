begin;

-- Only the narrowly scoped RPC can write; direct REST/GraphQL writes are denied.
drop policy "Anyone can submit reviews" on public.reviews;
revoke insert (name, rating, text) on public.reviews from anon, authenticated;
revoke all on public.reviews from public, anon, authenticated;
grant select (id, name, rating, text, created_at) on public.reviews to anon, authenticated;

create schema cookii_private;
revoke all on schema cookii_private from public, anon, authenticated;
create table cookii_private.review_submission_budget (
  singleton boolean primary key default true check (singleton),
  minute_start timestamptz not null,
  minute_count integer not null,
  day_start timestamptz not null,
  day_count integer not null
);
alter table cookii_private.review_submission_budget enable row level security;
revoke all on cookii_private.review_submission_budget from public, anon, authenticated;
insert into cookii_private.review_submission_budget
  values (true, now(), 0, now(), 0);

create index reviews_duplicate_idx on public.reviews
  (md5(lower(name) || chr(31) || text || chr(31) || rating::text), created_at desc);

-- SECURITY DEFINER is intentional: callers have no INSERT privilege. There is
-- no dynamic SQL, caller-selected identifier, or caller-controlled metadata.
create function public.submit_review(payload jsonb)
returns table (id uuid, name text, rating smallint, text text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  review_name text;
  review_text text;
  review_rating smallint;
  budget cookii_private.review_submission_budget%rowtype;
  submitted_at timestamptz := clock_timestamp();
begin
  if payload is null or jsonb_typeof(payload) <> 'object'
    or octet_length(payload::text) > 4096 then
    raise sqlstate 'PT400' using message = 'Invalid review.';
  end if;
  if not (payload ?& array['name', 'text', 'rating'])
    or (payload - array['name', 'text', 'rating']) <> '{}'::jsonb
    or jsonb_typeof(payload->'name') <> 'string'
    or jsonb_typeof(payload->'text') <> 'string'
    or jsonb_typeof(payload->'rating') <> 'number'
    or (payload->>'rating') !~ '^[1-5]$' then
    raise sqlstate 'PT400' using message = 'Invalid review.';
  end if;
  review_name := btrim(payload->>'name', E' \t\n\r');
  review_text := btrim(payload->>'text', E' \t\n\r');
  review_rating := (payload->>'rating')::smallint;
  if char_length(review_name) not between 1 and 40
    or char_length(review_text) not between 1 and 400
    or review_name !~ '[^[:space:]]' or review_text !~ '[^[:space:]]'
    or review_name ~ '[[:cntrl:]]'
    or translate(review_text, E'\t\n\r', '') ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'Invalid review.';
  end if;

  -- Global, non-spoofable safety budget; no untrusted IP header is used.
  -- Fail fast under contention instead of accumulating database lock waiters.
  if not pg_try_advisory_xact_lock(184732, 1) then
    raise sqlstate 'PT429' using message = 'Please try again later.';
  end if;
  select * into strict budget from cookii_private.review_submission_budget where singleton;
  if submitted_at >= budget.minute_start + interval '1 minute' then
    budget.minute_start := submitted_at;
    budget.minute_count := 0;
  end if;
  if submitted_at >= budget.day_start + interval '24 hours' then
    budget.day_start := submitted_at;
    budget.day_count := 0;
  end if;
  if budget.minute_count >= 5 or budget.day_count >= 100 then
    raise sqlstate 'PT429' using message = 'Please try again later.';
  end if;
  if exists (
    select 1 from public.reviews r
    where md5(lower(r.name) || chr(31) || r.text || chr(31) || r.rating::text)
      = md5(lower(review_name) || chr(31) || review_text || chr(31) || review_rating::text)
      and r.created_at > submitted_at - interval '24 hours'
  ) then
    raise sqlstate 'PT409' using message = 'This review was already submitted.';
  end if;

  update cookii_private.review_submission_budget set
    minute_start = budget.minute_start, minute_count = budget.minute_count + 1,
    day_start = budget.day_start, day_count = budget.day_count + 1
    where singleton;
  return query insert into public.reviews as r (name, rating, text)
    values (review_name, review_rating, review_text)
    returning r.id, r.name, r.rating, r.text;
end;
$$;
revoke all on function public.submit_review(jsonb) from public, anon, authenticated;
grant execute on function public.submit_review(jsonb) to anon, authenticated;

commit;
