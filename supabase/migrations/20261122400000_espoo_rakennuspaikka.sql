-- Espoon yleiskaava-alueen (AT/AME) rakennuspaikan hintataso tarkennettu vertailukohteella:
-- Bodom, 49-403-2-114, 1,01 ha omakotitalotontti yleiskaavan AT-alueella, pyyntihinta 160 000 €
-- (Oikotie 11/2026). Rakennuspaikan hinta sisältää sen alueen puuston (ks. land.ts).
update public.land_price_reference
   set eur = 150000,
       source = 'arvio: Espoo, asemakaavoittamaton omakotirakennuspaikka (vertailu: Bodom 1 ha, pyyntihinta 160 000 €, 11/2026)'
 where scope = 'kunta' and area_key = '049' and land_use = 'rakennuspaikka';
