# 03. Notion-like UI: build spec

Status: ready to build. Supersedes the visual rules of `REDESIGN.md` section 4 and of `02-planning-iteration.md`; the behaviour described there (swipe, status cycle, `?mode=personne`, `useBackLink`, `useFullBleed`) stays.

Base: design 0 ("system"). Grafted from the judges: the 14 inline-editing rules and the `Table` primitive (design 1), `useTopTitle` (design 1), "Terminer" as the last Cuisiner step (design 1), Paramètres split into view tabs (design 1), the callout checklist (design 2), `Par personne` as a third planning view tab (design 2), `DateNav` where the period label opens the date input (design 2), the `Filtrer · n` state with "Effacer les filtres" and a touch "Appliquer" (design 2).

Screens referenced: `/tmp/shots/s-week43-1366.png`, `s-week43-375.png`, `s-day-1366.png`, `n-day-375.png`, `f-prep-1366.png`, `f-prep-375.png`, `v2-cook-375.png`, `v2-event-1366.png`, `n-event-375.png`, `recipe-375.png`, `events-1366.png`, `client-1366.png`, `journal-1366.png`, `v2-afacturer-1366.png`, `v2-settings-1366.png`, `v2-login-375.png`.

Paths below are relative to `apps/frontend/` unless they start with `docs/`.

---

## 1. Summary and the rules

The app becomes a set of Notion pages. One white page, one sans font, one blue. A record page is: breadcrumb, emoji + big title, a property list (grey name on the left, value on the right, hover background on the value), then content blocks with 20px headings. A list page is: emoji + big title, one toolbar row (view tabs on the left, search, Filtrer, Trier, ⋯, + Nouveau on the right), then database rows at 14px with hairline dividers. Everything that was a bordered card, a dark pill, a brown button, a bordered select or a serif title goes away. Edits happen in place, where the value is. Row actions are hidden until hover (always visible on touch).

What the owner sees on day one after Developer A's first commit: the same screens, white, sans, blue, with hairlines instead of borders. Developers B, C and D then remove controls screen by screen.

### The ten rules

Check every screen against these before opening a PR.

1. **White page, one text colour.** Page background `#ffffff`, text `#37352f`, secondary text `#787774`, placeholder `rgba(55,53,47,0.4)`. No beige, no cream, no brown, no gradient. The sidebar is the only tinted surface (`#f7f7f5`), plus `#f7f7f5` stat rows and `#f1f1ef` callouts.
2. **One font.** System sans stack. `font-serif` does not exist. No uppercase labels, no letter-spacing.
3. **Fixed type scale.** Title 40/700 on desktop, 30/700 on phones. Section heading 20/600. Body 16. Database rows, toolbars, property names, tags: 14. Captions 12. Nothing else.
4. **Hairlines, not borders.** Dividers are `rgba(55,53,47,0.09)`; stronger lines (table head, totals) `rgba(55,53,47,0.16)`. Cards are `shadow-card`, never `border`. Controls have no border; the default button gets its edge from `shadow-outline`.
5. **One primary per page.** One `#2383e2` filled button per screen (`+ Nouveau`, `Cuisiner`, `Se connecter`, `Créer la facture`). Everything else is ghost, subtle or default. Links are `#2383e2` text.
6. **Sizes.** Toolbar and row controls 28px, standalone buttons and inputs 32px, the page primary 36px. Every control is 44px on `(hover: none)` through the `touch:` variant, never through a breakpoint. Radius 6px on controls, 3px on tags, 10px on dialogs.
7. **Tags are pastel.** Nine Notion pairs, 20px tall, 14px text, 3px radius. Status, category, type and billing state are tags. A tag that can change is a `SelectPill` (tag + chevron on hover + Menu).
8. **Facts are properties.** Any editable fact of a record (date, convives, client, prix, contact, statut, équipe, type, portions) is a `Property` row: icon, grey name, value with hover background. No bordered input on a record page. Bordered-looking inputs (`.input-field`, grey fill) exist only inside Dialogs, editor pages and the Login.
9. **Toolbar order.** On a list page: view tabs left; right group in this order: 🔍, Filtrer, Trier, ⋯, + Nouveau. Secondary actions (export, print, lock, share) live in ⋯. Filters are a Menu, never a row of `<select>`s or chips.
10. **Actions on hover, menus on touch.** Row actions (⋯, ×, drag handle) use `.reveal`. Every Menu and SelectPill renders as a bottom Sheet on touch; every Dialog renders as a Sheet on touch. Nothing navigates to a separate page to edit one value.

---

## 2. Tokens

### 2.1 `src/index.css`

Delete line 1 (the Google Fonts `@import` of Playfair Display and DM Sans). Replace the file with this. Values are hex or rgba, not HSL triplets, so `rgba()` tints work and `var(--x)` is used without `hsl()`.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Surfaces */
    --background: #ffffff;
    --sidebar: #f7f7f5;
    --sidebar-hover: rgba(55, 53, 47, 0.06);
    --sidebar-active: rgba(55, 53, 47, 0.08);
    --surface: #f7f7f5;                 /* stat rows, cook ingredient pane, sheet header */
    --callout: #f1f1ef;                 /* callout block */
    --muted: #f1f1ef;                   /* gray tag, thumbnails, avatar circles */
    --input-bg: rgba(242, 241, 238, 0.6);
    --hover: rgba(55, 53, 47, 0.08);
    --active: rgba(55, 53, 47, 0.08);   /* pressed state, current pagination page */
    --selected: rgba(35, 131, 226, 0.07);
    --overlay: rgba(15, 15, 15, 0.6);

    /* Text */
    --foreground: #37352f;
    --muted-foreground: #787774;        /* rgba(55,53,47,0.65) on white */
    --placeholder: rgba(55, 53, 47, 0.4);
    --icon: rgba(55, 53, 47, 0.45);     /* chevrons, drag handles, toolbar glyphs */

    /* Lines */
    --border: rgba(55, 53, 47, 0.09);   /* hairline: row dividers, toolbar bottom, cards */
    --divider: rgba(55, 53, 47, 0.16);  /* stronger: table head, footer totals, outlined buttons */
    --input: rgba(55, 53, 47, 0.16);

    /* Primary */
    --primary: #2383e2;
    --primary-hover: #0077d4;
    --primary-foreground: #ffffff;
    --link: #2383e2;

    /* Semantic (text / tint) */
    --success: #448361;  --success-soft: #edf3ec;
    --warning: #d9730d;  --warning-soft: #fbecdd;
    --info: #337ea9;     --info-soft: #e7f3f8;
    --danger: #d44c47;   --danger-soft: #fdebec;  --danger-solid: #eb5757;

    /* Pastel tags (bg / fg) */
    --tag-gray-bg: #f1f1ef;    --tag-gray-fg: #32302c;
    --tag-brown-bg: #f4eeee;   --tag-brown-fg: #64473a;
    --tag-orange-bg: #fbecdd;  --tag-orange-fg: #d9730d;
    --tag-yellow-bg: #fbf3db;  --tag-yellow-fg: #dfab01;
    --tag-green-bg: #edf3ec;   --tag-green-fg: #448361;
    --tag-blue-bg: #e7f3f8;    --tag-blue-fg: #337ea9;
    --tag-purple-bg: #f6f3f9;  --tag-purple-fg: #9065b0;
    --tag-pink-bg: #faf1f5;    --tag-pink-fg: #c14c8a;
    --tag-red-bg: #fdebec;     --tag-red-fg: #d44c47;

    /* Prep status (dot colour; the pill uses the tag pairs) */
    --status-todo: rgba(55, 53, 47, 0.45);   /* hollow circle stroke */
    --status-doing: #337ea9;                 /* filled, pill = tag-blue */
    --status-done: #448361;                  /* filled + white check, pill = tag-green */

    /* Shape */
    --radius: 6px;                           /* controls */
    --radius-tag: 3px;
    --radius-menu: 6px;
    --radius-dialog: 10px;
    --radius-sheet: 12px;

    /* Shadows */
    --shadow-hairline: 0 0 0 1px rgba(55, 53, 47, 0.09);
    --shadow-outline: 0 0 0 1px rgba(55, 53, 47, 0.16);
    --shadow-input: inset 0 0 0 1px rgba(55, 53, 47, 0.16);
    --shadow-card: rgba(15, 15, 15, 0.1) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 2px 4px;
    --shadow-menu: rgba(15, 15, 15, 0.05) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 3px 6px, rgba(15, 15, 15, 0.2) 0 9px 24px;
    --shadow-dialog: rgba(15, 15, 15, 0.05) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 5px 10px, rgba(15, 15, 15, 0.2) 0 15px 40px;
    --shadow-ring: rgba(35, 131, 226, 0.57) 0 0 0 1px inset, rgba(35, 131, 226, 0.14) 0 0 0 3px;

    /* Type */
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";

    /* Sizes */
    --control-sm: 28px;    /* toolbar controls, menu rows, desktop */
    --control-md: 32px;    /* buttons with text, inputs in forms, desktop */
    --control-lg: 36px;    /* primary action, login button, desktop */
    --control-touch: 44px; /* every control on (hover: none) */
    --sidebar-w: 240px;
    --topbar-h: 44px;
  }
}

@layer base {
  html { font-size: 16px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans text-base; }
  ::placeholder { color: var(--placeholder); }
  ::selection { background: rgba(35, 131, 226, 0.28); }
  h1, h2, h3 { @apply font-semibold; }
  a { color: inherit; }
  button, input, select, textarea { font: inherit; color: inherit; }
  select { background-color: transparent; }
}

