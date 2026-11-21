-- Metsämyynti: vahvan tunnistautumisen kirjaus, omat tiedot ja perukirjat

-- Uusi omistaja liittyy, kun ilmoitus jo odottaa hänen hyväksyntäänsä: lähetä pyyntö hänelle.
create function private.deliver_pending_approvals(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select l.id, coalesce(l.title, 'Ilmoitus') as title
    from public.listing_approvals a
    join public.listings l on l.id = a.listing_id
    join public.profiles p on p.identity_hash = a.identity_hash
    where p.id = p_user and a.decision = 'odottaa' and l.status = 'odottaa_hyvaksyntaa'
      and not exists (select 1 from public.notifications n where n.user_id = p_user
                      and n.kind = 'hyvaksyntapyynto' and n.payload ->> 'listing_id' = l.id::text)
  loop
    perform private.notify(p_user, 'hyvaksyntapyynto', 'Hyväksyntäpyyntö: ' || r.title,
      'Yhteisomistaja haluaa julkaista myynti-ilmoituksen yhteisestä kiinteistöstänne. Tarkista ja hyväksy tai hylkää.',
      jsonb_build_object('listing_id', r.id), 'listing_events');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.deliver_pending_approvals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vahva tunnistautuminen (kutsuu vain strong-auth-callback-palvelinfunktio)
-- ---------------------------------------------------------------------------
-- Tallentaa tunnistautumisen, sitoo henkilön tiliin (ensimmäisellä kerralla), hakee
-- omistukset testirekisteristä (testitilassa) ja toimittaa odottavat kiinnostukset.
-- MML-tilassa palvelinfunktio kutsuu tämän jälkeen store_mml_ownerships().
create function public.record_strong_auth(
  p_user uuid, p_hetu text, p_verified_name text,
  p_purpose public.strong_auth_purpose, p_provider text, p_method text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := private.identity_hash(p_hetu);
  v_current text;
  v_props integer := null;
  v_delivered integer := 0;
  v_source text := private.setting('ownership_source');
begin
  select identity_hash into v_current from public.profiles where id = p_user for update;
  if not found then raise exception 'Profiilia ei löydy'; end if;
  if v_current is not null and v_current <> v_hash then
    raise exception 'Tili on jo sidottu toiseen henkilöön' using hint = 'TILI_TOISELLA_HENKILOLLA';
  end if;
  if exists (select 1 from public.profiles where identity_hash = v_hash and id <> p_user) then
    raise exception 'Henkilöllisyys on jo liitetty toiseen tiliin' using hint = 'HENKILO_TOISELLA_TILILLA';
  end if;

  update public.profiles
  set identity_hash = v_hash, verified_name = p_verified_name, strong_auth_at = now()
  where id = p_user;
  insert into public.identity_verifications (user_id, purpose, provider, method)
  values (p_user, p_purpose, p_provider, p_method);

  if v_source = 'testi' then
    v_props := private.sync_ownerships_from_test_registry(v_hash);
    v_delivered := private.deliver_pending_interests(p_user);
  end if;
  perform private.deliver_pending_approvals(p_user);

  return jsonb_build_object('ownership_source', v_source, 'owner_rows', v_props,
                            'interests_delivered', v_delivered);
end $$;
revoke all on function public.record_strong_auth(uuid, text, text, public.strong_auth_purpose, text, text)
  from public, anon, authenticated;
grant execute on function public.record_strong_auth(uuid, text, text, public.strong_auth_purpose, text, text)
  to service_role;

-- MML-tila: palvelinfunktio välittää lainhuutotiedot (rivimuoto: ks. private.replace_ownerships).
create function public.store_mml_ownerships(p_user uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_props integer;
begin
  select identity_hash into v_hash from public.profiles where id = p_user;
  if v_hash is null then raise exception 'Käyttäjä ei ole tunnistautunut vahvasti'; end if;
  v_props := private.replace_ownerships(v_hash, p_rows, 'mml');
  perform private.deliver_pending_approvals(p_user);
  return jsonb_build_object('owner_rows', v_props,
                            'interests_delivered', private.deliver_pending_interests(p_user));
end $$;
revoke all on function public.store_mml_ownerships(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_mml_ownerships(uuid, jsonb) to service_role;

-- Palvelinfunktiot: OIDC-istunnon tila (private-skeema ei näy REST-rajapinnassa).
create function public.strong_auth_session_create(
  p_user uuid, p_purpose public.strong_auth_purpose, p_state text, p_nonce text,
  p_code_verifier text, p_return_to text
) returns void
language sql security definer set search_path = '' as $$
  delete from private.strong_auth_sessions where created_at < now() - interval '1 day';
  insert into private.strong_auth_sessions (state, user_id, purpose, nonce, code_verifier, return_to)
  values (p_state, p_user, p_purpose, p_nonce, p_code_verifier, p_return_to);
$$;

-- Palauttaa ja kuluttaa istunnon (kelpaa kerran, 10 minuuttia).
create function public.strong_auth_session_consume(p_state text)
returns table (user_id uuid, purpose public.strong_auth_purpose, nonce text, code_verifier text, return_to text)
language sql security definer set search_path = '' as $$
  update private.strong_auth_sessions s set consumed_at = now()
  where s.state = p_state and s.consumed_at is null and s.created_at > now() - interval '10 minutes'
  returning s.user_id, s.purpose, s.nonce, s.code_verifier, s.return_to
$$;
revoke all on function public.strong_auth_session_create(uuid, public.strong_auth_purpose, text, text, text, text),
  public.strong_auth_session_consume(text) from public, anon, authenticated;
grant execute on function public.strong_auth_session_create(uuid, public.strong_auth_purpose, text, text, text, text),
  public.strong_auth_session_consume(text) to service_role;

-- ---------------------------------------------------------------------------
-- Omat tiedot (UI)
-- ---------------------------------------------------------------------------
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'display_name', p.display_name,
    'kind', p.kind,
    'is_seller', p.identity_hash is not null,
    'verified_name', p.verified_name,
    'strong_auth_at', p.strong_auth_at,
    'step_up_valid_until', case when p.strong_auth_at is not null
        then p.strong_auth_at + make_interval(mins => private.setting('step_up_minutes')::int) end,
    'step_up_valid', private.has_recent_strong_auth(p.id),
    'prefs', to_jsonb(np) - 'user_id' - 'updated_at',
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = p.id and n.read_at is null),
    'pending_approvals', (select count(*) from public.listing_approvals a
                          join public.listings l on l.id = a.listing_id
                          where a.identity_hash = p.identity_hash and a.decision = 'odottaa'
                            and l.status = 'odottaa_hyvaksyntaa')
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.notification_prefs np on np.user_id = p.id
  where p.id = auth.uid()
$$;

-- Omat kiinteistöt (myös kuolinpesän osakkaana omistetut) ja niiden ilmoitustila.
create function public.my_properties()
returns table (
  property_id bigint, kiinteistotunnus text, display_id text, maarala_no text, name text,
  kind public.property_kind, area_m2 double precision,
  share_num integer, share_den integer, via_estate text,
  owner_count bigint, estate_missing_shareholders boolean,
  listing_id uuid, listing_status public.listing_status, my_approval public.approval_decision,
  interest_count bigint
)
language sql stable security definer set search_path = '' as $$
  with me as (select identity_hash from public.profiles where id = auth.uid() and identity_hash is not null)
  select pr.id, pr.kiinteistotunnus::text, pr.display_id, pr.maarala_no, pr.name, pr.kind, pr.area_m2,
         po.share_num, po.share_den, est.owner_name,
         (select count(*) from public.property_owners o where o.property_id = pr.id and not o.is_estate),
         exists (select 1 from public.property_owners e where e.property_id = pr.id and e.is_estate
                 and not exists (select 1 from public.property_owners s where s.estate_owner_id = e.id)),
         l.id, l.status, a.decision,
         (select count(*) from public.interests i where i.property_id = pr.id and i.status <> 'hylatty')
  from public.property_owners po
  join me on me.identity_hash = po.identity_hash
  join public.properties pr on pr.id = po.property_id
  left join public.property_owners est on est.id = po.estate_owner_id
  left join lateral (
    select l2.* from public.listing_properties lp join public.listings l2 on l2.id = lp.listing_id
    where lp.property_id = pr.id
    order by (l2.status in ('luonnos', 'odottaa_hyvaksyntaa', 'julkaistu')) desc, l2.created_at desc
    limit 1) l on true
  left join public.listing_approvals a on a.listing_id = l.id and a.identity_hash = po.identity_hash
  where not po.is_estate
  order by pr.kiinteistotunnus, pr.maarala_no nulls first
$$;

-- Ilmoituksen hyväksyntätilanne omistajille (kuka on hyväksynyt, kuka ei vielä ole palvelussa).
create function public.listing_approval_status(p_listing uuid)
returns table (owner_name text, decision public.approval_decision, has_account boolean,
               is_me boolean, comment text, decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_listing_owner(p_listing, auth.uid()) then
    raise exception 'Ei oikeutta' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  return query
    select a.owner_name, a.decision,
           exists (select 1 from public.profiles p where p.identity_hash = a.identity_hash),
           a.identity_hash = private.my_identity_hash(), a.comment, a.decided_at
    from public.listing_approvals a where a.listing_id = p_listing
    order by a.owner_name;
end $$;

-- ---------------------------------------------------------------------------
-- Kuolinpesän osakkaan perukirja
-- ---------------------------------------------------------------------------
-- Osakas, joka ei vielä näy omistajana, lähettää perukirjan. Tiedosto ladataan ensin
-- Storageen bucketiin 'perukirjat' polkuun <oma user id>/<tiedosto>.
create function public.submit_estate_claim(p_property_id bigint, p_document_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_strong_auth(false);
  v_estate bigint;
  v_id uuid;
begin
  if p_document_path is null or p_document_path not like v_uid::text || '/%' then
    raise exception 'Perukirjan tiedostopolku on virheellinen' using hint = 'VAARA_POLKU';
  end if;
  select id into v_estate from public.property_owners
  where property_id = p_property_id and is_estate order by id limit 1;
  if v_estate is null then
    raise exception 'Kiinteistön omistajana ei ole kuolinpesää' using hint = 'EI_KUOLINPESAA';
  end if;
  insert into public.estate_claims (estate_owner_id, claimant_id, document_path)
  values (v_estate, v_uid, p_document_path) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.my_account(), public.my_properties(), public.listing_approval_status(uuid),
  public.submit_estate_claim(bigint, text) from public, anon;
grant execute on function public.my_account(), public.my_properties(), public.listing_approval_status(uuid),
  public.submit_estate_claim(bigint, text) to authenticated;

-- Storage: yksityinen bucket perukirjoille ja vahvistetuille puustoarvioille (jos Storage on käytössä).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('perukirjat', 'perukirjat', false)
    on conflict (id) do nothing;
    execute $p$
      create policy perukirjat_upload_own on storage.objects for insert to authenticated
      with check (bucket_id = 'perukirjat' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy perukirjat_read_own on storage.objects for select to authenticated
      using (bucket_id = 'perukirjat' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;
