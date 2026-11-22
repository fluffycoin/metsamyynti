-- Käyttäjät, vahva tunnistautuminen, omistajuus, hyväksynnät ja kiinnostukset.
-- Ajetaan supabase/tests/users/run.sh -skriptillä tyhjään kantaan.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'EPÄONNISTUI: %', p_msg; end if;
  raise warning 'ok - %', p_msg;
end $$;

-- Odottaa virhettä, jonka hint (tai SQLSTATE) on p_expected.
create function tests.err(p_sql text, p_expected text, p_msg text) returns void language plpgsql as $$
declare
  v_hint text; v_state text; v_text text; v_failed boolean := false;
begin
  begin
    execute p_sql;
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

-- Käyttäjän vaihto: \set u <uuid> ja sitten :as_user
\set as_user 'reset role; select set_config(''request.jwt.claim.sub'', :''u'', false); set role authenticated;'
\set as_service 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role service_role;'
\set as_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role anon;'
\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', '''', false);'

\set matti '00000000-0000-0000-0000-000000000001'
\set liisa '00000000-0000-0000-0000-000000000002'
\set pekka '00000000-0000-0000-0000-000000000003'
\set kalle '00000000-0000-0000-0000-000000000004'
\set sanna '00000000-0000-0000-0000-000000000005'
\set ella  '00000000-0000-0000-0000-000000000006'
\set olli  '00000000-0000-0000-0000-000000000007'
\set uusi  '00000000-0000-0000-0000-000000000008'
\set veli  '00000000-0000-0000-0000-000000000009'

\o /dev/null

-- ===========================================================================
-- 1. Tilit
-- ===========================================================================
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'matti', 'matti@example.test', now(), '{"display_name":"Matti"}'),
  (:'liisa', 'liisa@example.test', now(), '{}'),
  (:'pekka', 'pekka@example.test', now(), '{}'),
  (:'kalle', 'kalle@example.test', now(), '{}'),
  (:'sanna', 'sanna@example.test', now(), '{}'),
  (:'ella',  'ella@example.test',  now(), '{}'),
  (:'olli',  'olli@example.test',  now(), '{"display_name":"Olli Ostaja"}'),
  (:'uusi',  'uusi@example.test',  null,  '{}'),
  (:'veli',  'veli@example.test',  now(), '{}');

select tests.ok((select count(*) from public.profiles) = 9, 'profiili syntyy jokaiselle uudelle käyttäjälle');
select tests.ok((select count(*) from public.notification_prefs where accept_interests and not email_interests) = 9,
  'oletus: kiinnostukset sovellukseen, ei sähköpostiin');
select tests.ok((select display_name from public.profiles where id = :'matti') = 'Matti', 'display_name rekisteröinnistä');

-- ===========================================================================
-- 2. Myynti vaatii vahvan tunnistautumisen
-- ===========================================================================
\set u :olli
:as_user
select tests.ok((public.my_account() ->> 'is_seller')::boolean = false, 'tavallinen tili ei ole myyjä');
select tests.err('select public.create_listing(array[1::bigint])', 'VAHVA_TUNNISTUS', 'ilmoituksen luonti ilman vahvaa tunnistusta estyy');
select tests.err($$select public.record_strong_auth('00000000-0000-0000-0000-000000000007', '010170-901K', 'x', 'kayttoonotto', 'mock')$$,
  '42501', 'selain ei voi kirjata vahvaa tunnistusta itse');
select tests.ok((select count(*) from public.profiles) = 1, 'käyttäjä näkee vain oman profiilinsa');

-- ===========================================================================
-- 3. Vahva tunnistautuminen ja omistuksen haku testirekisteristä
-- ===========================================================================
:as_service
select tests.err($$select public.record_strong_auth('00000000-0000-0000-0000-000000000001', '010170-901A', 'Matti Metsänen', 'kayttoonotto', 'mock')$$,
  '22023', 'virheellinen tarkistusmerkki hylätään');
select tests.ok((public.record_strong_auth(:'matti', '010170-901K', 'Matti Metsänen', 'kayttoonotto', 'mock', 'fi-op') ->> 'owner_rows')::int = 6,
  'Matin kiinteistöt ja niiden kaikki omistajat haetaan (Tuusula 1, Kerava 1, Pirkkala 4)');
select tests.err($$select public.record_strong_auth('00000000-0000-0000-0000-000000000006', '010170-901K', 'X', 'kayttoonotto', 'mock')$$,
  'HENKILO_TOISELLA_TILILLA', 'sama henkilö ei voi liittyä kahteen tiliin');
select tests.err($$select public.record_strong_auth('00000000-0000-0000-0000-000000000001', '121212A907S', 'X', 'kayttoonotto', 'mock')$$,
  'TILI_TOISELLA_HENKILOLLA', 'tiliin ei voi vaihtaa toista henkilöä');
select public.record_strong_auth(:'ella', '121212A907S', 'Ella Ostaja', 'kayttoonotto', 'mock');

:as_admin
select tests.ok(not exists (
  select 1 from public.profiles where identity_hash like '%901K%' or verified_name like '%901K%'
  union all select 1 from public.property_owners where identity_hash like '%901K%')
  and (select length(identity_hash) from public.profiles where id = :'matti') = 64,
  'henkilötunnusta ei tallenneta selväkielisenä');
select tests.ok((select count(*) from public.properties where source = 'omistajasynkka') = 3,
  'puuttuvat kiinteistöt luodaan minimitiedoilla');

\set u :matti
:as_user
select tests.ok((select count(*) from public.my_properties()) = 3, 'Matilla 3 kiinteistöä (yksi kuolinpesän osakkaana)');
select tests.ok((select via_estate from public.my_properties() where kiinteistotunnus = '60441300100031') = 'Aino Vainion kuolinpesä',
  'kuolinpesän kautta omistettu näkyy');
select tests.ok((select owner_count from public.my_properties() where kiinteistotunnus = '60441300100031') = 3,
  'kuolinpesän kiinteistöllä 3 hyväksyjää (osakkaat)');
select tests.ok((select count(*) from public.property_owners) = 6, 'omistaja näkee omien kiinteistöjensä omistajat');
select tests.ok((public.my_account() ->> 'step_up_valid')::boolean, 'tuore vahva tunnistus voimassa');

\set u :ella
:as_user
select tests.ok((select count(*) from public.my_properties()) = 0, 'Ellalla ei omistuksia');
select tests.ok((select count(*) from public.property_owners) = 0, 'muiden omistajatiedot eivät näy');

-- ===========================================================================
-- 4. Kiinnostukset (myös kohteista, jotka eivät ole myynnissä)
-- ===========================================================================
-- Sipoon pelto karttanäkymästä (property-summary loisi rivin; tässä suoraan)
:as_admin
insert into public.properties (kiinteistotunnus, municipality_code, name, source)
values ('75341200020007', '753', 'Peltola', 'mml');
select id as sipoo from public.properties where kiinteistotunnus = '75341200020007' \gset
select id as tuusula from public.properties where kiinteistotunnus = '85840900100002' \gset
select id as kerava from public.properties where kiinteistotunnus = '24540100080150' \gset
select id as pirkkala from public.properties where kiinteistotunnus = '60441300100031' \gset

:as_anon
select tests.err(format('select public.express_interest(%s, %L)', :sipoo, 'Hei'), '42501', 'kirjautumaton ei voi lähettää kiinnostusta');

\set u :uusi
:as_user
select tests.err(format('select public.express_interest(%s, %L)', :sipoo, 'Hei'), 'SAHKOPOSTI_VAHVISTAMATTA',
  'vahvistamaton sähköposti estää kiinnostuksen');

\set u :olli
:as_user
select tests.ok(public.express_interest(:sipoo, 'Olisin kiinnostunut ostamaan peltonne.', 45000) is not null,
  'tili riittää kiinnostukseen, kohde ei myynnissä eikä omistaja vielä palvelussa');
select tests.err(format('select public.express_interest(%s, %L)', :sipoo, 'Uudestaan'), 'JO_ILMOITETTU', 'samaan kohteeseen ei heti uudelleen');
select tests.err('select public.express_interest(999999, ''x'')', 'EI_KIINTEISTOA', 'tuntematon kiinteistö');
select tests.ok((select count(*) from public.interests) = 1, 'lähettäjä näkee oman kiinnostuksensa');
select tests.ok((select count(*) from public.interests_sent()) = 1, 'interests_sent toimii');

\set u :matti
:as_user
select tests.err(format('select public.express_interest(%s, %L)', :tuusula, 'x'), 'OMA_KIINTEISTO', 'omaan kiinteistöön ei voi ilmoittaa kiinnostusta');
update public.notification_prefs set email_interests = true where user_id = auth.uid();

\set u :olli
:as_user
select public.express_interest(:tuusula, 'Myyttekö metsää?', null, true, 'Olli Ostaja', '040 123 4567') as olli_tuusula \gset
-- päiväraja
:as_admin
update private.settings set value = '2' where key = 'interest_daily_limit';
\set u :olli
:as_user
select tests.err(format('select public.express_interest(%s, %L)', :kerava, 'x'), 'PAIVARAJA', 'päiväraja estää häirinnän');
:as_admin
update private.settings set value = '10' where key = 'interest_daily_limit';

\set u :matti
:as_user
select tests.ok((select count(*) from public.notifications where kind = 'kiinnostus') = 1, 'omistaja saa ilmoituksen sovellukseen');
select tests.ok((select contact_phone from public.interests_received() where interest_id = :'olli_tuusula') = '040 123 4567',
  'jaetut yhteystiedot näkyvät omistajalle');
:as_service
select tests.ok((select count(*) from public.claim_email_batch(10) where to_email = 'matti@example.test') = 1,
  'sähköposti jonoon, koska omistaja salli sen');
select public.complete_email(id) from private.email_outbox;
:as_admin
select tests.ok((select count(*) from public.notifications where emailed_at is not null) = 1, 'lähetetty merkitään');
select tests.ok((select body_text from private.email_outbox limit 1) not like '%Myyttekö%', 'viestin sisältö ei mene sähköpostiin');

-- Ostaja ei voi jatkaa ennen omistajan vastausta; omistajan nimi ei paljastu
\set u :olli
:as_user
select tests.err(format('select public.reply_to_interest(%L, %L)', :'olli_tuusula', 'Hei?'), 'ODOTA_VASTAUSTA', 'ostaja odottaa omistajan vastausta');
\set u :matti
:as_user
select public.reply_to_interest(:'olli_tuusula', 'Kiitos, harkitsen. Voin myydä keväällä.');
\set u :olli
:as_user
select tests.ok((select count(*) from public.notifications where kind = 'kiinnostus_vastaus') = 1, 'ostaja saa ilmoituksen vastauksesta');
select tests.ok(public.reply_to_interest(:'olli_tuusula', 'Hienoa, palataan asiaan.') is not null, 'ostaja voi jatkaa vastauksen jälkeen');
select tests.ok((select count(*) from public.interest_thread(:'olli_tuusula')) = 3, 'keskustelu näkyy ostajalle');
select tests.ok(not exists (select 1 from public.interest_thread(:'olli_tuusula') where body like '%Matti%'), 'omistajan nimeä ei välitetä');

-- Esto: omistaja kieltäytyy ja estää lähettäjän
\set u :ella
:as_user
select public.express_interest(:tuusula, 'Ostaisin heti!') as ella_tuusula \gset
\set u :matti
:as_user
select public.decline_interest(:'ella_tuusula', true);
\set u :ella
:as_user
select public.express_interest(:kerava, 'Entä tämä tontti?');
select tests.ok((select status from public.interests_sent() where interest_id = :'ella_tuusula') = 'lahetetty', 'kieltäytyminen ei näy lähettäjälle');
\set u :matti
:as_user
select tests.ok(not exists (select 1 from public.interests_received() where property_id = :kerava), 'estetyn lähettäjän viestit eivät tule perille');
select tests.ok(not exists (select 1 from public.notifications where payload ->> 'property_id' = :'kerava'), 'estetyltä ei uusia ilmoituksia');

-- ===========================================================================
-- 5. Odottavat kiinnostukset toimitetaan, kun omistaja liittyy
-- ===========================================================================
:as_service
select tests.ok((public.record_strong_auth(:'liisa', '150382-902B', 'Liisa Pelto', 'kayttoonotto', 'mock') ->> 'interests_delivered')::int = 1,
  'Liisa saa liittyessään aiemmin tulleen kiinnostuksen');
select public.record_strong_auth(:'pekka', '220379-9034', 'Pekka Pelto', 'kayttoonotto', 'mock');
\set u :pekka
:as_user
select tests.ok((select count(*) from public.interests_received()) = 1, 'myös yhteisomistaja näkee kiinnostuksen');
select tests.ok((select sender_alias from public.interests_received()) like 'Kiinnostunut ostaja #%', 'lähettäjä anonyymi, jos ei jakanut tietojaan');

\set u :liisa
:as_user
select tests.ok((select count(*) from public.my_properties()) = 3, 'Liisalla 3 kohdetta (Sipoo, Tampere, Espoon määräala)');
select tests.ok((select maarala_no from public.my_properties() where kiinteistotunnus = '04945600010101') = '601', 'määräala tunnistetaan');
select id as espoo from public.properties where kiinteistotunnus = '04945600010101' and maarala_no = '601' \gset
update public.notification_prefs set accept_interests = false where user_id = auth.uid();
\set u :veli
:as_user
select public.express_interest(:espoo, 'Myyttekö rantapalstan?');
\set u :liisa
:as_user
select tests.ok(not exists (select 1 from public.notifications where payload ->> 'property_id' = :'espoo'),
  'kiinnostuksista kieltäytynyt ei saa ilmoituksia');
update public.notification_prefs set accept_interests = true where user_id = auth.uid();

-- ===========================================================================
-- 6. Ilmoitus: yksi omistaja
-- ===========================================================================
\set u :matti
:as_user
select public.create_listing(array[:tuusula::bigint], 'Metsätila Tuusulassa') as l_tuusula \gset
select tests.err(format('select public.create_listing(array[%s::bigint])', :tuusula), 'ILMOITUS_ON_JO', 'yhdellä kiinteistöllä yksi avoin ilmoitus');
select tests.err(format('select public.create_listing(array[%s::bigint])', :sipoo), 'EI_OMISTAJA', 'toisen kiinteistöä ei voi ilmoittaa');
update public.listings set asking_price_eur = 120000 where id = :'l_tuusula';
select tests.err(format('update public.listings set price_source = %L where id = %L', 'vahvistettu', :'l_tuusula'), '42501',
  'vahvistettua hintaa ei voi asettaa itse');
\set u :olli
:as_user
update public.listings set title = 'hakkeroitu' where id = :'l_tuusula';
select tests.ok((select count(*) from public.listings) = 0, 'luonnos ei näy muille');
\set u :matti
:as_user
select tests.ok((select title from public.listings where id = :'l_tuusula') = 'Metsätila Tuusulassa', 'muut eivät voi muokata');
select tests.ok(public.submit_listing(:'l_tuusula') = 'julkaistu', 'yksin omistettu julkaistaan heti');
:as_anon
select tests.ok((select count(*) from public.listings where id = :'l_tuusula') = 1, 'julkaistu näkyy kaikille');
select tests.ok((select count(*) from public.listing_properties where listing_id = :'l_tuusula') = 1, 'ilmoituksen kiinteistö näkyy kaikille');
select tests.err('select * from public.property_owners', '42501', 'omistajat eivät näy kirjautumattomille');
\set u :olli
:as_user
select tests.ok((select listing_id from public.interests where id = :'olli_tuusula') is null, 'vanha kiinnostus ei muutu');
\set u :matti
:as_user
update public.listings set title = 'muutettu' where id = :'l_tuusula';
select tests.ok((select title from public.listings where id = :'l_tuusula') = 'Metsätila Tuusulassa', 'julkaistua ei voi muokata ilman avaamista');

-- Step-up vanhenee
:as_admin
update public.profiles set strong_auth_at = now() - interval '1 hour' where id = :'matti';
\set u :matti
:as_user
select public.create_listing(array[:kerava::bigint]) as l_kerava \gset
select tests.err(format('select public.submit_listing(%L)', :'l_kerava'), 'TUNNISTAUDU_UUDELLEEN', 'julkaisu vaatii tuoreen vahvan tunnistuksen');
:as_service
select public.record_strong_auth(:'matti', '010170-901K', 'Matti Metsänen', 'julkaisu', 'mock');
\set u :matti
:as_user
select tests.ok(public.submit_listing(:'l_kerava') = 'julkaistu', 'uudelleentunnistuksen jälkeen julkaisu onnistuu');
select tests.ok(public.mark_listing_sold(:'l_kerava') = 'myyty', 'myydyksi merkintä');

-- ===========================================================================
-- 7. Yhteisomistus: kaikkien hyväksyntä
-- ===========================================================================
\set u :liisa
:as_user
select public.create_listing(array[:sipoo::bigint], 'Peltoa Sipoossa') as l_sipoo \gset
select tests.ok(public.submit_listing(:'l_sipoo') = 'odottaa_hyvaksyntaa', 'yhteisomistettu odottaa hyväksyntää');
:as_anon
select tests.ok((select count(*) from public.listings where id = :'l_sipoo') = 0, 'odottava ei ole julkinen');
\set u :ella
:as_user
select tests.err(format('select public.decide_listing(%L, true)', :'l_sipoo'), 'EI_HYVAKSYJA', 'ulkopuolinen ei voi hyväksyä');
\set u :pekka
:as_user
select tests.ok((select count(*) from public.notifications where kind = 'hyvaksyntapyynto') = 1, 'yhteisomistaja saa hyväksyntäpyynnön');
select tests.ok((public.my_account() ->> 'pending_approvals')::int = 1, 'my_account näyttää odottavat hyväksynnät');
select tests.ok(public.decide_listing(:'l_sipoo', false, 'Hinta liian matala') = 'luonnos', 'hylkäys palauttaa luonnokseksi');
\set u :liisa
:as_user
select tests.ok((select body from public.notifications where kind = 'ilmoitus_palautettu') like '%liian matala%', 'hylkäyksen syy välitetään');
update public.listings set asking_price_eur = 60000 where id = :'l_sipoo';
select public.submit_listing(:'l_sipoo');
\set u :pekka
:as_user
select tests.ok(public.decide_listing(:'l_sipoo', true) = 'julkaistu', 'kaikkien hyväksyttyä julkaistaan');
select tests.ok((select count(*) from public.listing_approval_status(:'l_sipoo') where decision = 'hyvaksytty') = 2, 'hyväksyntätilanne');

-- ===========================================================================
-- 8. Kuolinpesä: osakkaat hyväksyvät, vaikka liittyvät myöhemmin
-- ===========================================================================
\set u :matti
:as_user
select public.create_listing(array[:pirkkala::bigint], 'Perikunnan metsä Pirkkalassa') as l_pirkkala \gset
select tests.ok(public.submit_listing(:'l_pirkkala') = 'odottaa_hyvaksyntaa', 'kuolinpesän kohde odottaa osakkaita');
select tests.ok((select count(*) from public.listing_approval_status(:'l_pirkkala') where not has_account) = 2,
  'näkyy, ketkä osakkaat eivät ole vielä palvelussa');
:as_service
select public.record_strong_auth(:'kalle', '110868-9059', 'Kalle Vainio', 'kayttoonotto', 'mock');
select public.record_strong_auth(:'sanna', '300491-9069', 'Sanna Vainio', 'kayttoonotto', 'mock');
\set u :kalle
:as_user
select tests.ok((select count(*) from public.notifications where kind = 'hyvaksyntapyynto') = 1, 'myöhemmin liittyvä osakas saa pyynnön');
select tests.ok(public.decide_listing(:'l_pirkkala', true) = 'odottaa_hyvaksyntaa', 'yksi osakas hyväksyi');
\set u :sanna
:as_user
select tests.ok(public.decide_listing(:'l_pirkkala', true) = 'julkaistu', 'kaikki osakkaat hyväksyivät -> julkaistu');
\set u :matti
:as_user
select tests.ok((select count(*) from public.notifications where kind = 'ilmoitus_julkaistu') = 3, 'julkaisusta ilmoitus (Tuusula, Kerava, Pirkkala)');

-- Kuolinpesä ilman osakkaita estää julkaisun; perukirjan jälkeen osakas lisätään
:as_admin
select id as tampere from public.properties where kiinteistotunnus = '83758500110181' \gset
\set u :liisa
:as_user
select public.create_listing(array[:tampere::bigint]) as l_tampere \gset
select tests.err(format('select public.submit_listing(%L)', :'l_tampere'), 'OSAKKAAT_PUUTTUVAT', 'osakkaat puuttuvat -> ei julkaisua');
select tests.err(format('select public.submit_estate_claim(%s, %L)', :tampere, 'joku/perukirja.pdf'), 'VAARA_POLKU', 'perukirja vain omaan kansioon');
select public.submit_estate_claim(:tampere, :'liisa' || '/perukirja.pdf') as claim \gset
:as_service
select tests.ok(public.approve_estate_claim(:'claim', '[{"hetu":"080834-909P","owner_name":"Veli Kivinen","share_num":1,"share_den":1}]') = 1,
  'ylläpito hyväksyy perukirjan ja lisää osakkaan');
select public.record_strong_auth(:'veli', '080834-909P', 'Veli Kivinen', 'kayttoonotto', 'mock');
\set u :olli
:as_user
select public.express_interest(:tampere, 'Kiinnostaisi Kivikko, onko myynnissä?');
\set u :veli
:as_user
select tests.ok((select count(*) from public.interests_received() where property_id = :tampere) = 1,
  'kuolinpesän osakas näkee kiinteistön kiinnostukset');
\set u :liisa
:as_user
select tests.ok((select count(*) from public.interests_received() where property_id = :tampere) = 1,
  'myös muut omistajat näkevät saman kiinnostuksen');
\set u :liisa
:as_user
select tests.ok(public.submit_listing(:'l_tampere') = 'odottaa_hyvaksyntaa', 'perukirjan jälkeen julkaisu etenee');
\set u :veli
:as_user
select tests.ok(public.decide_listing(:'l_tampere', true) = 'julkaistu', 'perukirjalla lisätty osakas hyväksyy');

-- ===========================================================================
-- 9. Omistuksen muutos rekisterissä (kauppa)
-- ===========================================================================
:as_admin
delete from private.ownership_registry_test where kiinteistotunnus = '24540100080150';
:as_service
select public.record_strong_auth(:'matti', '010170-901K', 'Matti Metsänen', 'kayttoonotto', 'mock');
\set u :matti
:as_user
select tests.ok((select count(*) from public.my_properties()) = 2, 'myyty kiinteistö poistuu omista');

\o
\echo 'kaikki testit ajettu'
