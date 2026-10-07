import assert from 'node:assert/strict'

// Duas conexões PostgreSQL reais enviam imagens para a galeria do mesmo artista ao mesmo tempo: a trava da atuação serializa as
// RPCs, então a galeria fecha em exatamente 10 imagens com posições distintas e a 11ª é recusada, inclusive na disputa (RN-09).
export async function checkStorageConcurrency(query, queryAsync) {
  const user = '76000000-0000-4000-8000-000000000001'
  const profile = '76000000-0000-4000-8000-000000000002'
  const claims = `select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);`
  query(`begin;
    insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
      values('${user}','race-storage@example.invalid',now(),'558199760001',now());
    insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
      values('${user}','Sintético','71428793860','1990-01-01','Recife','PE',true,gen_random_uuid(),'test-only');
    insert into public.profiles(id,owner_id,kind,name,city,state_code) values('${profile}','${user}','artist','Race','Recife','PE');
    insert into public.artist_profiles(profile_id) values('${profile}');
    insert into storage.objects(bucket_id,name,owner_id,metadata)
      select 'public-images','${profile}/r'||n||'.png','${user}','{"size":1000,"mimetype":"image/png"}' from generate_series(0,11) n;
    commit;`)
  // Cada conexão tenta 6 imagens; a recusa da galeria cheia (22023) só pula a imagem, sem derrubar a transação.
  const attach = indexes => `begin; set local lock_timeout='20s'; set local statement_timeout='30s'; set local role authenticated; ${claims}
    do $$ declare i integer; begin
      foreach i in array array[${indexes.join(',')}] loop
        begin perform public.attach_profile_image('${profile}','gallery','${profile}/r'||i||'.png');
        exception when sqlstate '22023' then null; end;
      end loop;
    end $$; select pg_sleep(0.3); commit;`
  const results = await Promise.allSettled([[0, 2, 4, 6, 8, 10], [1, 3, 5, 7, 9, 11]].map(indexes => queryAsync(attach(indexes))))
  assert.ok(results.every(result => result.status === 'fulfilled'), JSON.stringify(results.filter(result => result.status === 'rejected').map(result => String(result.reason?.stderr))))
  query(`do $$ begin
    if (select count(*) from public.profile_images where profile_id='${profile}')<>10
      or (select count(distinct position) from public.profile_images where profile_id='${profile}' and position between 1 and 10)<>10 then
      raise exception 'Disputa pela galeria deixou contagem ou posições divergentes'; end if;
    end $$;`)
  query(`begin; delete from public.profile_images where profile_id='${profile}';
    set local storage.allow_delete_query='true'; delete from storage.objects where bucket_id='public-images' and name like '${profile}/%';
    delete from public.profiles where id='${profile}'; delete from private.storage_cleanup where profile_id='${profile}';
    delete from auth.users where id='${user}'; commit;`)
}
