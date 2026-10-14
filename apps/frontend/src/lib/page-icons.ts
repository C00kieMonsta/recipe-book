export const PAGE_ICONS = { semaine: "📅", evenements: "🎉", recettes: "📖", ingredients: "🧅", courses: "🛒", clients: "👥", comptabilite: "💶", assistant: "💬", parametres: "⚙️", recette: "📖", evenement: "🎉", client: "🏢", particulier: "👤", fiche: "🔪", offres: "📋", devis: "🧮", offre: "📋" } as const;

export type PageIconKey = keyof typeof PAGE_ICONS;
