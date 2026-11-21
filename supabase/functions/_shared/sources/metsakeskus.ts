/**
 * Metsäkeskuksen avoin metsävaratieto: metsikkökuviot (stand).
 * Avoin ja maksuton, lisenssi CC BY 4.0. Ei vaadi avainta.
 * Kenttäkuvaus: https://www.metsakeskus.fi/sites/default/files/document/tietotuotekuvaus-metsavarakuviot.pdf
 */
import { BBox, Feature, wfsGetFeatures } from "../wfs.ts";

export const METSAKESKUS_STAND_WFS = "https://avoin.metsakeskus.fi/rajapinnat/v1/stand/ows";

export function fetchStands(bbox: BBox): Promise<Feature[]> {
  return wfsGetFeatures({ endpoint: METSAKESKUS_STAND_WFS, typeName: "v1:stand", bbox });
}

/** Kehitysluokat (DEVELOPMENTCLASS) selkokielellä. */
export const DEVELOPMENT_CLASS: Record<string, string> = {
  "A0": "Aukea uudistusala",
  "S0": "Siemenpuumetsikkö",
  "T1": "Taimikko alle 1,3 m",
  "T2": "Taimikko yli 1,3 m",
  "Y1": "Ylispuustoinen taimikko",
  "02": "Nuori kasvatusmetsikkö",
  "03": "Varttunut kasvatusmetsikkö",
  "04": "Uudistuskypsä metsikkö",
  "05": "Suojuspuumetsikkö",
  "ER": "Eri-ikäisrakenteinen metsikkö",
};

/** Pääpuulaji (MAINTREESPECIES). */
export const TREE_SPECIES: Record<number, string> = {
  1: "Mänty",
  2: "Kuusi",
  3: "Rauduskoivu",
  4: "Hieskoivu",
  5: "Haapa",
  6: "Harmaaleppä",
  7: "Tervaleppä",
  8: "Muu havupuu",
  9: "Muu lehtipuu",
};
