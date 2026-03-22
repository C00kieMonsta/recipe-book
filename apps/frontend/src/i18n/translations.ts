export const translations = {
  fr: {
    recipes: "Recettes",
    ingredients: "Ingrédients",
    logout: "Déconnexion",
    login: { title: "Connexion", email: "Email", password: "Mot de passe", submit: "Se connecter", error: "Identifiants invalides" },
  },
};

export type Language = keyof typeof translations;
export const getTranslation = (lang: Language) => translations[lang];