@layer components {
  /* Old names kept so the 34 card callers and 147 input callers compile on day one. */
  .card { @apply rounded-lg bg-background shadow-card; }
  .card-elevated { @apply card; }
  .input-field { @apply h-8 w-full rounded-lg bg-input-bg px-2 text-sm shadow-input outline-none placeholder:text-placeholder focus:shadow-ring touch:h-11 touch:text-base; }
  textarea.input-field { @apply h-auto min-h-20 py-1.5 leading-normal; }
  select.input-field { @apply appearance-none pr-7 bg-no-repeat bg-[length:12px_12px] bg-[right_8px_center] bg-[url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23787774' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")]; }
  .input-compact { @apply h-7 text-sm; }
  /* Hover-revealed actions; always visible on touch. */
  .reveal { @apply pointer:opacity-0 pointer:group-hover:opacity-100 pointer:group-focus-within:opacity-100 pointer:focus-visible:opacity-100 touch:opacity-100; }
  /* Database row. */
  .row { @apply flex min-h-9 items-center gap-2 rounded px-2 text-sm hover:bg-hover touch:min-h-11 touch:text-base; }
  /* Inline-editable value: hover background, no border. */
  .prop-value { @apply -mx-1.5 cursor-text rounded px-1.5 hover:bg-hover; }
  /* Callout block. */
  .callout { @apply rounded-lg bg-callout px-4 py-3; }
  /* Database table. */
  .table { @apply w-full text-sm tabular-nums; }
  .table th { @apply h-9 border-b border-divider px-2 text-left align-middle text-sm font-medium text-muted-foreground; }
  .table td { @apply h-9 border-b border-border px-2 align-middle touch:h-11; }
  .table tbody tr:hover td { background: var(--hover); }
  .table tfoot td { @apply border-b-0 border-t border-divider font-semibold; }
  .animate-pop { animation: pop 120ms ease-out forwards; }
  .animate-fade-in { animation: fadeIn 150ms ease-out forwards; }
  .animate-fade-up { animation: fadeIn 150ms ease-out forwards; }   /* alias for the 13 old callers */
  .animate-sheet { animation: sheetUp 200ms ease-out forwards; }
  .rail-label { display: none; }                                       /* rail removed */
}

@page { margin: 12mm; }

@media print {
  aside, nav, .no-print { display: none !important; }
  body { font-size: 12pt; }
  .print-break { break-before: page; }
  [aria-haspopup="dialog"] .border-dashed { display: none !important; }
}

@keyframes pop { from { opacity: 0; transform: translateY(-2px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
```

### 2.2 `tailwind.config.ts`

Replace the whole file. `packages/ui/src` is dropped from `content`: nothing in `src/` imports `@packages/ui` (checked with grep), so its shadcn classes only bloat the scan.

```ts
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
    }),
  ],
} satisfies Config;
```

### 2.3 Old token to new token

Existing class names keep compiling. This table says what they now render.

| Old token (class) | New value | Note |
|---|---|---|
| `background` (`bg-background`) | `#ffffff` | was beige 97% |
| `foreground` (`text-foreground`) | `#37352f` | |
| `card`, `popover` | `#ffffff` | alias of background |
| `surface` | `#f7f7f5` | stat rows, cook pane |
| `hover` | `rgba(55,53,47,0.08)` | |
| `muted` | `#f1f1ef` | |
| `muted-foreground` | `#787774` | |
| `primary` | `#2383e2` | was brown-orange |
| `primary-foreground` | `#ffffff` | |
| `primary-soft` | `rgba(35,131,226,0.07)` | now means "selected"; see the sed table for decorative uses |
| `secondary` / `secondary-foreground` | `#f1f1ef` / `#37352f` | |
| `accent` / `accent-foreground` | selected tint / `#2383e2` | |
| `success` / `success-soft` | `#448361` / `#edf3ec` | |
| `warning` / `warning-soft` | `#d9730d` / `#fbecdd` | |
| `info` / `info-soft` | `#337ea9` / `#e7f3f8` | |
| `destructive` / `destructive-soft` | `#d44c47` / `#fdebec` | `danger` is the new name, both work |
| `border` | `rgba(55,53,47,0.09)` | hairline |
| `input` | `rgba(55,53,47,0.16)` | |
| `ring` | `#2383e2` | prefer `shadow-ring` |
| `sidebar` (`bg-sidebar`) | `#f7f7f5` | |
| `sidebar-accent` / `sidebar-accent-foreground` | `rgba(55,53,47,0.08)` / `#37352f` | active row |
| `sidebar-border` | hairline | the sidebar has no border; token kept for compile |
| `sidebar-primary`, `sidebar-ring` | `#2383e2` | |
| `rounded-lg` | 6px | was 10px |
| `rounded-md` | 4px | was 8px |
| `rounded-xl` / `rounded-2xl` | 8px / 10px | |
| `text-h1` / `text-h1-lg` | 30/700 / 40/700 | weight now included |
| `text-h2` / `text-h3` | 24/600 / 20/600 | |
| `text-caption` | 12px | was 13px |
| `font-serif` | removed | sed deletes the class |

New tokens with no old equivalent: `sidebar-hover`, `sidebar-active`, `callout`, `input-bg`, `active`, `selected`, `overlay`, `placeholder`, `icon`, `divider`, `link`, `primary-hover`, `danger-solid`, `status-*`, `tag-*`, the `shadow-*` set.

### 2.4 Type scale

| Role | Desktop | Phone | Class |
|---|---|---|---|
| Page title | 40/700 | 30/700 | `text-h1 md:text-h1-lg` |
| Dialog title, login brand | 24/600 | 24/600 | `text-h2` |
| Section heading | 20/600 | 20/600 | `text-h3` |
| Toggle block title, group label | 16/600 | 16/600 | `text-base font-semibold` |
| Body, property values, prep reader | 16 | 16 | `text-base` |
| Prep reader large | 18 | 18 | `text-lead` |
| Database rows, toolbar, tabs, tags, property names | 14 | 14 (16 on touch for row titles) | `text-sm` |
| Caption, counters, strip letters | 12 | 12 | `text-caption` |
| Cook current step | 36 | 28 | `text-cook md:text-cook-lg` |

`lint:type-scale` still passes (it forbids `text-xs`, 10px and 11px in `src/pages/admin`). Do not add `text-[10px]` anywhere, including `PersonChips`.

### 2.5 One sed pass (Developer A, first commit)

Colour tokens are now opaque or fixed-alpha, so slash modifiers stop working. Run these once over `src/`, commit, and the other three branch from it.

| Old class | New class | Count today |
|---|---|---|
| `bg-foreground/30`, `bg-foreground/40`, `bg-foreground/50` (overlays) | `bg-overlay` | 17 total `bg-foreground/` |
| `bg-foreground/60` (tick marks in MoneyTile) | `bg-divider` | in the 17 |
| `backdrop-blur-sm` | delete | 9 |
| `border-border/60`, `divide-border/60` | `border-border`, `divide-border` | 18 + 12 |
| `ring-2 ring-primary/40`, `focus:ring-2 focus:ring-primary/20` | `shadow-ring`, `focus:shadow-ring` | 3 |
| `text-muted-foreground/50` | `text-placeholder` | 3 |
| `hover:bg-muted/50` | `hover:bg-hover` | 4 |
| `border-destructive/40` | `shadow-outline text-danger` | 1 |
| `font-serif` | delete the class | 40 |
| `bg-foreground text-background` (dark active segment) | `bg-active font-medium text-foreground` | 7 |
| `bg-primary-soft` | `bg-selected` when it marks selection or today; `bg-muted` when it is decoration (avatars, thumbnails); `bg-tag-yellow-bg` on `<mark>` | 31, by hand |
| `rounded-full` on tags, chips and filter pills | `rounded-sm`; keep `rounded-full` only on avatars, the today circle, progress tracks | 38, by hand |
| `animate-fade-up` | keep (alias) | 13 |

---

## 3. Primitives

Shared sizes: toolbar and row controls `h-7` (28px), standalone buttons and inputs `h-8` (32px), page primary `h-9` (36px), everything `touch:h-11`. Text in controls `text-sm`, `touch:text-base`. Lucide icons `h-4 w-4` in 28px controls, `h-5 w-5` in 44px. Touch detection: `useTouchScreen()` from the new `src/hooks/use-touch-screen.ts` (the `matchMedia("(hover: none)")` hook moved out of `PersonPicker.tsx`).

### 3.1 New primitives (`src/components/ui`, all exported from `index.ts`)

**`Button.tsx`** (exports `Button`, `IconButton`)

```tsx
export const BUTTON_BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium leading-none transition-colors select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring";
export const BUTTON_SIZE = {
  sm: "h-7 px-2 text-sm touch:h-11 touch:px-3 touch:text-base",       // toolbar, row actions
  md: "h-8 px-2.5 text-sm touch:h-11 touch:px-3.5 touch:text-base",   // section actions, dialog footer
  lg: "h-9 px-3 text-base touch:h-11 touch:px-4",                     // page primary, login
};
export const BUTTON_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  default: "bg-background text-foreground shadow-outline hover:bg-hover",
  ghost: "text-foreground hover:bg-hover",
  subtle: "text-muted-foreground hover:bg-hover hover:text-foreground",
  link: "text-primary hover:bg-selected",
  danger: "bg-background text-danger shadow-outline hover:bg-danger-soft",
};
```

Props: `variant`, `size`, `icon?: ReactNode`, `as?: "button" | "a" | typeof Link`, plus the native button props. `IconButton`: square (`sm h-7 w-7`, `md h-8 w-8`, `lg h-9 w-9`, all `touch:h-11 touch:w-11`), variant `ghost` by default, icon `h-4 w-4 touch:h-5 touch:w-5`, colour `text-icon hover:text-foreground`, required `aria-label`.

**`Toolbar.tsx`**

```tsx
<Toolbar left={<ViewTabs … />} center={<DateNav … />} right={<>…</>} filters={<>chips</>} />
```

```
div "no-print flex h-10 items-center gap-1 border-b border-border touch:h-auto touch:min-h-12 touch:flex-wrap touch:gap-2"
  left   "flex min-w-0 items-center gap-0.5 overflow-x-auto"
  center "ml-2 flex items-center gap-0.5"                      (DateNav; on touch moves to a second row, full width)
  right  "ml-auto flex items-center gap-0.5"                   (IconButton 🔍, Button subtle sm "Filtrer", Button subtle sm "Trier", IconButton ⋯, Button primary sm "+ Nouveau")
filters row (only when non-empty) "flex flex-wrap items-center gap-1 py-1.5"
  chip "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-sm text-primary bg-selected shadow-[0_0_0_1px_rgba(35,131,226,0.35)] touch:h-9" + X 12px
```

On touch the right group keeps only ⋯ and + Nouveau; search, Filtrer, Trier and secondary actions become the first items of the ⋯ Sheet. The toolbar wraps to two rows on touch: row 1 tabs (scrolling) + ⋯ + primary, row 2 `center`.

**`ViewTabs.tsx`**

```tsx
<ViewTabs items={[{ key, label, to?, count? }]} value onChange? />
```

```
nav "flex items-center gap-0.5 overflow-x-auto"
tab (NavLink when `to`, else button): "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground touch:h-11 touch:text-base"
active: "text-foreground font-medium after:absolute after:inset-x-2 after:-bottom-[7px] after:h-0.5 after:rounded-full after:bg-foreground"
count: span "text-caption text-muted-foreground"
```

The underline sits on the toolbar hairline. Used for Semaine | Jour | Par personne, Journal | À facturer | …, À venir | Terminés | Tous, Toutes | Buffet | Plat …, Ventes | Achats, the Paramètres tabs.

**`DateNav.tsx`**

```tsx
<DateNav label="Semaine 43 · 19 au 25 oct." onPrev onNext onPick={(iso) => …} isToday onToday pickerType="date" | "week" | "month" />
```

```
group "inline-flex items-center gap-0.5"
prev/next: IconButton sm ChevronLeft / ChevronRight
label: button "inline-flex h-7 items-center gap-1 rounded px-2 text-sm font-medium hover:bg-hover touch:h-11 touch:text-base" + ChevronDown "h-3.5 w-3.5 text-icon"
       click opens a hidden native <input type={pickerType}> with showPicker() (the WeekPicker logic moves here)
"Aujourd'hui": Button subtle sm, hidden when isToday
```

Replaces `WeekPicker` + the separate "Aujourd'hui" link + the ‹ › around the title. One control group for Semaine, Jour and the Journal month pager.

**`FilterMenu.tsx`** (exports `FilterButton`, `FilterGroup`, `FilterOption`)

```tsx
<FilterButton count={n}>
  <FilterGroup label="Client" kind="radio" value onChange options={[{ value: "", label: "Tous les clients" }, …]} />
  <FilterGroup label="Personne" kind="radio" … renderOption={(o) => <><PersonChip …/> {o.label}</>} />
  <FilterGroup kind="check" options={[{ value: "masquer", label: "Masquer les lignes faites" }]} … />
</FilterButton>
```

Button: `Button subtle sm` with `SlidersHorizontal` 16px and "Filtrer"; when `count > 0` the label reads "Filtrer · n" with `text-primary bg-selected`. Pointer: a `Menu` panel 280px right-aligned; group label `"flex h-7 items-center px-2 text-caption text-muted-foreground"`, options as `Checkbox` rows (circle shape for radio) `"flex h-8 items-center gap-2 rounded px-2 text-sm hover:bg-hover"`; separator between groups; footer row "Effacer les filtres" `Button subtle sm` (hidden when `count === 0`). Each choice writes the URL param at once; the panel stays open until outside click or Escape. Touch: a `Sheet` titled "Filtrer" with "Effacer" on the right of the title row, 44px rows, and a 44px `Button primary` "Appliquer" at the bottom; choices commit on Appliquer. Active filters render as chips in the Toolbar `filters` slot.

**`PropertyList.tsx`** (exports `PropertyList`, `Property`)

```tsx
<PropertyList>
  <Property icon={Calendar} label="Date" kind="date" value={event.date} onSave={(v) => save({ date: v })} />
  <Property icon={Users} label="Convives" kind="number" value={event.guestCount} min={1} onSave={…} />
  <Property icon="🏢" label="Client" kind="relation" value={event.clientId} options={clients} href={(id) => `/clients/${id}`} onSave={…} />
  <Property icon={Tag} label="Prestation" kind="select" value={event.type} options={prestationTypes} colour="gray" onSave={…} />
  <Property icon={Euro} label="Prix / convive" kind="number" value={price} suffix="€ HTVA" decimals={2} onSave={…} />
  <Property icon={Circle} label="Statut" kind="status" value options onSave />
  <Property icon={Users} label="Équipe" kind="people" value={assignedTo} people={people} onSave={…} />
  <Property icon={Calculator} label="Coût matières" kind="computed" value="424,50 €" sub="estimé" />
</PropertyList>
```

Kinds: `text | multiline | number | date | select | status | relation | people | url | computed`. Props common to all: `icon` (lucide component or emoji string), `label`, `placeholder` ("Vide" by default), `sub?`.

```
dl "mt-3 flex flex-col"
Property: div "group flex min-h-[34px] items-start gap-2 touch:min-h-11"
  dt "flex h-[34px] w-40 shrink-0 items-center gap-1.5 text-sm text-muted-foreground touch:w-28 touch:h-11"
     icon: lucide "h-4 w-4 text-icon" or emoji span "w-4 text-center text-sm"
  dd "flex min-h-[34px] min-w-0 flex-1 flex-wrap items-center gap-1 py-1.5 text-base touch:min-h-11"
     editable value wraps in ".prop-value"; computed values have no hover and cursor-default
     empty: span "text-placeholder" with the placeholder
     relation: link "text-foreground underline decoration-divider underline-offset-2 hover:decoration-foreground" + ChevronDown "h-3 w-3 text-icon reveal"
```

`PropertyList` accepts `collapsibleAfter={n}`: rows past n hide behind a row "n propriétés de plus" (`Button subtle sm`, chevron). Use it only where the task says.

Inline-editing rules (apply to `Property`, page titles, menu-line portions, cost rows, settings rows):

1. Hover: only the value cell gets `bg-hover`. Nothing else changes.
2. Click or Enter on a focused cell starts editing. Text and number edit in place: the cell content becomes an input with the same font classes, no border, `bg-input-bg` + `shadow-ring`, caret at the end, text selected for numbers.
3. Enter commits. Escape reverts. Blur commits. Tab commits and focuses the next property.
4. Save is optimistic: the new value renders at once; on API error the old value comes back and a toast reads "Modification non enregistrée".
5. Number: accepts "," and "."; `min` clamps on commit; `decimals` rounds on commit; the suffix stays visible while editing; `inputMode="decimal"`.
6. Select and status: a `Menu` opens under the cell (a `Sheet` on touch) listing options as `Tag` pills with a check on the current one; one click selects and closes. No save step.
7. Relation (client): `Menu` with a `SearchSelect` row at the top, options with name and a `text-caption` detail; "+ Créer « … »" row when `onCreateNew` exists.
8. People: `PersonPicker` content (checkbox rows); each tick writes at once.
9. Date: a hidden `<input type="date">` opened with `showPicker()` over the cell; the chosen date commits at once.
10. Multiline (Notes): the block is a paragraph; click turns it into a growing textarea; Enter inserts a newline; Escape or blur commits.
11. Computed values are never editable.
12. Title: the `h1` is an `EditableText` at title size; Enter commits; an empty value reverts to the previous name.
13. Touch: every value cell is at least 44px tall; the native keyboard type follows `inputMode`.
14. Keyboard focus: `shadow-ring`, never a border change.

**`Checkbox.tsx`**

```tsx
<Checkbox checked onChange shape="square" | "circle" label? readOnly? />
```

```
label "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11"   (hit area; with `label` text: "inline-flex h-7 items-center gap-2 rounded px-1 text-sm hover:bg-hover touch:h-11 touch:text-base")
input sr-only
box span "flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px] border-[rgba(55,53,47,0.45)] bg-background transition-colors"
checked: "border-primary bg-primary text-primary-foreground" + Check "h-3 w-3" strokeWidth 3
shape="circle": "rounded-full"  (prep lines, cook ingredients, radio-style filter options)
```

Replaces `<input type="checkbox" class="h-5 w-5 accent-primary">` in Login and Settings, and the 24px bordered boxes in `RecipeReader`.

**`SelectPill.tsx`**

```tsx
<SelectPill value options={[{ value, label, colour, dot? }]} onChange placeholder? align? />
```

Trigger: `button "group inline-flex h-7 items-center gap-1 rounded px-1 -mx-1 hover:bg-hover touch:h-11"` containing `<Tag colour>{label}</Tag>` and `ChevronDown "h-3 w-3 text-icon reveal"`. Opens a `Menu` (Sheet on touch) where each option is its Tag with a check on the current one. Replaces: course selects on event lines, "Location/Personnel" on extra costs, prestation type, client type, facturation, TVA, the `no_type` select in the checklist, `EditableType`, `EditableStatus`, "Réglé ▾", the Jour "Grouper" control.

**`Menu.tsx`** (exports `Menu`, `MenuItem`, `MenuSection`, `MenuRadio`, `MenuCheck`, `MenuSeparator`, `useMenu`)

Pointer: popover.
```
panel "absolute z-50 mt-1 min-w-[200px] max-w-[320px] rounded-lg bg-background py-1 shadow-menu animate-pop"  (align "left" | "right")
item "mx-1 flex h-7 items-center gap-2 rounded px-2 text-sm hover:bg-hover aria-selected:bg-hover"
  icon "h-4 w-4 text-icon", label "flex-1 truncate", trailing "text-caption text-muted-foreground", check "h-4 w-4 text-primary"
danger item "text-danger hover:bg-danger-soft"
separator "my-1 h-px bg-border"
section label "px-3 pb-1 pt-2 text-caption text-muted-foreground"
```
Touch (`useTouchScreen()`): renders a `Sheet`; items become `h-11 px-4 text-base`. Closes on Escape, outside click, selection. `MenuRadio` and `MenuCheck` show the check on the right.

**`Sheet.tsx`**

```
overlay "fixed inset-0 z-50 bg-overlay animate-fade-in"
panel (bottom) "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-dialog animate-sheet"
panel (left, the phone sidebar) "fixed inset-y-0 left-0 z-50 w-[280px] overflow-y-auto bg-sidebar shadow-dialog"
grabber "mx-auto mt-2 h-1 w-9 rounded-full bg-divider"
header "flex h-11 items-center justify-between px-4 text-base font-semibold" + IconButton X (or a right slot)
```
Props: `open`, `onClose`, `side="bottom" | "left"`, `title?`, `headerRight?`.

**`Dialog.tsx`**

```
overlay "fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 animate-fade-in"
panel "w-full max-w-md rounded-2xl bg-background p-5 shadow-dialog animate-pop max-h-[90dvh] flex flex-col"  (size: sm max-w-sm, md max-w-md, lg max-w-2xl)
title h2 "text-base font-semibold" + IconButton X at the right
body "mt-3 overflow-y-auto text-sm touch:text-base"
footer "mt-5 flex justify-end gap-2"  (Button default md "Annuler", Button primary md)
```
On touch the Dialog renders as a bottom `Sheet` with the same children. Escape and overlay click close; focus is trapped.

**`Callout.tsx`**

```tsx
<Callout emoji="✅" title="À faire avant la semaine" count={3} collapsible open onToggle tone="default" | "success" | "warning" | "danger">…</Callout>
```

```
div ".callout flex gap-3"  (tone: default bg-callout; success bg-success-soft text-success; warning bg-warning-soft text-warning; danger bg-danger-soft text-danger)
emoji span "text-[20px] leading-none"
header (when title): button "flex h-7 w-full items-center gap-2 text-left text-sm font-medium touch:h-11" with ChevronRight "h-4 w-4 text-icon" (rotate-90 open) when collapsible, title, Tag gray count
body "mt-1 text-sm touch:text-base"
```
Used for the week checklist, "Comptabilité non configurée", "Semaine prête", API errors.

**`EmptyState.tsx`**

```
div "flex flex-col items-center gap-2 py-10 text-center"
p "text-sm text-muted-foreground touch:text-base"
optional Button link sm ("+ Nouvel événement")
```

**`Table.tsx`**

```tsx
<Table columns={[{ key, label, width?, align?, render }]} rows onRowClick rowHref? footer? groupBy? />
```
Renders `.table` on `md` and up (sticky header `sticky top-0 bg-background`). Below `md` it renders `ListRow`s: the first column as the title, the next two columns joined by " · " as the subtitle, the column marked `trailing: true` (amount, status tag) at the right. Group header rows: `td "pt-3 text-sm font-medium text-muted-foreground"`. Used by Recettes (list view), Événements, Journal, the client Historique, the client Semaine type, Paramètres lists.

### 3.2 Existing primitives (`src/components/ui`)

**`PageHeader.tsx`**. Breadcrumb: `nav "mb-3 flex flex-wrap items-center gap-0.5 text-sm text-muted-foreground"`, links `"inline-flex h-6 items-center rounded px-1 hover:bg-hover hover:text-foreground"`, separator `"px-0.5 text-icon"`. Title: `h1 "flex items-center gap-2 text-h1 md:text-h1-lg"` (delete `font-serif`). New props: `icon?: string` rendered as `span "text-[28px] leading-none md:text-[36px]"` before the text; `onTitleChange?` which renders the title as `EditableText` at title size (rule 12); `properties?: ReactNode` rendered after `meta`. Meta: `"mt-1 text-base text-muted-foreground"`. Actions: `"flex shrink-0 items-center gap-1"`, receives `Button` sm/md and `IconButton` only. Wrapper `mb-4`. Default icon comes from `src/lib/page-icons.ts` when the page passes `iconKey`.

**`Section.tsx`**. `section "mt-block"`, header `"flex min-h-7 items-center justify-between gap-2"`, `h2 "text-h3"`, meta `"text-sm text-muted-foreground"`, action `"flex items-center gap-1"` (Button subtle sm or ghost), body `"mt-3"`.

**`Tag.tsx`**. Prop `colour: gray | brown | orange | yellow | green | blue | purple | pink | red`, classes `bg-tag-{c}-bg text-tag-{c}-fg`. Element: `span "inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-sm leading-none"`. Keep `variant` as an alias for one release: `neutral→gray, primary→blue, success→green, warning→yellow, info→blue, danger→red, supplier→gray`. Delete `tint` and `softTint`; a coloured dot child carries any custom colour.

**`StatusTag.tsx`**. `upcoming: blue "À venir"`, `completed: green "Terminé"`, `invoiced: purple "Facturé"`, `deposit: yellow "Acompte reçu"`, `paid: green "Payé"`, add `unpaid: red "Impayée"`.

**`SupplierTag.tsx`**. `<Tag colour="gray">` with `span "h-2 w-2 rounded-full" style={{ background: color }}` then the name.

**`ListRow.tsx`**. `"group flex w-full min-h-9 items-center gap-3 rounded px-2 py-1 text-left hover:bg-hover touch:min-h-11"`; title `"truncate text-sm font-medium touch:text-base"`; subtitle `"truncate text-caption text-muted-foreground touch:text-sm"`; trailing `"flex shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums"`. New `icon?: ReactNode` leading slot. Hairline between rows comes from the parent `divide-y divide-border`. No `rounded-lg`, no 48px minimum.

**`StatusControl.tsx`**. Same export name and props (`value`, `onChange`; `size` ignored). Renders `<SelectPill>` with options `todo: gray "À faire"`, `doing: blue "En cours"`, `done: green "Fait"`, each with an 8px dot `"h-2 w-2 rounded-full bg-status-{s}"` inside the Tag. On touch the pill opens a Sheet. The three-segment control is deleted.

**`Stepper.tsx`**. Buttons `"h-7 w-7 rounded text-muted-foreground hover:bg-hover hover:text-foreground touch:h-11 touch:w-11"` (no border); input `"h-7 w-12 rounded bg-input-bg text-center text-sm font-medium tabular-nums shadow-input outline-none focus:shadow-ring touch:h-11 touch:w-14 touch:text-base"`; label `"text-sm text-muted-foreground"`; `×2` `÷2` `"h-7 rounded px-1.5 text-sm text-muted-foreground hover:bg-hover touch:h-11 touch:px-3"`. Group `"inline-flex items-center gap-0.5"`.

**`SectionToggle.tsx`**. Notion toggle block: `button "-mx-1 flex h-8 w-full items-center gap-1 rounded px-1 text-left hover:bg-hover touch:h-11"`, `ChevronRight "h-4 w-4 shrink-0 text-icon transition-transform"` (`rotate-90` open), title `"text-base font-semibold"`, content `"mt-2 pl-5"`. Wrapper `"mt-6"`.

**`FieldLabel.tsx`**. `"mb-1 block text-sm text-muted-foreground"`. Used only inside Dialogs, editor pages and the Login.

**`MoneyTile.tsx`**. `"block rounded-lg bg-surface p-3"` (link variant adds `hover:bg-hover`); label `"text-sm text-muted-foreground"`; value `"mt-0.5 text-h3 tabular-nums"`; sub `"text-caption text-muted-foreground"`; progress track `"h-1 rounded-full bg-divider"`, fill `"bg-primary"`, tick `"w-px bg-divider"`, tick label `"text-caption text-muted-foreground"`. Tiles in a grid use `gap-2`; a group of tiles reads as one `bg-surface` stat row when the caller wraps them in `"grid rounded-lg bg-surface divide-x divide-border"` and passes `flat` (no own background).

**`RecipeReader.tsx`**. Ingredient list `ul "mt-2"` (no `divide-y`); rows `li "flex min-h-8 items-center gap-2 touch:min-h-11"`; tick button becomes `<Checkbox shape="circle">` (only when `checkable`); name `"min-w-0 flex-1"`; qty `"shrink-0 font-medium tabular-nums"` with unit `"font-normal text-muted-foreground"`. Headings `text-h3`. Steps `ol "mt-3 space-y-3"`, number `span "w-6 shrink-0 text-right text-muted-foreground tabular-nums"` (no circle badge), text `"min-w-0 flex-1 whitespace-pre-wrap"`. `<mark>` in `StepText`: `"rounded-sm bg-tag-yellow-bg px-0.5 text-inherit"`. `size="xl"` keeps `text-lead`.

**`editable.tsx`**. `EditableText` display `"${className} prop-value"`, empty `"text-placeholder"` (no italic); editing input/textarea: same font classes plus `"-mx-1.5 w-full rounded bg-input-bg px-1.5 shadow-ring outline-none"` (no bottom border). `EditableInlineText` / `EditableInlineNum`: display `strong "prop-value font-medium"`, editing `input "-mx-1 w-32 rounded bg-input-bg px-1 shadow-ring outline-none font-medium"`. `EditableNum`: `className="input-field w-20 text-right tabular-nums"`. `EditableType` becomes `<SelectPill colour="gray">`. `EditableStatus` becomes `<SelectPill>` with `upcoming: blue`, `completed: green`. All follow the 14 rules above.

**`ActionMenu.tsx`**. Trigger `IconButton size="sm"` with `MoreHorizontal`, `aria-label="Plus d'actions"`; list `Menu`. Items keep `{ label, icon, onClick, variant }`; add `{ kind: "separator" }`, `{ kind: "check", checked }`, `{ kind: "section", label }`.

**`SearchSelect.tsx`**. Input `.input-field`; listbox `"absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-background py-1 shadow-menu"`; rows `"mx-1 flex h-7 items-center justify-between gap-2 rounded px-2 text-sm hover:bg-hover touch:h-11 touch:text-base"`; active row `bg-hover`; detail `"text-caption text-muted-foreground"`; create row `"text-primary"` with `border-t border-border mt-1 pt-1`.

**`Pagination.tsx`**. Buttons `"inline-flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm text-muted-foreground hover:bg-hover hover:text-foreground touch:h-11 touch:min-w-11"`; current `"bg-active font-medium text-foreground"`; arrows same classes; count `"text-sm text-muted-foreground"`.

**`NumericInput.tsx`**. No class of its own; suffix `"text-sm text-muted-foreground"`.

**`IngredientFormModal.tsx`**. Built on `Dialog` (`md`), title "Nouvel ingrédient" / "Modifier l'ingrédient", fields `FieldLabel` + `.input-field`, supplier `SearchSelect`, footer `Button danger md` left, `Button default md` + `Button primary md` right. Sheet on touch (through Dialog).

### 3.3 Admin components (`src/components/admin`)

**`AdminLayout.tsx`**. `main "flex-1 min-w-0 bg-background"`; padding when not fullBleed `"px-4 pb-8 pt-[56px] md:px-12 md:pt-10 xl:px-24"`; fullBleed `"px-4 pb-8 pt-[56px] md:px-6 md:pt-6"`. Record pages wrap content in `"mx-auto max-w-doc"`, list and planning pages in `"max-w-wide"`. When the sidebar is collapsed, render `IconButton sm ChevronsRight` at `"fixed left-2 top-2 z-30 hidden md:inline-flex"`. Add `useTopTitle(title: string)` next to `useBackLink`: the phone top bar shows it centred.

**`AdminSidebar.tsx`**. Desktop `aside "sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col bg-sidebar md:flex"` (no border). Brand row `"group mx-1 mt-1 flex h-9 items-center gap-2 rounded px-2 hover:bg-sidebar-hover"`: logo `span "flex h-5 w-5 items-center justify-center rounded-sm bg-muted text-caption font-semibold"` "A", name `"truncate text-sm font-medium"`, collapse `IconButton sm ChevronsLeft "ml-auto reveal"`. Nav `"mt-2 flex flex-col"`; row `"mx-1 flex h-7 items-center gap-2 rounded px-2 text-sm text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"`, active `"bg-sidebar-active font-medium text-foreground"`, emoji `span "w-5 text-center text-base leading-none"`. Emojis from `src/lib/page-icons.ts`. Logout row at the bottom `"mx-1 mb-2 mt-auto"`, same row classes. The 84px rail, `WIDE_PX`, `collapsedPref` rail mode and `.rail-label` are deleted: collapsed means hidden (same localStorage key). Phone top bar `"fixed inset-x-0 top-0 z-40 flex h-topbar items-center gap-1 border-b border-border bg-background px-2 md:hidden"`: left `IconButton lg Menu` or back link `Button ghost sm "‹ Label"`; centre `span "min-w-0 flex-1 truncate text-center text-sm font-medium"` from `useTopTitle`; right slot empty (pages keep their ⋯ in the toolbar). Drawer becomes a left `Sheet` with 44px rows at 16px, closes on navigation.

`src/lib/page-icons.ts` (new):
```ts
export const PAGE_ICONS = { semaine: "📅", evenements: "🎉", recettes: "📖", ingredients: "🧅", courses: "🛒", clients: "👥", comptabilite: "💶", parametres: "⚙️", recette: "📖", evenement: "🎉", client: "🏢", particulier: "👤", fiche: "🔪" } as const;
```

**`PlanningBar.tsx`**. Becomes a thin wrapper around `Toolbar`: `left` = `ViewTabs [Semaine] [Jour] [Par personne]`; `center` = `DateNav`; `right` = the page's slot (`FilterButton`, ⋯, + Nouveau). Delete `BACK_BTN`, the `h1` (moves to `PageHeader` on the page), `below`, `TODAY_BTN`. `DayStrip` stays the second row: `"sticky top-topbar z-20 bg-background py-1 md:static"`, shown on phones for both views and on the Jour page on desktop (`lg:hidden` there, as the week columns carry the dates on wide screens: keep today's behaviour).

