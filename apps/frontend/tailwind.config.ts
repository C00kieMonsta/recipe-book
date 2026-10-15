import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Helvetica", "Arial", "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"'],
      },
      fontSize: {
        caption: ["12px", "1.4"],                                       // counters, gallery meta, strip letters
        sm: ["14px", "1.5"],                                            // database rows, toolbar, property names, tags
        base: ["16px", "1.5"],                                          // page body
        lead: ["18px", "1.5"],                                          // prep sheet reader
        h3: ["20px", { lineHeight: "1.3", fontWeight: "600" }],         // section heading
        h2: ["24px", { lineHeight: "1.3", fontWeight: "600" }],         // dialog title, login brand
        h1: ["30px", { lineHeight: "1.2", fontWeight: "700" }],         // page title, phone
        "h1-lg": ["40px", { lineHeight: "1.2", fontWeight: "700" }],    // page title, desktop
        cook: ["28px", "1.4"],
        "cook-lg": ["36px", "1.35"],
      },
      maxWidth: { doc: "44rem", wide: "76rem" },
      // Seven columns on laptops and on a landscape iPad; the rail is the iPad band where the sidebar becomes a menu button.
      screens: {
        cols: { raw: "(min-width: 1280px), ((min-width: 1024px) and (orientation: landscape))" },
        rail: { raw: "(min-width: 1024px) and (max-width: 1279.98px) and (orientation: landscape)" },
      },
      spacing: { block: "2rem", sidebar: "240px", topbar: "44px" },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        sidebar: {
          DEFAULT: "var(--sidebar)", hover: "var(--sidebar-hover)", active: "var(--sidebar-active)",
          foreground: "var(--foreground)", border: "var(--border)",                  // old names
          accent: "var(--sidebar-active)", "accent-foreground": "var(--foreground)",  // old names
          primary: "var(--primary)", "primary-foreground": "var(--primary-foreground)", ring: "var(--primary)",
        },
        surface: "var(--surface)",
        callout: "var(--callout)",
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        "input-bg": "var(--input-bg)",
        hover: "var(--hover)",
        active: "var(--active)",
        selected: "var(--selected)",
        overlay: "var(--overlay)",
        placeholder: "var(--placeholder)",
        icon: "var(--icon)",
        border: "var(--border)",
        divider: "var(--divider)",
        input: "var(--input)",
        ring: "var(--primary)",
        primary: { DEFAULT: "var(--primary)", hover: "var(--primary-hover)", foreground: "var(--primary-foreground)", soft: "var(--selected)" },
        link: "var(--link)",
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)", solid: "var(--danger-solid)" },
        destructive: { DEFAULT: "var(--danger)", foreground: "#ffffff", soft: "var(--danger-soft)" },   // old name
        secondary: { DEFAULT: "var(--muted)", foreground: "var(--foreground)" },                       // old name
        accent: { DEFAULT: "var(--selected)", foreground: "var(--primary)" },                           // old name
        popover: { DEFAULT: "var(--background)", foreground: "var(--foreground)" },                     // old name
        card: { DEFAULT: "var(--background)", foreground: "var(--foreground)" },                        // old name
        status: { todo: "var(--status-todo)", doing: "var(--status-doing)", done: "var(--status-done)" },
        tag: {
          "gray-bg": "var(--tag-gray-bg)",     "gray-fg": "var(--tag-gray-fg)",
          "brown-bg": "var(--tag-brown-bg)",   "brown-fg": "var(--tag-brown-fg)",
          "orange-bg": "var(--tag-orange-bg)", "orange-fg": "var(--tag-orange-fg)",
          "yellow-bg": "var(--tag-yellow-bg)", "yellow-fg": "var(--tag-yellow-fg)",
          "green-bg": "var(--tag-green-bg)",   "green-fg": "var(--tag-green-fg)",
          "blue-bg": "var(--tag-blue-bg)",     "blue-fg": "var(--tag-blue-fg)",
          "purple-bg": "var(--tag-purple-bg)", "purple-fg": "var(--tag-purple-fg)",
          "pink-bg": "var(--tag-pink-bg)",     "pink-fg": "var(--tag-pink-fg)",
          "red-bg": "var(--tag-red-bg)",       "red-fg": "var(--tag-red-fg)",
        },
      },
      // Old callers: rounded-lg on controls becomes 6px, rounded-md 4px, rounded-xl 8px, rounded-2xl 10px.
      borderRadius: { sm: "3px", DEFAULT: "4px", md: "4px", lg: "6px", xl: "8px", "2xl": "10px", "3xl": "12px" },
      boxShadow: {
        hairline: "var(--shadow-hairline)",
        outline: "var(--shadow-outline)",
        input: "var(--shadow-input)",
        card: "var(--shadow-card)",
        menu: "var(--shadow-menu)",
        dialog: "var(--shadow-dialog)",
        ring: "var(--shadow-ring)",
      },
      transitionDuration: { DEFAULT: "100ms" },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(({ addVariant }) => {
      addVariant("touch", "@media (hover: none)");
      addVariant("pointer", "@media (hover: hover)");
      // The raw screens above switch off Tailwind's max-* variants; the one in use is declared here.
      addVariant("max-md", "@media (max-width: 767.98px)");
    }),
  ],
} satisfies Config;
