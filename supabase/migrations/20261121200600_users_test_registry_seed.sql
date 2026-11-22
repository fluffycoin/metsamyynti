-- Metsämyynti: testirekisterin omistajat (korvaa MML:n lainhuutotiedot testivaiheessa)
--
-- Henkilötunnukset ovat keksittyjä ja käyttävät yksilönumeroita 900–999, joita ei anneta
-- oikeille henkilöille. Tunnistusvälittäjän testitilassa ja mock-tilassa kirjaudutaan
-- näillä tunnuksilla. Kun MML-lupa on saatu: ownership_source = 'mml' ja
-- truncate private.ownership_registry_test.
--
-- Henkilöt:
--   010170-901K  Matti Metsänen   yksinomistaja (Tuusula, Kerava) ja kuolinpesän osakas (Pirkkala)
--   150382-902B  Liisa Pelto      yhteisomistaja (Sipoo), määräala (Espoo), yhteisomistaja kuolinpesän kanssa (Tampere)
--   220379-9034  Pekka Pelto      yhteisomistaja (Sipoo)
--   050545-9041  Aino Vainio      vainaja; Aino Vainion kuolinpesä omistaa Pirkkalan metsän
--   110868-9059  Kalle Vainio     kuolinpesän osakas
--   300491-9069  Sanna Vainio     kuolinpesän osakas
--   020260-908N  Toivo Kivinen    vainaja; kuolinpesällä ei vielä osakkaita (perukirja puuttuu)
--   121212A907S  Ella Ostaja      ei omistuksia (vahvasti tunnistautunut ostaja)

insert into private.ownership_registry_test
  (kiinteistotunnus, maarala_no, property_name, hetu, owner_name, share_num, share_den, is_estate, estate_hetu)
values
  -- Tuusula 858-401-1-10, metsätila, yksi omistaja
  ('85840100010010', null, 'Metsälä',      '010170-901K', 'Matti Metsänen', 1, 1, false, null),
  -- Kerava 245-402-7-8, rakentamaton tontti
  ('24540200070008', null, 'Kerava tontti', '010170-901K', 'Matti Metsänen', 1, 1, false, null),
  -- Sipoo 753-415-3-21, pelto, kaksi yhteisomistajaa
  ('75341500030021', null, 'Peltola',      '150382-902B', 'Liisa Pelto', 1, 2, false, null),
  ('75341500030021', null, 'Peltola',      '220379-9034', 'Pekka Pelto', 1, 2, false, null),
  -- Pirkkala 604-404-2-55, metsä, kuolinpesä jonka osakkaat tiedossa
  ('60440400020055', null, 'Vainionmetsä', '050545-9041', 'Aino Vainion kuolinpesä', 1, 1, true, null),
  ('60440400020055', null, 'Vainionmetsä', '110868-9059', 'Kalle Vainio', 1, 2, false, '050545-9041'),
  ('60440400020055', null, 'Vainionmetsä', '300491-9069', 'Sanna Vainio', 1, 4, false, '050545-9041'),
  ('60440400020055', null, 'Vainionmetsä', '010170-901K', 'Matti Metsänen', 1, 4, false, '050545-9041'),
  -- Tampere 837-401-5-3, puolet kuolinpesällä ilman osakkaita -> julkaisu estyy
  ('83740100050003', null, 'Kivikko',      '020260-908N', 'Toivo Kivisen kuolinpesä', 1, 2, true, null),
  ('83740100050003', null, 'Kivikko',      '150382-902B', 'Liisa Pelto', 1, 2, false, null),
  -- Espoo 49-401-1-1-M601, määräala
  ('04940100010001', '601', 'Rantapalsta', '150382-902B', 'Liisa Pelto', 1, 1, false, null);