**`DayStrip.tsx`**. Cell `"relative flex h-11 flex-col items-center justify-center gap-0.5 rounded hover:bg-hover"`, letter `"text-caption text-muted-foreground"`, number `"flex h-5 w-5 items-center justify-center rounded-full text-sm font-medium tabular-nums touch:text-base"`, count `"text-caption text-muted-foreground"`. Today: number `bg-danger-solid text-white`. Selected: cell `bg-selected`, letter and count `text-primary`. No underline, no beige.

**`WeekPicker.tsx`**. Its native-input logic moves into `DateNav`; the file is deleted once `Week.tsx` and `Day.tsx` use `DateNav`.

**`WeekChecklist.tsx`**. Renders a `Callout` (`emoji="✅"`, title "À faire avant la semaine", gray count tag, collapsible, state persisted as today). Items `li "flex min-h-7 items-center gap-2 text-sm touch:min-h-11"`: a static `Checkbox shape="circle" readOnly` (unchecked, `pointer-events-none`), text `"min-w-0 flex-1"`, action `Button link sm` ("Assigner", "Créer", "Voir", "Facturer"); the `no_type` select becomes `SelectPill` "Choisir ▾". Grid `xl:grid-cols-2 gap-x-8` kept. Done state: `Callout tone="success" emoji="✅"` "Semaine prête, rien à faire avant lundi", not collapsible.

