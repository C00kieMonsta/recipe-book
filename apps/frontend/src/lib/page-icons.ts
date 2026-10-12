export const PAGE_ICONS = { semaine: "📅", evenements: "🎉", recettes: "📖", ingredients: "🧅", courses: "🛒", clients: "👥", comptabilite: "💶", parametres: "⚙️", recette: "📖", evenement: "🎉", client: "🏢", particulier: "👤", fiche: "🔪" } as const;

export type PageIconKey = keyof typeof PAGE_ICONS;
