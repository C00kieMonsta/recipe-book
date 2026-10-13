import type { AppEvent } from "@packages/types";

export interface TourStep {
  // "week-stats", used for the counter and tests.
  key: string;
  // Static route, or a resolver that may return null (stay on the current route, centred card).
  route: string | ((ctx: TourContext) => Promise<string | null>);
  // data-tour value, null = centred card.
  anchor: string | null;
  title: string;
  body: string;
  // Shown on the centred card when the anchor is missing or the route resolved to null.
  fallbackBody?: string;
  // Replaces body while the workspace has no event.
  firstRunBody?: string;
  // Overrides on phones. Resolution order on a phone: phone.anchor, then anchor, then centred.
  phone?: { anchor?: string; title?: string; body?: string };
  // Fired after navigation and before the anchor wait, for pages that must open something (the checklist).
  before?: () => void;
  // data-tour value that shows once the page has loaded; the wait gives up early when it is visible without the anchor.
  loadedMark?: string;
}

export interface TourContext {
  // api.events.list, cached by the api layer.
  events: () => Promise<AppEvent[]>;
  // todayIso()
  today: string;
}

export const OPEN_CHECKLIST_EVENT = "tour:open-checklist";

export const TOUR_STEPS: TourStep[] = [
  {
    key: "week-stats",
    route: "/semaine",
    anchor: "week-stats",
    title: "Votre semaine",
    body: "La Semaine est votre page d'accueil. Cette ligne la résume : chiffre d'affaires signé, convives, préparations faites, et le mois en cours face à l'objectif. Cliquez le mois pour ouvrir la comptabilité.",
  },
  {
    key: "week-checklist",
    route: "/semaine",
    anchor: "week-checklist",
    title: "Ce qui manque pour la semaine",
    body: "Cette case liste ce qui manque avant de lancer la semaine : personnes, courses, prix, factures. Elle se remplit toute seule ; le lien bleu à droite règle chaque point.",
    firstRunBody: "Tant que le carnet est vide, cette case liste les cinq étapes pour démarrer. Ensuite elle dit chaque semaine ce qui manque ; le lien bleu à droite règle chaque point.",
    before: () => window.dispatchEvent(new CustomEvent(OPEN_CHECKLIST_EVENT)),
  },
  {
    key: "week-day",
    route: "/semaine",
    anchor: "week-day",
    title: "Un jour par colonne",
    body: "Cliquez le nom d'un jour pour l'ouvrir. Le + à côté crée un événement ce jour-là. Sous le nom : événements, convives, préparations faites sur le total.",
    phone: {
      title: "Un jour par section",
      body: "Touchez le nom d'un jour, ou un chiffre dans la bande L M M J V S D, pour l'ouvrir. Le + crée un événement ce jour-là.",
    },
  },
  {
    key: "breadcrumb",
    route: "/jour/aujourdhui",
    anchor: "breadcrumb",
    title: "Revenir à la semaine",
    body: "Vous êtes sur un jour. « Semaine » en haut ramène à la semaine en un clic, comme l'onglet Semaine. Le rond devant chaque préparation est son statut : vide à faire, bleu en cours, vert fait.",
    phone: {
      anchor: "back",
      body: "« ‹ Semaine » en haut à gauche ramène à la semaine. Le rond devant chaque préparation est son statut : vide à faire, bleu en cours, vert fait. Un tap le change, sans confirmation.",
    },
  },
  {
    key: "fiche-ingredients",
    route: async ({ events, today }) => {
      const all = await events().catch(() => [] as AppEvent[]);
      const withLine = all.filter((e) => e.recipes.length > 0).sort((a, b) => a.date.localeCompare(b.date));
      const ev = withLine.find((e) => e.date.slice(0, 10) >= today) ?? withLine[withLine.length - 1];
      return ev ? `/events/${ev.eventId}/lines/${ev.recipes[0].lineId}` : null;
    },
    anchor: "fiche-ingredients",
    title: "La fiche de préparation",
    body: "Les quantités sont déjà calculées pour les convives de l'événement : rien à recalculer. Cochez les ingrédients pendant la mise en place. Cuisiner montre la recette étape par étape ; Terminer marque la ligne faite.",
    fallbackBody: "Chaque recette au menu d'un événement a sa fiche : quantités déjà calculées pour les convives, ingrédients à cocher, et Cuisiner pour suivre la recette étape par étape. Créez un événement avec une recette pour la voir.",
  },
  {
    key: "assign",
    route: "/semaine",
    anchor: "assign",
    loadedMark: "week-checklist",
    title: "Attribuer le travail",
    body: "Les initiales sur une carte sont les personnes de Paramètres › Équipe. Cliquez-les pour attribuer l'événement ou une seule ligne. « Choisir qui fait quoi » dans la case Ce qui manque traite toute la semaine.",
    fallbackBody: "Les personnes de Paramètres › Équipe reçoivent le travail, par événement ou par ligne, depuis la carte de l'événement ou « Choisir qui fait quoi » dans la case Ce qui manque. L'onglet Par personne d'un jour montre la liste de chacun.",
    phone: {
      anchor: "planning-tabs",
      body: "Pour attribuer, utilisez « Choisir qui fait quoi » dans la case Ce qui manque. Pour voir ce que chacun doit faire, ouvrez un jour puis l'onglet Par personne.",
    },
  },
  {
    key: "events-list",
    route: "/events",
    anchor: "events-list",
    title: "Événements",
    body: "Tous vos événements, à venir et terminés. Pour refaire une semaine Hoona : ouvrez un événement Hoona, puis ⋯ › Dupliquer. Créer un événement pour un client remplit son menu depuis sa semaine type.",
  },
  {
    key: "comptes-tabs",
    route: "/comptes/journal",
    anchor: "comptes-tabs",
    title: "Comptabilité",
    body: "Journal : une ligne par facture, acompte ou achat. À facturer : à terminer, facturer ou encaisser. Aperçu et Compte de résultats : l'année. Prévisionnel : objectif et charges. Au réel : signé face à l'objectif.",
  },
  {
    key: "settings-tabs",
    route: "/settings",
    anchor: "settings-tabs",
    title: "Paramètres",
    body: "Équipe : les personnes à qui vous attribuez le travail. Catalogue : types de prestation et fournisseurs. Finances : charges fixes et objectif. Pour revoir cette visite : Général › Visite guidée, juste en dessous.",
  },
];
