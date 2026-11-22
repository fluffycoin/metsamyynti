-- Metsämyynti: testirekisteri oikeille kiinteistöille
--
-- Aiemman testirekisterin (20261121200600) kiinteistötunnukset olivat keksittyjä, joten
-- niitä ei löytynyt kartalta eikä property-summarysta. Nyt testihenkilöt "omistavat"
-- oikeita, Maanmittauslaitoksen rekisterissä olevia yksityisiä kiinteistöjä.
-- Omistajat ovat edelleen keksittyjä testihenkilöitä: oikeiden omistajien tietoja ei
-- ole tässä. Kun MML-lupa on saatu: ownership_source = 'mml' ja
-- truncate private.ownership_registry_test.
--
-- Kiinteistöt tarkistettu MML:n kiinteistörajapinnasta 22.11.2026 (rajat, pinta-ala),
-- Metsäkeskuksen kuvioista (metsää on) ja Espoon maanomistuskartasta (ei kaupungin maata).
-- Mikään ei ole valtion (893), yhteisalueen (876) eikä kunnan (9900–9999) rekisteriyksikkö.
--
--   858-409-10-2       Tuusula   19,7 ha metsää        Matti Metsänen 1/1
--   245-401-8-150      Kerava    0,27 ha rakennuspaikka Matti Metsänen 1/1
--   753-412-2-7        Sipoo     37 ha peltoa ja metsää Liisa Pelto 1/2, Pekka Pelto 1/2
--   604-413-10-31      Pirkkala  28,9 ha metsää        Aino Vainion kuolinpesä (Kalle 1/2, Sanna 1/4, Matti 1/4)
--   837-585-11-181     Tampere   4,4 ha metsää         Liisa Pelto 1/2, Toivo Kivisen kuolinpesä 1/2 (ei osakkaita)
--   49-456-1-101-M601  Espoo     määräala              Liisa Pelto 1/1

-- 1) Vanhat keksityt kiinteistöt pois testirekisteristä ja omistajista
create temporary table old_test_kt (kt char(14), maarala text);
insert into old_test_kt values
  ('85840100010010', null), ('24540200070008', null), ('75341500030021', null),
  ('60440400020055', null), ('83740100050003', null), ('04940100010001', '601');

delete from private.ownership_registry_test t
using old_test_kt o
where t.kiinteistotunnus = o.kt and t.maarala_no is not distinct from o.maarala;

delete from public.property_owners po
using public.properties p, old_test_kt o
where po.property_id = p.id and po.source in ('testi', 'perukirja')
  and p.kiinteistotunnus = o.kt and p.maarala_no is not distinct from o.maarala;

-- Keksityt kiinteistörivit pois, jos niihin ei ole ehditty tehdä ilmoitusta tai kiinnostusta
delete from public.properties p
using old_test_kt o
where p.kiinteistotunnus = o.kt and p.maarala_no is not distinct from o.maarala
  and p.source = 'omistajasynkka'
  and not exists (select 1 from public.listing_properties lp where lp.property_id = p.id)
  and not exists (select 1 from public.interests i where i.property_id = p.id);

drop table old_test_kt;

-- 2) Uudet oikeat kiinteistöt
insert into private.ownership_registry_test
  (kiinteistotunnus, maarala_no, property_name, hetu, owner_name, share_num, share_den, is_estate, estate_hetu)
values
  -- Tuusula 858-409-10-2, metsätila, yksi omistaja
  ('85840900100002', null, 'Tuusulan metsätila', '010170-901K', 'Matti Metsänen', 1, 1, false, null),
  -- Kerava 245-401-8-150, rakennuspaikka
  ('24540100080150', null, 'Keravan tontti',     '010170-901K', 'Matti Metsänen', 1, 1, false, null),
  -- Sipoo 753-412-2-7, peltoa ja metsää, kaksi yhteisomistajaa
  ('75341200020007', null, 'Sipoon pelto',       '150382-902B', 'Liisa Pelto', 1, 2, false, null),
  ('75341200020007', null, 'Sipoon pelto',       '220379-9034', 'Pekka Pelto', 1, 2, false, null),
  -- Pirkkala 604-413-10-31, metsä, kuolinpesä jonka osakkaat tiedossa
  ('60441300100031', null, 'Pirkkalan metsä',    '050545-9041', 'Aino Vainion kuolinpesä', 1, 1, true, null),
  ('60441300100031', null, 'Pirkkalan metsä',    '110868-9059', 'Kalle Vainio', 1, 2, false, '050545-9041'),
  ('60441300100031', null, 'Pirkkalan metsä',    '300491-9069', 'Sanna Vainio', 1, 4, false, '050545-9041'),
  ('60441300100031', null, 'Pirkkalan metsä',    '010170-901K', 'Matti Metsänen', 1, 4, false, '050545-9041'),
  -- Tampere 837-585-11-181, puolet kuolinpesällä ilman osakkaita -> julkaisu estyy
  ('83758500110181', null, 'Tampereen metsä',    '020260-908N', 'Toivo Kivisen kuolinpesä', 1, 2, true, null),
  ('83758500110181', null, 'Tampereen metsä',    '150382-902B', 'Liisa Pelto', 1, 2, false, null),
  -- Espoo 49-456-1-101-M601, määräala
  ('04945600010101', '601', 'Espoon määräala',   '150382-902B', 'Liisa Pelto', 1, 1, false, null);

-- 3) Jo tunnistautuneet testikäyttäjät saavat uudet kiinteistönsä heti (ei uutta tunnistusta)
do $$
declare
  p record;
begin
  if (select value from private.settings where key = 'ownership_source') is distinct from 'testi' then
    return;
  end if;
  for p in select id, identity_hash from public.profiles where identity_hash is not null loop
    perform private.sync_ownerships_from_test_registry(p.identity_hash);
    perform private.deliver_pending_interests(p.id), private.deliver_pending_approvals(p.id);
  end loop;
end $$;
