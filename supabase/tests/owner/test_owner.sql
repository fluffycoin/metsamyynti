-- Kunnan, valtion, yhtiöiden ja yhteisöjen maat: merkintä ja kiinnostusten esto.
-- Ajetaan supabase/tests/owner/run.sh -skriptillä tyhjään kantaan.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'EPÄONNISTUI: %', p_msg; end if;
  raise warning 'ok - %', p_msg;
end $$;
create function tests.err(p_sql text, p_expected text, p_msg text) returns void language plpgsql as $$
declare v_hint text; v_state text; v_text text; v_failed boolean := false;
begin
  begin execute p_sql;
  exception when others then
    v_failed := true;
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_text = message_text;
  end;
  if not v_failed then raise exception 'EPÄONNISTUI: % (ei virhettä, odotettiin %)', p_msg, p_expected; end if;
  if v_hint is distinct from p_expected and v_state is distinct from p_expected then
    raise exception 'EPÄONNISTUI: % (odotettiin %, saatiin % / % / %)', p_msg, p_expected, v_hint, v_state, v_text;
  end if;
  raise warning 'ok - %', p_msg;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

\set as_user 'reset role; select set_config(''request.jwt.claim.sub'', :''u'', false); set role authenticated;'
\set as_service 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role service_role;'
\set as_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role anon;'
\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set olli '00000000-0000-0000-0000-000000000007'
\o /dev/null

insert into auth.users (id, email, email_confirmed_at) values (:'olli', 'olli@example.test', now());

-- Kiinteistöt: 1 km² neliöt (EPSG:3067)
create function tests.square(x numeric, y numeric, d numeric default 1000) returns jsonb language sql as $$
  select jsonb_build_object('type', 'MultiPolygon', 'coordinates',
    jsonb_build_array(jsonb_build_array(jsonb_build_array(
      jsonb_build_array(x, y), jsonb_build_array(x + d, y), jsonb_build_array(x + d, y + d),
      jsonb_build_array(x, y + d), jsonb_build_array(x, y)))))
$$;
select public.upsert_property('04940100010001', tests.square(370000, 6670000)) as yksityinen \gset
select public.upsert_property('04940200020002', tests.square(372000, 6670000)) as kaupunki_alue \gset
select public.upsert_property('74289300120001', tests.square(500000, 7400000)) as valtio \gset
select public.upsert_property('09100299010100', tests.square(385000, 6672000, 50)) as katu \gset
select public.upsert_property('85840100050005', tests.square(400000, 6700000)) as upm \gset
select public.upsert_property('85840100060006', tests.square(402000, 6700000)) as korjattu \gset
select public.upsert_property('85840100070007', tests.square(404000, 6700000)) as myynnissa \gset

-- ===========================================================================
-- 1. Päättely
-- ===========================================================================
:as_service
select public.import_land_owner_areas('testikaupunki', 'kunta', 'Espoon kaupunki',
  jsonb_build_array(jsonb_build_object('type', 'Feature', 'properties', '{}'::jsonb,
    'geometry', tests.square(372300, 6670000, 1000))), true);   -- kattaa 70 % kaupunki_alueesta
select public.import_land_owner_areas('testikaupunki2', 'kunta', 'Espoon kaupunki',
  jsonb_build_array(jsonb_build_object('type', 'Feature', 'properties', '{}'::jsonb,
    'geometry', tests.square(370800, 6670000, 1000))), true);   -- vain 20 % yksityisestä
select public.import_land_owner_parcels('metsahaku', '[{"kiinteistotunnus": "85840100050005", "category": "yhtio", "owner_name": "UPM"}]');
select public.record_land_owner('85840100060006', 'kunta', 'Tuusulan kunta', 'espoo_wms', 0.9);
select public.set_land_owner('858-401-6-6', 'yksityinen');
select public.record_land_owner('85840100060006', 'kunta', 'Tuusulan kunta', 'espoo_wms', 0.9);  -- ei ylikirjoita korjausta

:as_anon
select tests.ok(public.property_summary('04940100010001') ? 'owner_info'
  and public.property_summary('04940100010001') -> 'owner_info' = 'null'::jsonb,
  'yksityinen: owner_info null (20 % päällekkäisyys ei riitä)');
