-- Hinta-arvio: myyjän syötteet, vahvistettu puustoarvio ja oikeudet.
-- Ajetaan supabase/tests/valuation/run.sh -skriptillä (vaatii myös käyttäjämigraatiot).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema if not exists vtests;
grant usage on schema vtests to anon, authenticated, service_role;
create function vtests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'EPÄONNISTUI: %', p_msg; end if;
  raise warning 'ok - %', p_msg;
end $$;
create function vtests.err(p_sql text, p_expected text, p_msg text) returns void language plpgsql as $$
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
grant execute on all functions in schema vtests to anon, authenticated, service_role;

\set as_user 'reset role; select set_config(''request.jwt.claim.sub'', :''u'', false); set role authenticated;'
\set as_service 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role service_role;'
\set as_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role anon;'
\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'
\set matti '00000000-0000-0000-0000-0000000000a1'
\set ella  '00000000-0000-0000-0000-0000000000a6'
\o /dev/null

insert into auth.users (id, email, email_confirmed_at) values
  (:'matti', 'matti.v@example.test', now()), (:'ella', 'ella.v@example.test', now());
:as_service
select public.record_strong_auth(:'matti', '010170-901K', 'Matti Metsänen', 'kayttoonotto', 'mock');
select public.record_strong_auth(:'ella', '121212A907S', 'Ella Ostaja', 'kayttoonotto', 'mock');
:as_admin
select id as tuusula from public.properties where kiinteistotunnus = '85840900100002' \gset
update public.properties set geom = st_multi(st_makeenvelope(390000, 6705000, 390400, 6705400, 3067)) where id = :tuusula;

-- ---------------------------------------------------------------------------
-- Hintatasot
-- ---------------------------------------------------------------------------
:as_anon
select vtests.ok((select count(distinct area_key) from public.land_price_reference where scope = 'maakunta') = 19,
  'hintatasot kaikille 19 maakunnalle');
select vtests.ok((select count(*) from public.land_price_reference where scope = 'kunta' and land_use in ('rakennuspaikka', 'rakennusoikeus_kem2')) = 16,
  'pilottikunnille omat rakennusmaan hintatasot');
select vtests.ok(not exists (
    select 1 from public.municipalities m where m.region_name is not null and not exists (
      select 1 from public.land_price_reference r where r.scope = 'maakunta' and r.area_key = m.region_name and r.land_use = 'pelto')),
  'jokaisen kunnan maakunnalle löytyy pellon hintataso');
select vtests.ok((public.property_summary('85840900100002') -> 'municipality' ->> 'region_name') = 'Uusimaa',
  'property_summary palauttaa maakunnan');
select vtests.ok((public.property_summary('85840900100002') ->> 'area_ha')::numeric = 16, 'property_summary: pinta-ala');
select vtests.ok((select eur from public.land_price_reference where scope = 'kunta' and area_key = '049' and land_use = 'raakamaa') >
  10 * (select eur from public.land_price_reference where scope = 'maakunta' and area_key = 'Lappi' and land_use = 'metsatila_kokonais'),
  'Espoon raakamaan hintataso on moninkertainen Lapin metsätiloihin nähden');
select vtests.ok((select count(*) from public.land_price_reference where land_use = 'ranta_m' and scope = 'maakunta') = 19,
  'rannan lisäarvo kaikille maakunnille');
select vtests.err(format('select public.set_seller_price(%s, 100000)', :tuusula), '42501', 'kirjautumaton ei voi asettaa hintaa');

-- ---------------------------------------------------------------------------
-- Myyjän syötteet
-- ---------------------------------------------------------------------------
\set u :ella
:as_user
select vtests.err(format('select public.set_seller_price(%s, 100000)', :tuusula), 'EI_OMISTAJA', 'muu kuin omistaja ei voi asettaa hintaa');
select vtests.err(format('select public.set_property_land_use(%s, 2, null)', :tuusula), 'EI_OMISTAJA', 'muu kuin omistaja ei voi muuttaa maankäyttöä');

\set u :matti
:as_user
select public.set_seller_price(:tuusula, 250000.4, null, null, 'Hyvät tieyhteydet');
select vtests.ok((select total_eur from public.seller_price_estimates where property_id = :tuusula) = 250000, 'myyjän hinta tallentuu');
select public.set_seller_price(:tuusula, 260000);
select vtests.ok((select total_eur from public.seller_price_estimates where property_id = :tuusula) = 260000, 'myyjän hinta päivittyy');
select public.set_property_land_use(:tuusula, 3.5, 1, ' at ', 120);
select vtests.ok((select shore_m from public.property_land_use where property_id = :tuusula) = 120, 'rantaviivan pituus tallentuu');
select vtests.ok((select designation from public.property_land_use where property_id = :tuusula) = 'AT', 'kaavamerkintä normalisoidaan');
select vtests.err(format('select public.set_property_land_use(%s, 50, null)', :tuusula), 'VIRHEELLINEN_ALA', 'peltoala ei voi ylittää pinta-alaa');
select vtests.err(format('select public.submit_timber_verification(%s, %L, %L, 120000)', :tuusula, 'toinen/a.pdf', 'MHY'),
  'VAARA_POLKU', 'arviodokumentin on oltava omassa kansiossa');
