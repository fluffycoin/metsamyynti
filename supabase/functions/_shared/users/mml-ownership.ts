/**
 * MML:n lainhuutotiedot henkilötunnuksella (käyttöön, kun käyttölupa on myönnetty).
 *
 * Palauttaa kaikkien niiden kiinteistöjen ja määräalojen KAIKKI omistajat, joissa henkilö on
 * lainhuudettu omistaja tai joiden omistajana on kuolinpesä, jonka osakas hän on. Rivimuoto on
 * sama kuin tietokannan private.replace_ownerships()-funktiolla.
 *
 * Toteutetaan MML:n kiinteistötietopalvelun (lainhuuto- ja omistajatiedot) rajapintaa vasten,
 * kun lupa ja tekniset tunnukset (MML_OWNERSHIP_API_URL, MML_OWNERSHIP_API_KEY) on saatu.
 * Siihen asti tietokannan asetus ownership_source = 'testi' ja tätä ei kutsuta.
 */
export interface OwnershipRow {
  kiinteistotunnus: string;      // 14 numeroa
  maarala_no: string | null;     // esim. "601"
  property_name: string | null;
  hetu: string;
  owner_name: string;
  share_num: number | null;
  share_den: number | null;
  is_estate: boolean;
  estate_hetu: string | null;
}

export function fetchMmlOwnerships(_hetu: string): Promise<OwnershipRow[]> {
  if (!Deno.env.get("MML_OWNERSHIP_API_URL")) {
    throw new Error("MML:n omistajatietojen rajapintaa ei ole vielä otettu käyttöön (käyttölupa puuttuu)");
  }
  // TODO: toteuta, kun MML:n rajapintakuvaus ja tunnukset on saatu luvan myötä.
  throw new Error("MML-omistajahaku ei ole vielä toteutettu");
}