**`AssignSheet.tsx`**. `Dialog lg` on pointer, full-height `Sheet` on touch. Header `"flex h-11 items-center justify-between border-b border-border px-4 text-base font-semibold"`. Day heading `"mt-2 text-sm font-medium text-muted-foreground"`. Event-level person toggles: `button "inline-flex h-7 items-center gap-1 rounded-sm pl-0.5 pr-2 text-sm shadow-outline hover:bg-hover touch:h-11"` with a 20px avatar and name; on: `"bg-selected text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)]"`. Line-level initials: `"h-7 w-7 rounded hover:bg-hover touch:h-11 touch:w-11"` around a 20px circle: on `"bg-selected text-primary"`, inherited `opacity-50`, off `"border border-dashed border-divider text-icon"`. "Comme l'événement": `Button subtle sm`. Footer `Button primary md "Terminé"`.

**`PersonChips.tsx`**. Sizes `sm "h-5 w-5 text-caption"`, `md "h-6 w-6 text-caption"` (no 10px text). Chip `"inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium leading-none text-foreground"`, overlap ring `ring-1 ring-background`. Overflow `+n` same circle, `text-muted-foreground`. Empty add circle `"border border-dashed border-divider text-icon"` with `UserPlus "h-3 w-3"`. With `onClick`, wrapped in `button "h-7 rounded px-0.5 hover:bg-hover touch:h-11"`.

**`PersonPicker.tsx`**. Import `useTouchScreen` from `src/hooks/use-touch-screen.ts`. Pointer: `Menu` panel `"min-w-[220px] p-1"`, rows `"flex h-8 items-center gap-2 rounded px-2 text-sm hover:bg-hover"`: `Checkbox` 16px, avatar 20px, name. "Comme l'événement" row with a circle checkbox. Touch: bottom `Sheet`, rows `h-11 text-base`. Footer `Button primary sm "Suivant"` when `onNext`.

**`StatusDot.tsx`**. `Dot` `"inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"`; todo `"border-[1.5px] border-[rgba(55,53,47,0.45)]"`; doing `"bg-status-doing"`; done `"bg-status-done text-white"` + `Check "h-3 w-3" strokeWidth 3`. `StatusDot` hit area `"h-7 w-7 rounded hover:bg-hover touch:h-11 touch:w-11"`, click cycles (unchanged). `StatusDots` deleted; its four callers (`StatusDot.tsx`, `Week.tsx`) use `StatusControl`.

---

## 4. Screens

Legend: `[Btn]` default button, `[+ Btn]` primary blue, `(tag)` pastel tag, `☐` 16px checkbox, `○ ● ✓` status dot, `▸` toggle block, `⋯` icon button, `▾` opens a Menu, `(AM)` 20px avatar. Desktop: title 40/700, h2 20/600, body 16, rows 14, toolbar controls 28px. Phone: title 30/700, controls 44px.

Phone chrome, common to every screen: top bar 44px white with a hairline, left `☰` or `‹ Label`, centre the page title (14/500, from `useTopTitle`), right empty. Sidebar is a left Sheet (280px, `#f7f7f5`, 44px rows). Every Menu, SelectPill and Dialog is a bottom Sheet. Content starts at 56px.

### 4.1 Sidebar

1366:
```
┌──────────────────────────┐
│ [A] La Table d'Amélie  « │  36px row; « revealed on hover (collapse)
│                          │
│  📅 Semaine              │  28px rows, 14px, #787774
│  🎉 Événements           │  active: bg rgba(55,53,47,.08), #37352f, 500
│  📖 Recettes             │
│  🧅 Ingrédients          │
│  🛒 Courses              │
│  👥 Clients              │
│  💶 Comptabilité         │
│  ⚙️ Paramètres           │
│                          │
│  ⏻ Déconnexion           │  bottom, same row style
└──────────────────────────┘
```
375: `☰` in the top bar opens the left Sheet with the same rows at 44px / 16px.