select vtests.err(format('select public.submit_timber_verification(%s, %L, %L, 120000, %L)', :tuusula, :'matti' || '/a.pdf', 'MHY', '2020-01-01'),
  'VANHA_ARVIO', 'yli 3 vuotta vanha arvio hylätään');
select public.submit_timber_verification(:tuusula, :'matti' || '/a.pdf', 'Metsänhoitoyhdistys Testi', 120000, current_date - 30) as v1 \gset
select public.submit_timber_verification(:tuusula, :'matti' || '/b.pdf', 'Metsänhoitoyhdistys Testi', 125000, current_date - 10) as v2 \gset
select vtests.ok((select status from public.timber_verifications where id = :'v1') = 'korvattu', 'uusi arvio korvaa odottavan');
select vtests.err(format('select public.review_timber_verification(%L, true)', :'v2'), '42501', 'myyjä ei voi hyväksyä omaa arviotaan');
select public.request_timber_appraisal(:tuusula, '0401234567', 'Toivon arviota keväällä');
select vtests.err(format('select public.request_timber_appraisal(%s)', :tuusula), 'PYYNTO_ON_JO', 'vain yksi avoin arviopyyntö');

\set u :ella
:as_user
select vtests.ok((select count(*) from public.seller_price_estimates) = 0 and (select count(*) from public.timber_verifications) = 0
  and (select count(*) from public.property_land_use) = 0, 'muut eivät näe myyjän syötteitä');

-- ---------------------------------------------------------------------------
-- Ylläpito hyväksyy -> vahvistettu puuston arvo ja ilmoitus omistajalle
-- ---------------------------------------------------------------------------
:as_service
select vtests.ok(public.review_timber_verification(:'v2', true, null) = 'hyvaksytty', 'ylläpito hyväksyy arvion');
select vtests.ok((public.valuation_inputs(:tuusula) -> 'verified' ->> 'timber_value_eur')::numeric = 125000,
  'hyväksytty arvio menee hinta-arvion syötteisiin');
select vtests.ok((public.valuation_inputs(:tuusula) -> 'seller' ->> 'total_eur')::numeric = 260000
  and (public.valuation_inputs(:tuusula) -> 'land_use' ->> 'designation') = 'AT'
  and (public.valuation_inputs(:tuusula) -> 'land_use' ->> 'shore_m')::numeric = 120, 'myyjän hinta ja maankäyttö syötteissä');
-- Kantohinnat: uusimmalta viikolta puuttuva hinta otetaan edelliseltä viikolta.
insert into public.stumpage_prices (week, price_area, cutting_method, assortment, eur_m3) values
  ('2026W45', '1', '8021', 'N1', 71), ('2026W45', '1', '8021', 'N2', 75),
  ('2026W46', '1', '8021', 'N1', 73), ('2026W46', '1', '8021', 'N2', null);
select vtests.ok((public.property_summary('85840900100002') -> 'stumpage_prices' -> 'eur_m3' ->> '8021:N1')::numeric = 73
  and (public.property_summary('85840900100002') -> 'stumpage_prices' -> 'eur_m3' ->> '8021:N2')::numeric = 75,
  'kantohinta: uusin saatavilla oleva hinta puutavaralajeittain');
insert into public.valuations (property_id, land_value_eur, timber_value_eur, timber_status, land_source, method)
values (:tuusula, 10000, 125000, 'vahvistettu', 'reference', '{"display":{"label":"Hinta-arvio"}}');

\set u :matti
:as_user
select vtests.ok(exists (select 1 from public.notifications where kind = 'puustoarvio_hyvaksytty'), 'omistaja saa ilmoituksen hyväksynnästä');
select vtests.ok((public.latest_valuation(:tuusula) ->> 'timber_status') = 'vahvistettu', 'omistaja näkee uusimman arvion');
select vtests.ok((public.latest_valuation(:tuusula) -> 'details' -> 'display' ->> 'label') = 'Hinta-arvio', 'arvion erittely mukana');
select vtests.err('select public.valuation_inputs(1)', '42501', 'syötefunktio ei ole selaimen käytettävissä');
select public.set_seller_price(:tuusula, null);
select vtests.ok(not exists (select 1 from public.seller_price_estimates), 'myyjän hinta poistetaan antamalla null');

\set u :ella
:as_user
select vtests.ok(public.latest_valuation(:tuusula) is null, 'julkaisemattoman kiinteistön arvio ei näy muille');
\o
select 'kaikki hinta-arviotestit ajettu' as tulos;
