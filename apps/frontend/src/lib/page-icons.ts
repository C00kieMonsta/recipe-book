export const PAGE_ICONS = { semaine: "📅", evenements: "🎉", recettes: "📖", ingredients: "🧅", courses: "🛒", clients: "👥", comptabilite: "💶", depot: "📥", assistant: "💬", parametres: "⚙️", recette: "📖", evenement: "🎉", client: "🏢", particulier: "👤", fiche: "🔪", offres: "📋", devis: "🧮", offre: "📋", documents: "📄", document: "📄" } as const;

export type PageIconKey = keyof typeof PAGE_ICONS;