Removed: the 84px rail with labels under icons, the rail toggle, the gradient round avatar, the serif brand, the brown active tint, the right border, the border above Déconnexion, the top drawer on phones.

### 4.2 Semaine (`/semaine/:isoWeek`, full bleed, `max-w-wide`)

1366:
```
 📅 Semaine 43                                                                 40/700
 Signé 4 884 € · 224 conv. · Mois 11 758 € / 16 000 € ›                        16 grey, link to /comptes/apercu
 [Semaine] [Jour] [Par personne]   ‹  Semaine 43 · 19 au 25 oct. ▾  ›  Aujourd'hui     Filtrer ▾   ⋯   [+ Nouveau]
 ─────────────────────────────────────────────────────────────────────────────── hairline
 ┌ callout #f1f1ef ──────────────────────────────────────────────────────────┐
 │ ▾ ✅ À faire avant la semaine (3)                                           │
 │   ○ 6 lignes sans personne (1 événement)                       Assigner    │
 │   ○ Courses non créées (8 évén.)                               Créer       │
 │   ○ 1 facture impayée · 1 092 € · la plus ancienne du 26/09    Voir        │
 └────────────────────────────────────────────────────────────────────────────┘

 Lun 19          Mar 20          Mer 21        …    Sam 24      Dim 25
 1 · 30 conv. +  2 · 42 conv. +  1 · 30 conv. +     aucun   +   aucun   +      12 grey meta; + on hover
 (AM)            (AM)(KR)        (AM)                                           20px grey circles, click filters
 ┌────────────┐  ┌────────────┐  ┌────────────┐
 │ Hoona (AM) │  │ Hoona (AM) │  │ Hoona (AM) │                               cards: white, shadow-card, radius 6, 14px
 │ 30 conv·1 l│  │ 30 conv·1 l│  │ 30 conv·2 l│
 └────────────┘  └────────────┘  └────────────┘
  ○ Lunch bowl  (AM) 30   ○ Poulet b.  (AM) 30   ○ Risotto  (AM) 30             28px rows, hover bg, dot cycles
                          ┌────────────┐         ○ Mousse   (AM) 30
                          │ Philippson │
                          └────────────┘
                           ○ Risotto (KR) 12
  + Nouveau               + Nouveau              + Nouveau                      ghost row, on column hover
```

375:
```
 ☰            Semaine 43
 📅 Semaine 43                                30/700
 Signé 4 884 € · 224 conv. · Mois 11 758 / 16 000 € ›
 [Semaine] [Jour] [Par personne]        ⋯  [+ Nouveau]
 ‹  Semaine 43 · 19 au 25 oct. ▾  ›    Aujourd'hui
  L 19  M 20  M 21  J 22  V 23  S 24  D 25    44px strip, sticky; today red circle
   1     2     1     2     2
 ▾ ✅ À faire avant la semaine (3)            callout, 44px rows
 Lun 19   1 évén. · 30 conv.              ›   14/600, 44px, links to the day
 ┌──────────────────────────────┐
 │ Hoona             30 conv. (AM)│          card, 44px
 └──────────────────────────────┘
   ○ Lunch bowl pois chiches tahini  30 (AM)  44px row, dot cycles the status
   + Nouvel événement                         ghost row
 Mar 20   2 évén. · 42 conv.              ›
 …
```

Rules: the title has no arrows; `DateNav` lives in the toolbar. "Filtrer ▾" opens the FilterMenu with two radio groups (Client, Personne); active values show as blue chips under the toolbar; `Filtrer · 1` when set. ⋯ holds: section "Afficher" with check rows "Afficher les lignes" / "Afficher les événements"; Courses de la semaine; Imprimer; Imprimer par personne; Partager avec Kristoff / Amélie. "+ Nouveau" goes to `/events/new?date=<monday or today>`. Today's column: no tint; the date number gets the red 20px circle. Past days `opacity-60`. Swipe still changes the week on touch.

Removed: the dark "Semaine | Jour" and "Lignes | Événements" segments, the two selects, the bordered "Courses de la semaine", the bordered ⋯, the bordered checklist card and its "Réduire ^" link, the orange action links, the right-aligned "Signé / Mois" block, the orange "Aujourd'hui", the "19 au 25 octobre ▾" bordered picker, the serif title, the ‹ › around the title, the always-visible column "+", the beige today column, the hover `StatusDots` row.

### 4.3 Jour (`/jour/:date`)

1366:
```
 Semaine 42 / Sam 17 oct                                                      14 breadcrumb
 📅 Samedi 17 octobre                                                         40/700
 1 événement · 60 convives · 6 lignes · 0 faites                              16 grey
 [Semaine] [Jour] [Par personne]   ‹  Sam. 17 oct. ▾  ›  Aujourd'hui    Grouper : Événement ▾   Filtrer ▾   ⋯
 ─────────────────────────────────────────────────────────────────────────────
  L 12   M 13   M 14   J 15   V 16   (S 17)   D 18                            44px strip to lg; selected blue tint
   1      2      1      3      1       1       1

 Mariage Dupont                                                  6 lignes     20/600 + grey count
 60 convives · Buffet avec service                                            14 grey
 (○ À faire ▾)  Mini quiches lorraines            Apéritif          (KR)  60   36px rows, name 16px
 (● En cours ▾) Houmous de betterave   Apéritif · Se garde 4 j     (AM)  60
 (○ À faire ▾)  Verrines saumon fumé citron       Entrée            (KR)  60
 …
```

375:
```
 ‹ Semaine 42       Samedi 17 octobre
 📅 Samedi 17 octobre                         30/700
 1 événement · 60 convives · 6 lignes · 0 faites
 [Semaine] [Jour] [Par personne]          ⋯
 ‹  Sam. 17 oct. ▾  ›    Grouper : Événement ▾
  L 12  M 13  M 14  J 15  V 16 (S 17) D 18
 Mariage Dupont                       6 lignes
 60 convives · Buffet avec service
 ○  Mini quiches lorraines           (KR)  60   44px rows; the dot taps À faire → En cours → Fait
    Apéritif
 ●  Houmous de betterave             (AM)  60
    Apéritif · Se garde 4 jours au frais
```

Rules: the status is one `StatusControl` pill (gray/blue/green) that opens a Menu; on touch the 16px dot with a 44px hit area cycles (existing `StatusDot` behaviour), the pill is not shown. The whole row is the link to the fiche; no chevron. "Grouper ▾" is a `SelectPill` with Événement, Catégorie, Recette (Par personne is the third view tab, mapped to the existing `?mode=personne`; the `Par personne` option leaves the pill). "Filtrer ▾" holds the Personne radio group and the check "Masquer les lignes faites". ⋯ holds Courses du jour, Imprimer, Imprimer par personne, Partager…, Terminer l'événement (past days). Par personne view: group headings `(AM) Amélie` 20/600 with a `Share2` IconButton on the right, "Sans personne" with a `Button link sm "Assigner tout"`.

Removed: the tinted "‹ Semaine 42" button, the four-segment "Par événement | …" group and its phone select, the "Toutes les personnes" select and its phone twin, the bordered ⋯, the 240px three-segment status per row (6 × 3 buttons), the row chevrons, the strip underline and beige today cell, the serif title.

### 4.4 Fiche de préparation (`/events/:eventId/lines/:lineId`, chrome hidden, `max-w-doc`)

1366:
```
 Semaine 42 / Mar 13 / Poulet basquaise                 ‹ 2/2 ›   ⋯   [+ Cuisiner]     breadcrumb 14; pager 28px; primary 36px
 🔪 Poulet basquaise                                                                   40/700
 # Portions      30                                                                   editable number
 ◫ Catégorie     (Plat)
 🎉 Événement    Hoona · Mar 13 oct                                                    link
 👤 Personne     (AM) Amélie
 ⊙ Statut        (● En cours ▾)                                                       StatusControl pill
 ─────────────────────────────────────────────── hairline
 Ingrédients pour 30                                                                  20/600
 ○ Poulet fermier                                   5,4 kg                            32px rows, 18px text, circle checkbox
 ○ Poivron rouge                                    1,8 kg
 …
 Préparation
 Quantités adaptées pour 30 portions (recette de base : 10)                           14 grey
 1   Découper le poulet en morceaux et les saler. …                                   18px, grey number
 2   Émincer les oignons …
 ▸ Note pour cette fois
```

375:
```
 ‹ Mar 13            ‹ 2/2 ›         ⋯
 Poulet basquaise                    30/700
 Portions     30
 Catégorie    (Plat)
 Événement    Hoona
 Personne     (AM) Amélie
 Ingrédients pour 30
 ○ Poulet fermier               5,4 kg      44px, 18px text
 …
 Préparation
 1  Découper le poulet …
 ───────── sticky bottom, white, hairline ─────────
 (● En cours ▾)                   [🍳 Cuisiner]   44px pill wrapper + 44px primary
```

Rules: one column; property list under the title; the Statut row is omitted on phones because the sticky bar carries it. ⋯ holds Texte plus grand (check), Modifier les portions, Quantités de base (check), Tout décocher, Modifier la recette, Imprimer.

Removed: the right-side card with the three-segment status and the brown Cuisiner, the tinted "‹ Mar 13" button and the separate "Semaine 42" link, the "Aa" button, the "30 portions · Plat · Hoona (AM)" sentence, the 24px bordered checkboxes and the dividers between ingredients, the circled step numbers, the serif title.

### 4.5 Cuisiner (`/recipes/:id/cook`, full screen)

1366 and 375 (same layout; on 1366 the ingredient pane is a 320px left column with `bg-surface`):
```
 ×   Tarte au citron                               Étape 2 / 6     44px bar, 16/600 + 14 grey
     60 portions · Famille Dupont
 ───────────────────────────────────────────────────
 Quantités adaptées pour 60 portions (recette de base : 10)         12 grey
 1. Sabler [750 g] de beurre froid …                              16 grey (previous step)
 2. Étaler la pâte sur 3 mm et foncer un cercle de 26 cm.         28px sans (36 desktop), #37352f
    Piquer le fond et cuire à blanc 20 minutes à 170 °C.
 3. Zester et presser les citrons …                               16 grey (next step)
 ───────────────────────────────────────────────────
 ☰ Ingrédients (5)                              60 portions        44px row, bg #f7f7f5 (phone only; opens a Sheet)
 [‹ Précédent]                                  [Suivant ›]        44px, default + primary
```

Rules: scaled numbers use the yellow tag tint; the pane and the Sheet use circle checkboxes, 16px rows, with the portions `Stepper` in the header. On the last step "Suivant" becomes "Terminer": it sets the line to `done` and returns to the day (or the fiche) it came from. Swipe stays.

Removed: the serif step text, the tinted "‹ Jour" back (now ×), the brown primary, the beige ingredient bar, the 2xl footer radius (now 6px).

### 4.6 Événement (`/events/:id`, `max-w-doc`)

