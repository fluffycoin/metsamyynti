-- Datataulut ovat julkista tietoa (avoimista lähteistä): kaikki saavat lukea,
-- kirjoitus vain service_rolella (Edge Functions), joka ohittaa RLS:n.
do $$
declare t text;
begin
  foreach t in array array['municipalities', 'properties', 'forest_stands', 'stumpage_prices', 'zoning_areas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Hinta-arviot eivät ole julkisia; käyttäjäpuolen migraatiot lisäävät
-- omistajille lukuoikeuden (property_owners-taulun kautta).
alter table public.valuations enable row level security;

-- Tallennusfunktiot vain palvelimelle.
revoke execute on function public.upsert_property(text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.replace_forest_stands(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_zoning_areas(text, jsonb) from public, anon, authenticated;
grant execute on function public.property_summary(text, text) to anon, authenticated;
