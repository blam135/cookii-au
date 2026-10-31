-- Executes under real API roles. All test data and budget changes roll back.
begin;
update cookii_private.review_submission_budget set minute_start=now(), minute_count=0, day_start=now(), day_count=0;
set local role anon;
do $$
declare
  sample jsonb := jsonb_build_object('name', 'Security test', 'rating', 5, 'text', 'Test ' || gen_random_uuid());
  result record;
  bad jsonb;
begin
  foreach bad in array array[
    'null'::jsonb, '[]'::jsonb, '{}'::jsonb,
    sample || '{"rating":0}', sample || '{"rating":6}', sample || '{"rating":1.5}',
    sample || '{"rating":"5"}', sample || '{"name":null}', sample || '{"name":true}',
    sample || '{"name":"   "}', sample || jsonb_build_object('name', repeat('x',41)),
    sample || jsonb_build_object('text', repeat('x',401)),
    sample || jsonb_build_object('name', E'a\nb'),
    sample || jsonb_build_object('text', E'a\001b'),
    sample || '{"id":"00000000-0000-0000-0000-000000000000"}',
    sample || '{"created_at":"2000-01-01"}', sample || '{"approved":true}'
  ] loop
    begin
      perform public.submit_review(bad);
      raise exception 'Invalid payload accepted: %', bad;
    exception when sqlstate 'PT400' then null;
    end;
  end loop;
  begin
    insert into public.reviews(name,rating,text) values ('Forbidden',5,'Forbidden');
    raise exception 'Direct insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.reviews set text='Forbidden' where false;
    raise exception 'Update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.reviews where false;
    raise exception 'Delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from cookii_private.review_submission_budget;
    raise exception 'Private budget exposed';
  exception when insufficient_privilege then null; end;

  select * into strict result from public.submit_review(sample);
  if result.text <> sample->>'text' then raise exception 'Round trip failed'; end if;
  begin
    perform public.submit_review(sample);
    raise exception 'Duplicate accepted';
  exception when sqlstate 'PT409' then null; end;

  -- SQL and HTML payloads are data, not code. Verify exact storage and table survival.
  sample := jsonb_build_object('name', 'Injection test', 'rating', 4,
    'text', '<script>alert(1)</script> ''); DROP TABLE public.reviews; -- ' || gen_random_uuid());
  select * into strict result from public.submit_review(sample);
  if result.text <> sample->>'text' then raise exception 'Literal text changed'; end if;
  perform count(*) from public.reviews;
  for i in 1..3 loop
    perform public.submit_review(jsonb_build_object('name','Budget test','rating',5,'text',gen_random_uuid()::text));
  end loop;
  begin
    perform public.submit_review(jsonb_build_object('name','Over budget','rating',5,'text',gen_random_uuid()::text));
    raise exception 'Minute budget bypassed';
  exception when sqlstate 'PT429' then null; end;
end;
$$;
reset role;
update cookii_private.review_submission_budget set minute_start=now()-interval '2 minutes', day_count=100;
set local role authenticated;
do $$
begin
  begin
    insert into public.reviews(name,rating,text) values ('Forbidden',5,'Forbidden');
    raise exception 'Authenticated direct insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_review('{"name":"Daily limit test","rating":5,"text":"Daily limit test"}');
    raise exception 'Daily budget bypassed';
  exception when sqlstate 'PT429' then null; end;
end;
$$;
reset role;
rollback;