1366:
```
 Semaine 42 / Sam 17 oct / Mariage Dupont                [Terminer l'événement]   ⋯      default 32px + ghost
 🎉 Mariage Dupont                                                                        40/700, inline editable
 📅 Date            Samedi 17 octobre
 👥 Convives        60
 🍽 Prestation      (Buffet avec service ▾)
 🏢 Client          Famille Dupont
 💶 Prix / convive  55 € HTVA
 ☎ Contact          Claire Dupont · Ajouter un téléphone · claire.dupont@example.be       three inline texts, each with a placeholder
 🏷 Statut          (À venir ▾) (Acompte reçu)                                            status SelectPill + read-only billing tag
 👩‍🍳 Équipe          (KR) Kristoff  (AM) Amélie  +                                         + opens PersonPicker
 ⏱ Heures passées   0 h                                                                   editable number
 ─────────────────────────────────────────────────────────────
  Coût matières      Revenu HTVA       Marge            Marge %       stat row, bg #f7f7f5, divide-x, values 20/600
  424,50 € estimé    3 300,00 €        2 455,50 €       74,4 %

 Menu · 6 lignes                                        + Recette    20/600, ghost action
 Apéritif                                                            16/600 group label (no toggle)
   ⠿ ○ Mini quiches lorraines                 60 port.   (KR)   ⋯     36px rows; handle and ⋯ on hover
   ⠿ ● Houmous de betterave · Se garde 4 j    60 port.   (AM)   ⋯
 Entrée
   ⠿ ○ Verrines saumon fumé citron            60 port.   (KR)   ⋯
 …
   + Ajouter une recette                                             ghost row, opens the recipe SearchSelect inline
 Coûts supplémentaires · 420,00 €                       + Ajouter
   Location vaisselle          (Location ▾)   180 €    ×(hover)
   Extra service Kristoff 8h   (Personnel ▾)  240 €    ×(hover)
 Facturation                    [Enregistrer un acompte]  [+ Créer la facture]     default 32 + primary 32
   Acompte · Acompte Mariage Dupont · 2 octobre · 446,43 € HTVA        (Payé le 2 octobre)
 Notes
   Allergie noix pour 2 invités                                      multiline block, placeholder "Ajouter une note…"
```

375:
```
 ‹ Sam 17        Mariage Dupont      ⋯ (top bar ⋯ = page menu + Terminer l'événement)
 🎉 Mariage Dupont                   30/700
 Date         Samedi 17 octobre      44px rows, name column 112px
 Convives     60
 Prestation   (Buffet avec service ▾)
 Client       Famille Dupont
 Prix/conv.   55 € HTVA
 Contact      Claire Dupont
              claire.dupont@example.be
              Ajouter un téléphone
 Statut       (À venir ▾) (Acompte reçu)
 Équipe       (KR) Kristoff (AM) Amélie +
 [Terminer l'événement]                        default, full width 44px
  Coût matières 424,50 €   Revenu 3 300,00 €   2×2 stat grid, bg #f7f7f5
  Marge 2 455,50 €         Marge % 74,4 %
 Menu · 6 lignes                     + Recette
 Apéritif
  ○ Mini quiches lorraines   60 port. (KR)  ⋯   44px rows, ⋯ always visible, no handle
  …
```

Rules: every editable fact is a property row. The course select leaves the rows (the group label says it); row ⋯ holds Changer de catégorie ▸, Monter, Descendre, Modifier les portions, Attribuer, Note, Ouvrir la fiche, Retirer. Portions are an `EditableInlineNum`. The event status pill offers À venir / Terminé; choosing Terminé runs the same handler as the button. "Terminer l'événement" stays a visible default button (primary once the date is past). The only blue primary is "Créer la facture". Categories are plain 16/600 labels, not toggles.

Removed: the meta sentence with inline fields, the 6 category selects, the 6 up/down arrow pairs, the 6 bordered ⋯, the 2 permanently visible kind selects, the 4 bordered money cards, the pill-shaped bordered team toggles, the brown Terminer button, the "Heures" section (now a property), the category `SectionToggle`s, the bordered "+ Recette" and "+ Ajouter", the bordered Notes textarea, the serif title.

### 4.7 Événements (`/events`, `max-w-wide`)

1366:
```
 🎉 Événements                                                    [+ Nouvel événement]      primary 36px
 21 événements                                                                             16 grey
 [À venir] [Terminés] [Tous]                                🔍   Filtrer ▾   Trier ▾   ⋯
 ──────────────────────────────────────────────────────────────────────────────── hairline
 Nom                          Date          Client           Conv.   Prestation            Montant     Statut
 Hoona · lundi 12 oct.        Lun 12 oct    Hoona             30     (Menu à emporter)      420,00 €   (À venir)
 Hoona · mardi 13 oct.        Mar 13 oct    Hoona             30     (Menu à emporter)      420,00 €   (À venir)
 Mariage Dupont               Sam 17 oct    Famille Dupont    60     (Buffet avec service) 3 300,00 €  (À venir)
 …                                                                                          36px rows, 14px, hover bg
 21 résultats                                                                   ‹ 1 2 ›
```

375: tabs scrolling + `🔍 ⋯ + Nouveau`; `Table` renders 44px `ListRow`s: name 16/500, "Lun 12 oct · 30 conv. · Hoona" 14 grey, amount + status tag right.

Rules: the three filters become view tabs with the same filter logic; "Filtrer ▾" holds Client (radio) and Prestation (radio); "Trier ▾" Date ↑/↓; 🔍 expands into a 220px `.input-field input-compact` in place; ⋯ holds Imprimer la liste. Row click opens the event.

Removed: the dark "À venir" pill and its two outlined siblings, the client select, the full-width bordered search, the brown button, the two-line rows, the serif title.

### 4.8 Recette (`/recipes/:id`, `max-w-doc`)

1366:
```
 Recettes / Tarte au citron                                   [Modifier]   ⋯   [+ Cuisiner]     default 32, ghost, primary 36
 📖 Tarte au citron                                                                             40/700
 🏷 Format         (Buffet ▾)
 👥 Portions       10
 ⚖ Poids/pers      110 g
 💶 Coût           2,14 € / portion                                                             computed, grey sub "21,40 € pour 10"
 Pâte sablée maison et crème au citron cuite à la casserole, montée au beurre.                 16, inline editable
 ─────────────────────────────────────────────
 Ingrédients                           − 10 +  portions  ×2 ÷2                                  ghost 28px stepper in the heading row
 Farine                                                            250 g                       32px rows, no checkbox
 Beurre                                                            250 g
 …
 Préparation
 1  Sabler 125 g de beurre froid avec la farine …
 2  Étaler la pâte sur 3 mm …
 ▸ Coût matières
 ▸ Simulation de prix
```

375:
```
 ‹ Recettes        Tarte au citron        ⋯
 📖 Tarte au citron                       30/700
 Format       (Buffet ▾)
 Portions     10
 Poids/pers   110 g
 Pâte sablée maison et crème au citron …
 Ingrédients
 − 10 +  portions  ×2 ÷2                  44px ghost stepper on its own line
 Farine                          250 g    44px rows, 16px
 …
 Préparation
 1  Sabler 125 g …
 ▸ Coût matières
 ▸ Simulation de prix
 ───────────────── sticky bottom ─────────
 [🍳 Cuisiner]                [Modifier]   44px, primary + default
```

Rules: the three grey chips become property rows; "Aa" moves into ⋯ ("Texte plus grand"); ⋯ also holds Dupliquer, Exporter, Supprimer. Cost and price simulation are toggle blocks with 16/600 titles. Photo, when present, sits above the title at `aspect-[3/2] rounded-lg` with no card.

Removed: the three pill chips, the floating "Aa", the 10px-radius bordered stepper, the circled step numbers, the divided ingredient rows, the rounded card around the photo, the brown bottom bar, the serif title.

### 4.9 Recettes (`/recipes`, `max-w-wide`)

1366:
```
 📖 Recettes                                                       [+ Nouvelle recette]
 32 recettes
 [Toutes] [Buffet] [Plat] [Dessert] [Apéritif]   ·   [Liste] [Galerie]        🔍   Trier ▾   ⋯
 ──────────────────────────────────────────────────────────────────────────── hairline
 Galerie:
 ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
 │  photo 3:2 │ │            │ │            │ │            │   cards: shadow-card, radius 6, hover bg
 │ Tarte au   │ │ Poulet     │ │ …          │ │            │   title 14/500, meta 12 grey
 │ (Buffet) 10 p │ (Plat) 30 p│ │            │ │            │
 └────────────┘ └────────────┘ └────────────┘ └────────────┘
 Liste (Table):
 Nom                        Format     Portions   Coût / port.   Poids
 📖 Tarte au citron          (Buffet)   10         2,14 €         110 g       36px rows
 32 résultats                                            ‹ 1 2 3 ›
```

375: type tabs scrolling; `🔍 ⋯ + Nouvelle`; always the list (44px `ListRow`s with a 40px thumbnail).

Rules: type chips become view tabs (first group); Liste | Galerie is a second small tab pair, persisted in localStorage, default Galerie on desktop. ⋯ holds Exporter Excel, Importer, Doublons. The duplicate warning stays as a 16px `AlertTriangle` in `text-tag-orange-fg` before the name.

Removed: the full-width bordered search, the pill chips, the bordered ⋯, the bordered gallery cards, the brown button, the serif title.

### 4.10 Ingrédients (`/ingredients`, `max-w-wide`; not in the screenshot set)

1366:
```
 🧅 Ingrédients                                                    [+ Nouvel ingrédient]
 148 ingrédients
 [Tous] [Par fournisseur]                                   🔍   Filtrer ▾   Trier ▾   ⋯
 ──────────────────────────────────────────────────────────────────────────── hairline
 Nom                     Unité    Prix          Fournisseur            Recettes
 Farine                  kg       1,20 €        (● Delhaize)           12            36px rows; click opens IngredientFormModal (Dialog)
 …
 148 résultats                                            ‹ 1 2 3 ›
```
375: `Table` as 44px rows: name, "kg · 1,20 € · Delhaize" subtitle, count trailing.

Rules: "Filtrer ▾" holds Fournisseur (radio) and "Sans prix" (check); "Trier ▾" Nom, Prix; ⋯ holds Doublons (`/ingredients/doublons`), Importer, Exporter. `IngredientDuplicates` becomes a list of groups with `Callout` headers and `Button default sm` "Fusionner" per group.

Removed: the full-width search, bordered row buttons, the brown button.

### 4.11 Client (`/clients/:id`, `max-w-doc`)

1366:
```
 Clients / Hoona                                                    [Facturer le mois]   ⋯
 🏢 Hoona                                                           40/700, inline editable
 🏷 Type                  (Entreprise ▾)
 👤 Contact               Léa Martens
 ☎ Téléphone              Ajouter un téléphone
 ✉ Email                  lea@hoona.example
 📍 Adresse               Vide
 # Numéro de TVA          Vide
 🧾 Facturation           (Mensuelle ▾)
 🍽 Prestation par défaut (Menu à emporter ▾)
 % TVA par défaut         (6 % ▾)
 💶 Prix par convive      14 €
 👥 Convives par défaut   30
 📝 Notes                 Livraison à 11h30 à la réception, bacs gastro récupérés le lendemain.
 ─────────────────────────────────────────────────────────
 Semaine type                                    Un modèle par jour de livraison
  Jour       Convives   Prix                 Menu                                       ⋯
  Lundi      30         14,00 € · 420 €      (Lunch bowl pois chiches tahini ×30)       ⋯    36px rows; click opens the day Dialog
  Mardi      30         14,00 € · 420 €      (Poulet basquaise ×30)                     ⋯
  Mercredi   30         14,00 € · 420 €      (Risotto ×30) (Mousse au chocolat ×30)     ⋯
  …
  Samedi     + Ajouter un jour                                                               ghost link row
  Dimanche   + Ajouter un jour
 Historique                                 [Associer les événements existants]              default 28px
  Hoona · vendredi 23 oct.    Ven 23 oct · 30 convives                 (Signé 420,00 €)      36px rows
  …
 Journal
  Aucune écriture pour ce client.                                                            EmptyState
```

375: top bar "‹ Clients · Hoona"; property list with 112px names, 44px rows; Semaine type as 44px rows "Lundi · 30 conv. · 420 €" with the recipe tags on a second line and ⋯ visible; Historique rows 44px; "Facturer le mois" full-width default in the Journal section.

Rules: the form becomes a property list; each field saves through the same `update` call on commit (rule 3). The row ⋯ holds Modifier, Créer depuis un événement, Supprimer; the empty-day ghost row opens the day Dialog and its ⋯ holds Créer depuis un événement. The day editor keeps its fields but rendered as a property list inside a `Dialog md`. All properties stay visible (no `collapsibleAfter` here).

Removed: 11 bordered inputs and selects with bold labels, the duplicated day name under each day heading, the 10 per-day buttons and 4 empty-day buttons, the bordered "Associer", the bordered ⋯, the serif title.

### 4.12 Clients (`/clients`, `max-w-wide`; not in the screenshot set)

