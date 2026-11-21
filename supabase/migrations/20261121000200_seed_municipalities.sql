-- Pilottikunnat, joista kaavatiedot haetaan automaattisesti.
-- Muut kunnat lisätään Tilastokeskuksen kuntaluokituksesta (scripts/), jolloin
-- kantohinta-alue tulee maakunnasta. Luken hinta-alueet (2019 alkaen):
--   1 Etelä-Suomi = Uusimaa, Varsinais-Suomi, Satakunta, Kanta-Häme, Pirkanmaa, Päijät-Häme
insert into municipalities (code, name, region_name, luke_price_area, zoning_pilot) values
  ('049', 'Espoo',    'Uusimaa',          '1', true),
  ('092', 'Vantaa',   'Uusimaa',          '1', true),
  ('245', 'Kerava',   'Uusimaa',          '1', true),
  ('753', 'Sipoo',    'Uusimaa',          '1', true),
  ('858', 'Tuusula',  'Uusimaa',          '1', true),
  ('837', 'Tampere',  'Pirkanmaa',        '1', true),
  ('604', 'Pirkkala', 'Pirkanmaa',        '1', true),
  ('853', 'Turku',    'Varsinais-Suomi',  '1', true)
on conflict (code) do update
  set name = excluded.name, region_name = excluded.region_name,
      luke_price_area = excluded.luke_price_area, zoning_pilot = excluded.zoning_pilot;
