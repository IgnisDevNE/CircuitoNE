-- Após identity.sql e collectives.sql. Não cria credencial ou sessão utilizável.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
  if current_setting('circuitone.seed_time',true) is null or not isfinite(current_setting('circuitone.seed_time')::timestamptz) then raise exception 'Seed exige referência temporal'; end if;
end $$;
insert into public.profiles(id,owner_id,kind,name,city,state_code) values
('02000000-0000-4000-8000-000000000007','01000000-0000-4000-8000-000000000005','member','Interlocutor sintético','Recife','PE') on conflict(id) do nothing;
insert into private.message_identities(id,kind,profile_id,owner_user_id,collective_id) values
('0c000000-0000-4000-8000-000000000001','profile','02000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000001',null),
('0c000000-0000-4000-8000-000000000002','profile','02000000-0000-4000-8000-000000000007','01000000-0000-4000-8000-000000000005',null),
('0c000000-0000-4000-8000-000000000003','collective',null,null,'05000000-0000-4000-8000-000000000001'),
('0c000000-0000-4000-8000-000000000004','collective',null,null,'05000000-0000-4000-8000-000000000003'),
('0c000000-0000-4000-8000-000000000005','collective',null,null,'05000000-0000-4000-8000-000000000005'),
('0c000000-0000-4000-8000-000000000006','profile',null,'01000000-0000-4000-8000-000000000005',null),
('0c000000-0000-4000-8000-000000000007','profile',null,null,null) on conflict(id) do nothing;
do $$ declare n integer; a uuid; b uuid; c uuid; m uuid; created uuid; instant timestamptz:=current_setting('circuitone.seed_time')::timestamptz;
begin
  for n in 1..6 loop
    a:=('0c000000-0000-4000-8000-'||lpad((array[1,3,4,5,6,7])[n]::text,12,'0'))::uuid;
    b:=('0c000000-0000-4000-8000-'||lpad((case when n=5 then 1 else 2 end)::text,12,'0'))::uuid;
    c:=('0d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    m:=('0e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    insert into private.conversations(id,side_a,side_b,created_at,updated_at) values(c,least(a,b),greatest(a,b),instant,instant) on conflict(id) do nothing returning id into created;
    if created is null then continue; end if;
    insert into private.messages(id,conversation_id,sender_identity_id,author_user_id,body,created_at)
      values(m,c,a,case when n=6 then null when n=5 then '01000000-0000-4000-8000-000000000005'::uuid else '01000000-0000-4000-8000-000000000001'::uuid end,'Mensagem exclusivamente sintética '||n||' 👋',instant);
    if n=2 then insert into private.conversation_blocks values(c,b,instant); end if;
    if n=1 then insert into private.conversation_reads values('01000000-0000-4000-8000-000000000005',c,m); end if;
    if n in(1,2) then
      insert into private.message_reports(id,source_message_id,reporter_user_id,reason,created_at,closed_at,resolution) values
        (('0f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=1 then m end,case when n=1 then '01000000-0000-4000-8000-000000000003'::uuid end,
        'Ensaio de denúncia',instant,case when n=2 then instant end,case when n=2 then 'Ensaio encerrado' end);
      insert into private.report_context values(('0f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,true,'Cópia sintética',instant,case when n=1 then '01000000-0000-4000-8000-000000000001'::uuid end);
    end if;
  end loop;
end $$;
insert into private.account_deletions(user_id,requested_at,identity_due_at)
  values('01000000-0000-4000-8000-000000000003',current_setting('circuitone.seed_time')::timestamptz,current_setting('circuitone.seed_time')::timestamptz+interval '30 days') on conflict(user_id) do nothing;
commit;