1366:
```
 👥 Clients                                                        [+ Nouveau client]
 8 clients
 [Tous] [Entreprises] [Particuliers]                       🔍   Trier ▾   ⋯
 ──────────────────────────────────────────────────────────────────────────── hairline
 Nom              Type           Contact          Facturation    Événements   Signé 2026
 🏢 Hoona          (Entreprise)   Léa Martens      (Mensuelle)    42           17 640 €      36px rows
 👤 Famille Dupont (Particulier)  Claire Dupont    (Par événement) 1           3 300 €
```
375: 44px rows, name 16/500, "Léa Martens · Mensuelle" subtitle, amount trailing.

Removed: bordered search, cards, the brown button.

### 4.13 Courses (`/courses/:id`, `GroceryListPage`, `max-w-doc`; not in the screenshot set)

1366:
```
 Semaine 43 / Courses                                              ⋯   [Imprimer]
 🛒 Courses · Semaine 43                                           40/700
 📅 Période        19 au 25 octobre
 🎉 Événements     8
 ─────────────────────────────────────────────
 (● Delhaize)                                                      16/600 group label with the supplier tag
 ☐ Farine                                          5 kg            32px rows, 16px, square checkbox, ticked rows grey + line-through
 ☐ Beurre                                          3,2 kg
 (● Barn)
 ☐ Poulet fermier                                  12 kg
 Sans fournisseur
 ☐ Sel                                             200 g
```
375: same, 44px rows; "Imprimer" in the top-bar ⋯. ⋯ holds Regrouper par fournisseur / par recette (radio), Tout décocher, Partager.

Removed: bordered cards per supplier, the bordered checkboxes, the serif title.

### 4.14 Journal (`/comptes/journal`)

1366:
```
 💶 Comptabilité                                                                                       40/700
 [Journal] [À facturer] [Aperçu] [Compte de résultats] [Prévisionnel] [Au réel]                        ViewTabs (ComptesLayout)
 ───────────────────────────────────────────────────────────────────────────────────────────── hairline
 [Ventes] [Achats]     ‹  septembre 2026 ▾  ›  Aujourd'hui          Filtrer : Tous ▾    ⋯    [+ Nouvelle ligne]
 ───────────────────────────────────────────────────────────────────────────────────────────── hairline
 Acomptes 0,00 € · Commissions 150,00 € (hors CA) · À encaisser 1 242,00 € · 2 non réglées             14 grey stat line
 N°        Date        Intitulé                     Type                    Total TVAC   HTVA        TVA %   Réglé
 2026-031  12/09/2026  Buffet anniversaire Lambert  (Buffet avec service)    1 881,60 €  1 680,00 €  12 %    (Payé)
 2026-032  19/09/2026  Buffet réunion Philippson    (Buffet à emporter)        742,00 €    700,00 €   6 %    (Impayée)
 …                                                                           36px rows, 14px, hairlines; click opens the line Dialog
 Total                                                                     4 759,10 €  4 347,92 €
 ▸ Détail du CA par type · 4 197,92 €                                                                   collapsed toggle
```

375: Comptabilité tabs scroll; line 2 `[Ventes] [Achats]  ⋯  [+ Nouvelle ligne]`; line 3 the month `DateNav`; the stat line wraps; the table renders 44px `ListRow`s (Intitulé title, "N° · Date · Type" subtitle, TVAC + status tag trailing). "Filtrer" lives in ⋯ with the active value as a chip.

Rules: the year and month selects become a month `DateNav` (`pickerType="month"`); the 7 chips become "Filtrer : Tous ▾" (`SelectPill`, radio: Tous, Non réglés, Événements, Comptoir, Acomptes, Commissions, Notes de crédit); Exporter 2026 (xlsx), CSV du mois, Verrouiller le mois (danger item when locking) move to ⋯; the three side tiles become one stat line; the per-type breakdown is a collapsed `SectionToggle`. `LedgerEntryForm` renders inside a `Dialog lg` with `FieldLabel` + `.input-field` rows in a two-column grid, footer "Annuler" / "Enregistrer".

Removed: 2 selects, 7 chips, 3 bordered buttons, the bordered "Ventes | Achats" pill, the "Septembre 2026" h2, 3 bordered tiles, 10 always-visible breakdown rows, 48px table rows with bold headers, the brown underline on the tabs, the serif title.

### 4.15 À facturer (`/comptes/a-facturer`)

1366:
```
 💶 Comptabilité
 [Journal] [À facturer] [Aperçu] [Compte de résultats] [Prévisionnel] [Au réel]
 ──────────────────────────────────────────────────────────────────────────── hairline
  À facturer · 0            Impayées · 1                            stat row, bg #f7f7f5, two MoneyTiles flat
  0,00 € HTVA               1 092,00 € TVAC
 Événements passés à terminer                                       20/600 + gray count tag
  Aucun événement passé à terminer.                                 14 grey
 À facturer
  Rien à facturer.
 Factures impayées · 1 092,00 € TVAC
  n° 2026-033 · Chef à domicile Van Acker · 26/09 · 1 092,00 € TVAC · 16 jours     (Non réglée ▾)    36px row, links to the event
```
375: the stat row is the existing sticky footer (kept); rows 44px; the pill opens a Sheet.

Rules: "Réglé ▾" becomes a `SelectPill` (red "Non réglée" → green "Réglée"); choosing "Réglée" opens the existing mode / date form inside the Menu panel (a Sheet on touch). "Terminer" per past event: `Button default sm` inline on desktop, 44px primary on phones.

Removed: the 2 bordered tiles, the bordered "Réglé" button, the serif title.

### 4.16 The other Comptabilité tabs (`/comptes/apercu`, `/resultats`, `/previsionnel`, `/au-reel`)

Same `ComptesLayout` header. Every bordered tile becomes a `MoneyTile` inside a `bg-surface` stat row; every table uses `.table` (36px rows, grey 500 header, hairlines, `tfoot` totals on a `divider` line); every year or month `<select>` becomes a `DateNav` or a `SelectPill` in a `Toolbar` row under the tabs; section headings `text-h3`; explanatory text `text-sm text-muted-foreground`. Aperçu chart colours: `COLOR_N1 = "#787774"`, `COLOR_N = "#2383e2"`, `COLOR_OBJ = "#448361"`, `COLOR_PREV = "#37352f"` (replace the four `hsl(var(--…))` strings in `Apercu.tsx` lines 48 to 51; they would otherwise read as invalid colours). Chart grid lines `rgba(55,53,47,0.09)`, axis text `#787774` at 12px. 375: tables render as `ListRow`s; stat rows become 2×2 grids.

Removed: bordered tiles, bordered selects, the serif title.

### 4.17 Paramètres (`/settings`, `max-w-doc`)

1366:
```
 ⚙️ Paramètres                                                          [Enregistrer]     primary 32, only when dirty
 [Général] [Catalogue] [Équipe] [Finances] [Société]                                      ViewTabs bound to the URL hash
 ──────────────────────────────────────────────────────────────────────────── hairline
 (Catalogue)
 Fournisseurs                                                          + Ajouter          20/600, ghost action
  ● Barn            Adresse…          Téléphone…                        ⋯(hover)          32px rows, inline edit on click
  ● Vds             Adresse…          Téléphone…                        ⋯
 Formats de recette                                                    + Ajouter
  ⠿ Buffet                                                              ⋯
 Catégories du menu                                                    + Ajouter
  ⠿ Apéritif                                                            ⋯
 Types de prestation                                                   + Ajouter
  Nom                  Clé                   TVA
  Menu à emporter      menu_a_emporter       (6 % ▾)                    ⋯
 (Équipe)
 Équipe                                                                + Ajouter une personne
  Les personnes à qui les événements et les lignes sont assignés. …                       14 grey
  (KR) Kristoff      KR    ☑ Actif                                      ⋯(hover: Lien du jour, Monter, Descendre, Désactiver)
  (AM) Amélie        AM    ☑ Actif                                      ⋯
 (Finances)
 Charges fixes                                                         + Ajouter
  Nom          Type        Mensuel   Seule   Depuis    Jusqu'au   Résultat
  UCM          (Social ▾)  300 €     Vide    Vide      Vide       ☑         ⋯               one Table row per charge
  Total charges mensuelles   3 668,83 € avec salaire · 600,00 € hors résultat
  ▸ Coller une liste
 Objectifs par année   (year SelectPill)      property list; monthly grids stay 12 `.input-field input-compact`
 Années précédentes    (year SelectPill)      property list
 (Société)
 Société               property list (Nom, Numéro de TVA, Adresse, Date de constitution, Début du journal)
 Doublons ignorés      rows with ⋯ "Rétablir"
 À propos              version, tables as green/gray tags
```
Tabs: Général = Formats de recette, Catégories du menu; Catalogue = Types de prestation, Fournisseurs, Doublons ignorés; Équipe; Finances = Charges fixes, Objectifs par année, Années précédentes; Société = Société, À propos. Hashes `#general`, `#catalogue`, `#equipe`, `#finances`, `#societe`; the existing `#objectifs` lands on Finances and `#apropos` on Société.

375: tabs scroll; rows 44px with ⋯ visible; a charge row opens a Sheet with its six fields as a property list; "Enregistrer" is a sticky bottom bar when dirty.

Removed per supplier: 3 bordered inputs and an × (6 suppliers = 24 controls); per person: the bordered initials input, the "Lien du jour" button, the two arrows and the "Désactiver" button; per charge: the 5-input card; the bordered "+ Ajouter" buttons; the single 8 000px scroll; the serif title.

### 4.18 Login (`/login`)

375 (1366 is the same 320px column centred, inputs 36px, button 36px):
```
            [A]                     32px square, radius 6, #f1f1ef, 16/600
      La Table d'Amélie             24/600
      Connexion                     16 grey

 Email                              14 grey label
 [                      ]           44px input, bg rgba(242,241,238,.6), no border
 Mot de passe
 [                   👁 ]
 ☐ Rester connecté sur cet appareil 16px checkbox, 44px row
 [      Se connecter      ]         44px primary blue, full width
```
Error text `"mt-2 text-sm text-danger"`. Column `"mx-auto max-w-[320px] px-6 pt-[14vh]"`.

Removed: the bordered card with shadow, the gradient medallion, the serif title, the brown button, the beige page.

---

## 5. Files by area

Four developers, no shared file. Developer A merges first (tokens, sed pass, chrome), then the new primitives the same day; B, C and D branch from A's first commit and switch to the primitives as `components/ui/index.ts` exports them. Until then they use the class strings from section 3.

### A: tokens, chrome, `components/ui`, Login

- `src/index.css` (section 2.1; delete the fonts import)
- `tailwind.config.ts` (section 2.2)
- the sed pass of section 2.5 over `src/` (first commit, before anything else)
- `src/lib/page-icons.ts` (new)
- `src/hooks/use-touch-screen.ts` (new; the hook from `PersonPicker.tsx`)
- `src/components/admin/AdminLayout.tsx` (padding, reopen button, `useTopTitle`, 44px phone offset)
- `src/components/admin/AdminSidebar.tsx` (240px sidebar, emoji rows, rail deleted, left Sheet, 44px top bar with title)
- `src/components/Toaster.tsx` (panel `rounded-lg bg-background shadow-dialog text-sm`)
- new in `src/components/ui`: `Button.tsx`, `Toolbar.tsx`, `ViewTabs.tsx`, `DateNav.tsx`, `FilterMenu.tsx`, `PropertyList.tsx`, `Checkbox.tsx`, `SelectPill.tsx`, `Menu.tsx`, `Sheet.tsx`, `Dialog.tsx`, `Callout.tsx`, `EmptyState.tsx`, `Table.tsx`
- existing in `src/components/ui`: `PageHeader.tsx`, `Section.tsx`, `Tag.tsx`, `StatusTag.tsx`, `SupplierTag.tsx`, `ListRow.tsx`, `StatusControl.tsx`, `Stepper.tsx`, `SectionToggle.tsx`, `FieldLabel.tsx`, `MoneyTile.tsx`, `RecipeReader.tsx`, `editable.tsx`, `ActionMenu.tsx`, `SearchSelect.tsx`, `Pagination.tsx`, `NumericInput.tsx`, `IngredientFormModal.tsx`, `index.ts`
- `src/pages/LoginPage.tsx`

