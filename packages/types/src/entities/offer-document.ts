import type { VatRate } from "./ledger";

export type DocSeason = "printemps_ete" | "automne_hiver" | "toute_annee";
// plat: a dish or an article. exemple: the italic « ex : … » line. sous_titre: a light sub-header. note: a bold italic remark.
export type DocRowKind = "plat" | "exemple" | "sous_titre" | "note";
// How a price multiplies in a devis: per guest, per piece, per unit (box, cake, platter, bottle, 300 g).
export type DocUnitKind = "convive" | "piece" | "unite";

export interface DocChoice {
  // « un choix pour la table » = { count: 1, scope: "table" }; « sélection de 4 assiettes au choix » = { count: 4, scope: "table" }.
  count: number;
  scope: "table" | "convive";
  // Printed override; derived from count and scope when absent.
  label?: string;
}

export interface DocRow {
  rowId: string;
  kind: DocRowKind;
  text: string;
  // HTVA, this row alone. Absent on the rows of a formula (the section carries the price).
  price?: number;
  // Prints « àpd 4,50 € ».
  fromPrice?: boolean;
  // Printed in the price column when there is no price: « forfait (htva) en fonction de l'adresse », « supplément en fonction du nombre de personnes ».
  priceNote?: string;
  // Printed as typed: « à la pièce », « par 300 g », « gâteau 8 parts ». Defaults to the section's unitLabel.
  unitLabel?: string;
  unitKind?: DocUnitKind;
  // Printed in parentheses after the text: « chaud », « tiède / froid », « sans gluten », « en saison ».
  tags?: string[];
  // Only on sous_titre rows.
  choice?: DocChoice;
  // The recipe behind the dish; lets the section be costed through its offer.
  recipeId?: string;
}

export interface DocMinimum {
  qty: number;
  unit: "personnes" | "pieces" | "unites";
  // « minimum 20 pièces par sorte ».
  perSort?: boolean;
  // Printed override: « min par 12 », « entre 12 et 20 personnes ».
  label?: string;
}

export interface DocSection {
  sectionId: string;
  // « BUFFET 2, La Tavola Italiana », « Finger food / zakouskis froids », « Proposition de plats ».
  title: string;
  // Under the title in the band: « nombre de choix à définir en fonction du nombre de convives », « idéal pour entre 8 et 16 personnes ».
  intro?: string;
  // Formula price HTVA for the whole section; absent for a price list.
  price?: number;
  // Default « par personne ».
  unitLabel?: string;
  unitKind?: DocUnitKind;
  minimum?: DocMinimum;
  rows: DocRow[];
  // The 07 offer that costs this formula. Set by « Coster cette formule » and « + Section depuis une formule… »; cleared on duplicate.
  offerId?: string;
}

export interface DocServices {
  shown: boolean;
  // « SERVICES », « EXTRAS », « SERVICE (FACULTATIF) ».
  title: string;
  intro?: string;
  rows: DocRow[];
}

export interface DocVatLine {
  label: string;
  rate: VatRate;
}

export interface OfferDocument {
  documentId: string;
  // « Offre buffets automne hiver ». The year is separate so « Dupliquer pour 2027 » never edits the title.
  title: string;
  titleLower: string;
  year: number;
  season?: DocSeason;
  // 07 prestation key, optional. Gives the food VAT rate and the devis prestation.
  prestationType?: string;
  // Printed in « Type de prestation : … » as typed.
  prestationLabel: string;
  minGuests?: number;
  maxGuests?: number;
  // Printed override for the guests fact; derived from minGuests and maxGuests when absent.
  guestsLabel?: string;
  note?: string;
  sections: DocSection[];
  services: DocServices;
  conditions: string;
  vatLines: DocVatLine[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// One settings-table item per document.
export interface OfferDocumentItem {
  settingsId: `document:${string}`;
  document: OfferDocument;
  updatedAt: string;
}

export const DEFAULT_DOC_CONDITIONS =
  "Le retrait des commandes et le retour des plats s'effectue à Overijse sauf si une livraison est prévue. Les plats sont présentés dans des jolis plats de service, lesquels doivent être rapportés propres dans les 5 jours après l'événement. Présentation dans des plats jetables également possible sur demande.";

export const DEFAULT_DOC_SERVICES: DocServices = {
  shown: true,
  title: "SERVICES",
  intro: "Service sur place (en fonction du type d'événement et du nombre de convives)",
  rows: [
    { rowId: "cuisinier", kind: "plat", text: "Tarif horaire par cuisinier", price: 50, unitLabel: "€/heure (htva)", unitKind: "unite" },
    { rowId: "serveur", kind: "plat", text: "Tarif horaire par serveur (4h30 à 5h en moyenne)", price: 40, unitLabel: "€/heure (htva)", unitKind: "unite" },
    { rowId: "transport", kind: "plat", text: "Transport", priceNote: "forfait (htva) en fonction de l'adresse" },
    { rowId: "location", kind: "plat", text: "Location matériel supplémentaire", priceNote: "à voir ensemble" },
  ],
};

export const DEFAULT_DOC_VAT_LINES: DocVatLine[] = [
  { label: "Food à emporter", rate: 6 },
  { label: "Food avec service", rate: 12 },
  { label: "Extras", rate: 21 },
];

export const DOC_SERVICES_TITLES = ["SERVICES", "EXTRAS", "SERVICE (FACULTATIF)"];
export const DOC_VAT_LABELS = ["Food à emporter", "Food avec service", "Food", "Extras", "Services", "Livraison / location matériel"];

// Unit label to kind; the editor's presets. Anything else is typed free and defaults to "unite".
export const DOC_UNIT_PRESETS: Record<string, DocUnitKind> = {
  "par personne": "convive",
  "à la pièce": "piece",
  "par boîte de 20 pièces": "unite",
  "gâteau 8 parts": "unite",
  "par 300 g": "unite",
  "pour env. 12 personnes": "unite",
  "pour 6 personnes": "unite",
  "1 litre": "unite",
  "33 cl": "unite",
};

export const DOC_TAG_PRESETS = ["chaud", "tiède", "froid", "chaud / tiède / froid", "sans gluten", "en saison"];
export const MAX_OFFER_DOCUMENTS = 60;