select tests.ok(public.property_summary('04940200020002') -> 'owner_info' ->> 'category' = 'kunta'
  and (public.property_summary('04940200020002') -> 'owner_info' ->> 'share')::numeric = 0.7
  and public.property_summary('04940200020002') -> 'owner_info' ->> 'label' = 'Kunnan tai kaupungin maa',
  'aluerajaus: kaupungin maa, osuus 0.7');
select tests.ok(public.property_summary('74289300120001') -> 'owner_info' ->> 'category' = 'valtio',
  'kylä 893: valtion metsämaa');
select tests.ok(public.property_summary('09100299010100') -> 'owner_info' ->> 'category' = 'kunta',
  'ryhmä 9901: yleinen alue');
select tests.ok(public.property_summary('85840100050005') -> 'owner_info' ->> 'owner_name' = 'UPM',
  'tuotu lista: UPM');
select tests.ok(public.property_summary('85840100060006') -> 'owner_info' = 'null'::jsonb,
  'ylläpidon korjaus (yksityinen) voittaa automaattisen lähteen');
select tests.ok((public.property_summary('85840100050005') -> 'owner_info' ->> 'accepts_interest')::boolean = false,
  'merkitty maa ei ota kiinnostuksia');
select tests.ok(public.owner_info_at('74289300990001', null, null) ->> 'category' = 'valtio',
  'kartta: tunnus ilman kantaa');
select tests.ok(public.owner_info_at('04999900010001', 24.0, 60.0) is null, 'kartta: tavallinen tila');
select tests.ok(public.owner_info_at('04999900010002',
  st_x(st_transform(st_setsrid(st_makepoint(373000, 6670500), 3067), 4326)),
  st_y(st_transform(st_setsrid(st_makepoint(373000, 6670500), 3067), 4326))) ->> 'category' = 'kunta',
  'kartta: piste kaupungin aluerajauksessa');
select tests.err('select public.set_land_owner(''49-1-1-1'', ''kunta'')', '42501', 'selain ei voi merkitä maita');
select tests.err('select count(*) from public.land_owner_parcels', '42501', 'lähdetaulut eivät näy selaimelle');

-- Lainhuudon omistajien nimet
:as_admin
select public.upsert_property('85840100080008', tests.square(406000, 6700000)) as srk \gset
select public.upsert_property('85840100090009', tests.square(408000, 6700000)) as seka \gset
insert into public.property_owners (property_id, identity_hash, owner_name, source) values
  (:srk, 'h1', 'Tuusulan seurakuntayhtymä', 'mml'),
  (:seka, 'h2', 'Stora Enso Oyj', 'mml'), (:seka, 'h3', 'Matti Meikäläinen', 'mml');
select tests.ok(private.owner_info(:srk) ->> 'category' = 'seurakunta', 'lainhuuto: seurakunta');
select tests.ok(private.owner_info(:seka) is null, 'lainhuuto: yhteisomistus yksityisen kanssa ei merkitse');

-- ===========================================================================
-- 2. Kiinnostusten esto
-- ===========================================================================
-- myynnissa: yhtiön maa, jolla julkaistu ilmoitus -> kiinnostus sallitaan
select public.import_land_owner_parcels('metsahaku', '[{"kiinteistotunnus": "85840100070007", "category": "yhtio", "owner_name": "Tornator"}]');
insert into public.listings (id, created_by, status, published_at)
values ('11111111-1111-1111-1111-111111111111', :'olli', 'julkaistu', now());
insert into public.listing_properties values ('11111111-1111-1111-1111-111111111111', :myynnissa);

\set u :olli
:as_user
select tests.err(format('select public.express_interest(%s, %L)', :valtio, 'Myyttekö?'), 'EI_YKSITYINEN_MAA',
  'valtion maahan ei voi lähettää kiinnostusta');
select tests.err(format('select public.express_interest(%s, %L)', :upm, 'Myyttekö?'), 'EI_YKSITYINEN_MAA',
  'yhtiön maahan ei voi lähettää kiinnostusta');
select tests.ok(public.express_interest(:yksityinen, 'Myyttekö?') is not null, 'yksityiseen maahan voi');
select tests.ok(public.express_interest(:korjattu, 'Myyttekö?') is not null, 'korjattuun (yksityinen) voi');
select tests.ok(public.express_interest(:myynnissa, 'Ostaisin') is not null, 'julkaistuun ilmoitukseen voi, vaikka yhtiön maa');
select tests.ok((public.property_owner_info(:myynnissa) ->> 'accepts_interest')::boolean, 'julkaistu: accepts_interest');

\o
select 'kaikki testit ajettu';