Order for A: (1) tokens + sed + AdminLayout + AdminSidebar, build, commit. (2) `Button`, `Menu`, `Sheet`, `Dialog`, `Checkbox`, `Tag`, `SelectPill`, `PropertyList`, `Toolbar`, `ViewTabs`, `DateNav`, `FilterMenu`, `Callout`, `EmptyState`, `Table`, `index.ts`, commit. (3) the restyle of the existing primitives and the Login.

### B: `components/admin` and the planning pages

- `src/pages/admin/Week.tsx`
- `src/pages/admin/Day.tsx`
- `src/pages/admin/PrepSheet.tsx`
- `src/pages/admin/RecipeCook.tsx`
- `src/components/admin/PlanningBar.tsx`
- `src/components/admin/DayStrip.tsx`
- `src/components/admin/WeekPicker.tsx` (delete once `DateNav` is in)
- `src/components/admin/WeekChecklist.tsx`
- `src/components/admin/AssignSheet.tsx`
- `src/components/admin/PersonChips.tsx`
- `src/components/admin/PersonPicker.tsx` (import the hook from `src/hooks`)
- `src/components/admin/StatusDot.tsx` (delete `StatusDots`)

### C: records and lists

- `src/pages/admin/EventDetail.tsx`
- `src/pages/admin/EventEditor.tsx` (keep the form; `FieldLabel` + `.input-field`, `Button` footer, `max-w-doc`)
- `src/pages/admin/Events.tsx`
- `src/pages/admin/Clients.tsx`
- `src/pages/admin/ClientDetail.tsx`
- `src/pages/admin/RecipeDetail.tsx`
- `src/pages/admin/RecipeEditor.tsx` (same treatment as EventEditor)
- `src/pages/admin/Recipes.tsx`
- `src/pages/admin/Ingredients.tsx`
- `src/pages/admin/IngredientDuplicates.tsx`
- `src/pages/admin/GroceryListPage.tsx`

### D: comptes, settings, dashboard

- `src/pages/admin/comptes/ComptesLayout.tsx` (ViewTabs)
- `src/pages/admin/comptes/Journal.tsx`
- `src/pages/admin/comptes/AFacturer.tsx`
- `src/pages/admin/comptes/Apercu.tsx` (chart colours of section 4.16)
- `src/pages/admin/comptes/Resultats.tsx`
- `src/pages/admin/comptes/Previsionnel.tsx`
- `src/pages/admin/comptes/AuReel.tsx`
- `src/components/comptes/LedgerEntryForm.tsx` (Dialog)
- `src/pages/admin/Settings.tsx` (tabs by hash, inline rows, Table for charges)
- `src/pages/admin/Dashboard.tsx` (stat row + EmptyState)

### Merge order and gates

1. A: tokens + sed + chrome. Gate: `pnpm --filter @apps/frontend build` passes; `grep -rn "font-serif\|backdrop-blur-sm\|bg-foreground/\|border-border/60" src` returns nothing.
2. A: primitives. Gate: build passes; `index.ts` exports every name in section 3.1.
3. B, C, D in any order. Gate per PR: build, `pnpm --filter @apps/frontend lint:type-scale`, and `grep -n "<select" <their files>` only inside Dialogs or editor pages; screenshots at 1366 and 375 for their screens, compared with section 6.
4. A, last: delete `WeekPicker.tsx` if B left it, delete the `variant` alias of `Tag`, the `card-elevated` alias stays.

Not covered: dark mode (`darkMode: ["class"]` stays, no dark tokens), the print stylesheet beyond the existing rules, `packages/ui` (unused by `src/`, removed from the Tailwind scan).

---

## 6. Acceptance checks per screenshot

Regenerate the 16 screenshots at the same routes and viewports. Each check is pass or fail.

**`s-week43-1366.png` (Semaine, 1366)**
- Page background `#ffffff`; sidebar `#f7f7f5`, 240px, no right border, emoji rows, no rail.
- Title "📅 Semaine 43" at 40px/700 sans, no arrows beside it; stat line at 16px `#787774` under it.
- One toolbar row, 40px, hairline below: tabs Semaine | Jour | Par personne with a 2px `#37352f` underline; `‹ Semaine 43 · 19 au 25 oct. ▾ ›`; "Aujourd'hui" grey; "Filtrer"; ⋯; one blue "+ Nouveau".
- No `<select>` on the page. No dark segment. No "Courses de la semaine" button (it is in ⋯).
- Checklist is a `#f1f1ef` callout with ✅, a gray "3" tag, circle bullets and blue link actions; no "Réduire".
- Column headers 14/600; "+" invisible until hover; today's date (if in the week) is a red circle, the column is not tinted.
- Event cards have `shadow-card`, radius 6, no border; lines are 28px rows with a 16px status dot.

**`s-week43-375.png` (Semaine, 375)**
- Top bar 44px white with ☰ and "Semaine 43" centred; no gradient logo.
- Title 30/700; tabs row 44px; DateNav row 44px; day strip 44px with today red.
- Callout 44px rows; day headers 14/600; cards 44px; line rows 44px with the dot.
- Every tap target measures at least 44×44 in the inspector; no horizontal scroll.

**`s-day-1366.png` (Jour, 1366)**
- Breadcrumb "Semaine 42 / Sam 17 oct" at 14px; no tinted "‹ Semaine 42" button.
- Title "📅 Samedi 17 octobre" 40/700 sans.
- Toolbar: tabs, DateNav "Sam. 17 oct.", "Grouper : Événement ▾" pill, "Filtrer", ⋯. No four-segment group, no select.
- Day strip: selected cell blue tint with blue text; no brown underline; no beige cell.
- Each line: one 20px pastel status pill (gray / blue / green) with a dot, not three segments; no chevron; row hover `rgba(55,53,47,0.08)`.

**`n-day-375.png` (Jour, 375)**
- Top bar "‹ Semaine 42" + title; tabs row; DateNav + Grouper row; strip.
- Rows 44px with a 16px status dot (hollow, blue, green) in a 44px hit area; no pill on touch; no chevron.

**`f-prep-1366.png` (Fiche, 1366)**
- Breadcrumb at 14px; pager `‹ 2/2 ›` as 28px ghost arrows; ⋯ ghost; one blue "Cuisiner" 36px. No right-hand card, no "Aa", no tinted back button.
- Title 40/700 sans with 🔪; property list with Portions, Catégorie (tag), Événement (link), Personne (avatar), Statut (pill); names `#787774` 14px, 160px column.
- Ingredients: 16px circle checkboxes, no dividers, 18px text, 32px rows. Steps: grey numbers, no circles.

**`f-prep-375.png` (Fiche, 375)**
- Sticky bottom bar: status pill on the left (44px wrapper), blue "Cuisiner" 44px on the right; no three-segment control.
- Property list without the Statut row; 44px ingredient rows.

**`v2-cook-375.png` (Cuisiner, 375)**
- Header 44px: × ghost, title 16/600, "Étape 2 / 6" 14 grey.
- Current step 28px sans `#37352f`; previous step 16px `#787774`; scaled numbers on `#fbf3db`.
- "☰ Ingrédients (5) · 60 portions" row 44px on `#f7f7f5`; footer "Précédent" default + "Suivant" blue, 44px, radius 6. On step 6 the button reads "Terminer".

**`v2-event-1366.png` (Événement, 1366)**
- Header: breadcrumb, "Terminer l'événement" as a default (white, hairline) 32px button, ⋯ ghost. No brown.
- Title "🎉 Mariage Dupont" 40/700; property list of 10 rows (Date, Convives, Prestation pill, Client link, Prix, Contact, Statut pills, Équipe avatars + "+", Heures passées); hover on a value shows the grey background only on that value.
- Stat row on `#f7f7f5` with four columns, no borders, values 20/600.
- Menu: category labels 16/600; rows 36px with handle and ⋯ hidden until hover; no `<select>` in rows; no up/down arrows. "+ Ajouter une recette" ghost row at the end.
- Extra costs: kind as a pastel pill; × on hover. Facturation: default + blue 32px buttons. Notes: plain paragraph, hover background.

**`n-event-375.png` (Événement, 375)**
- Top bar "‹ Sam 17" + "Mariage Dupont"; property names 112px; rows 44px; "Terminer l'événement" full-width default 44px; stat grid 2×2 on `#f7f7f5`; menu rows 44px with ⋯ visible and no handle.

**`recipe-375.png` (Recette, 375)**
- Property rows Format (pill), Portions, Poids/pers; no grey chips; no floating "Aa".
- Stepper: ghost 44px − + buttons, grey-fill input, ×2 ÷2 as text; no borders.
- Ingredient rows 44px, no dividers; step numbers grey without circles; toggles 16/600.
- Sticky bar: blue "Cuisiner" 44px + default "Modifier" 44px.

**`events-1366.png` (Événements, 1366)**
- Title "🎉 Événements" 40/700; blue "+ Nouvel événement" 36px as the only filled button.
- Toolbar: tabs À venir | Terminés | Tous underlined; right group 🔍, Filtrer, Trier, ⋯. No dark pill, no `<select>`, no full-width search box.
- Table: grey 500 header 36px on a `divider` line; rows 36px 14px with hairlines; prestation and status as pastel tags; amounts tabular right-aligned; hover background on rows.

**`client-1366.png` (Client, 1366)**
- Title "🏢 Hoona" 40/700 editable; 13 property rows; selects rendered as pastel pills with a chevron on hover; empty values read "Vide" or "Ajouter un téléphone" in placeholder grey; zero bordered inputs on the page.
- Semaine type: one 36px row per day with recipe tags and a ⋯ on hover; Samedi and Dimanche show a "+ Ajouter un jour" ghost row; no "Modifier" / "Créer depuis un événement" buttons visible.
- Historique rows 36px with "Signé 420,00 €" as a gray tag; Journal section shows an EmptyState.

**`journal-1366.png` (Journal, 1366)**
- Comptabilité tabs with a `#37352f` underline (no brown); second toolbar: Ventes | Achats tabs, `‹ septembre 2026 ▾ ›`, "Filtrer : Tous ▾" pill, ⋯, blue "+ Nouvelle ligne" 28px.
- No year/month selects, no 7 chips, no "Exporter / CSV / Verrouiller" buttons, no "Septembre 2026" heading, no side tiles.
- One grey stat line; table 36px rows with a Réglé tag column; totals on a `divider` line; "▸ Détail du CA par type" collapsed.

**`v2-afacturer-1366.png` (À facturer, 1366)**
- Stat row on `#f7f7f5` (two flat tiles), no bordered tiles.
- Headings 20/600 with gray count tags; the unpaid row ends with a red "Non réglée ▾" pill, not a bordered "Réglé" button.

**`v2-settings-1366.png` (Paramètres, 1366)**
- Tabs Général | Catalogue | Équipe | Finances | Société under the title; the URL hash changes on click.
- Fournisseurs rows: supplier dot, name, "Adresse…" and "Téléphone…" as placeholder text in grey, no input borders; ⋯ appears on hover; no ×.
- Équipe rows: 20px avatar, name, initials as inline text, 16px "Actif" checkbox (blue when on), ⋯ on hover; no "Lien du jour" button, no arrows, no "Désactiver" button.
- "+ Ajouter" actions are ghost 28px in the section headers; "Enregistrer" is a blue 32px button at the top right only when something changed.

**`v2-login-375.png` (Login, 375)**
- White page, no card, no shadow; 32px square `#f1f1ef` mark with "A"; "La Table d'Amélie" 24/600 sans; "Connexion" 16 grey.
- Inputs 44px with grey fill `rgba(242,241,238,0.6)` and no border; 16px checkbox with a 44px label row; blue "Se connecter" 44px full width.

Global checks on every screenshot: no serif glyph anywhere; no colour outside the token set (search the DOM for `hsl(`); no element with `border` on a control; no text under 12px; on 375 nothing scrolls horizontally and no interactive element is under 44px.
