# Planning iteration: le cockpit du dimanche

Build spec for the second iteration of the planning screens. Base: the "cockpit" design (seven columns on the laptop, the week opens on what is left to do), with the grafts both judges agreed on and the contradictions resolved below. All paths are relative to the repo root unless they start with `/`.

Verified in `/tmp/shots` and in source before writing:

- `week-1366.png`: the plan starts at y=400 (three 150px tiles plus a chip row above seven columns); every Hoona card repeats the column date ("Hoona · mardi 13 oct." under "Mar 13"); lines are hidden ("Événements" is the stored default under 800px tall); the sidebar is an icon rail without labels; "1 lignes · 0 faites".
- `week-lines-1366.png`: 169px columns truncate "Lunch bowl pois chiches…" and "Verrines saumon fumé…"; the `StatusDots` hover reveal overlaps the portions cell; "+ 1 ligne" hides the sixth line.
- `week-375.png`: title, range, two full-width buttons, four chips and horizontally scrolling tiles stack before "Lun 12" at y=560; the day row wraps to three lines.
- `day-375.png`: arrows, "Courses du jour", "Imprimer", the mode select and the checkbox take five rows before the first line. `day-1366.png`: "À / préparer" wraps inside the 288px `StatusControl`; "Hoona · mardi 13 oct." is followed by "Hoona · 30 convives".
- `prep-375.png`: grey square without a photo, crumb "Mar 13 oct / …" truncated, "5400 g", a stepper and ×2 ÷2 on a sheet that should be read, not edited.
- `cook-375.png`: subtitle "pour Famille Dupont · 60 porti…" cuts the number; the step says "125 g de beurre" and "un oeuf" for 60 portions of a 10-portion recipe.
- `event-375.png`: each menu line wraps to two rows; the italic "Téléphone" placeholder reads like a value.
- `AdminSidebar.tsx:71` `collapsed = collapsedPref ?? (onWeek && narrow)` collapses the sidebar on the week only; `menuItems[0].path = "/semaine"` which `App.tsx` does not route, so "Semaine" falls to `*` then `/` then the current week.
- `use-planning-data.ts:51` turns the clients 503 into `[]` with no flag, so the week cannot tell "no clients" from "no table". `Clients.tsx:122` holds the message the owner quoted.
- `AuthContext.tsx:16` and `api.ts:41` read the admin token from `sessionStorage`, so a bookmark on another phone opens on `/login` whenever the tab is gone.
- `clients.service.ts:159` names events `${client.name} · ${label}`. `costing.ts:25` `scaleQty` prints raw grams, used at `RecipeReader.tsx:51`, `RecipeCook.tsx:180`, `Day.tsx:393`. `RecipeCook.tsx:90` exits to the day, not the prep sheet. `health.controller.ts` already returns `tables.clients` and `tables.ledger`.
- No people or assignment field exists in `packages/types/src/entities`.

## 1. Summary

The week becomes a cockpit: one header row with the money inline, a checklist "À faire avant la semaine" that lists what is missing before Monday, then the plan. Lines are visible by default. People exist as names in settings and are assigned per event with per-line overrides; the day view groups by person and each person opens their own list on their phone. Quantities are shown in kg and l, quantities inside step text are scaled, and the prep sheet has mise en place ticks. Money leaves the week except for two figures; closing, invoicing and unpaid invoices live on the event page and on a new Comptabilité tab "À facturer". The sidebar stops hiding its labels and "Semaine" returns to the week being planned.

Decisions where the three designs disagreed:

| Topic | Decision | Why |
|---|---|---|
| Week layout on the laptop | Seven columns (cockpit) with a labelled 84px rail, lines always shown, no clamp below two lines | The week is the planning unit; the rail gives 171px columns at 1366 |
| Week layout on the phone | Sticky seven-cell `DayStrip` plus all seven days stacked, no accordion | Sunday on the phone must not cost one tap per day |
| Assignment field | `assignedTo?: string[]` on the event (default) and on the line (override); `ClientTemplate.assignedTo` copied by instantiate | One PATCH assigns a whole event; recurring weeks arrive assigned |
| Person id | Slug of the name at creation (`kristoff`), stable | URLs and bookmarks read as names |
| URL param | `?personne=` everywhere | French, like `?filtre=` |
| Staff phone | Same login with "Rester connecté sur cet appareil" (token in `localStorage`) and the bookmark `/jour/aujourdhui?personne=kristoff` | The team link without login (cockpit tier B) is deferred; its contract is in 4.8 |
| Week picker | The range label wraps a hidden `<input type="date">` | One control, no custom calendar |
| Checklist scope | Planning items describe the displayed week; money items (à terminer, à facturer, impayés) describe the backlog whatever the week | Last Saturday's wedding must show on next week's Sunday |
| Mise en place ticks | `localStorage["recipe-book:mep:<lineId>"]`, cleared when the line reaches Fait; first tick writes `prepStatus: "doing"` | Safari drops tabs during service |
| Scaled step numbers | Prep sheet shows the base value in muted text after the scaled one; cook mode shows the scaled value only | A `title` tooltip does not exist on touch |
| Status label | `À faire · En cours · Fait` | "À préparer" wraps at 375 and in the 288px control |
| Finance tab | `/comptes/a-facturer`, second tab after Journal | It is the weekly tab |
| Quantity file | `packages/types/src/lib/quantity.ts` with `fmtQty`, `fmtQtyText`, `scaleStepText` | Own file, own tests, no conflict with `costing.ts` |
| Checklist file | `packages/types/src/lib/checklist.ts` | Same reason |

## 2. Semaine

Route `/semaine/:isoWeek?client=<clientId>&personne=<personId>`. File `apps/frontend/src/pages/admin/Week.tsx`, rewritten. Four regions in this order: header row with the money inline, controls row, checklist, plan. Then the print block. The three `MoneyTile`s, the client chip row, the per-client banners, the ledger message, `expandedDays`, `expandedEvents`, `MAX_VISIBLE_LINES` and `EventColumn` are deleted from this file.

### 2.1 Laptop, 1366×768, labelled rail (84px)

```
┌──────┬───────────────────────────────────────────────────────────────────────────────────────────┐
│  A   │ ‹  Semaine 43  ›   19 au 25 octobre ▾   Aujourd'hui              Signé 4 884 € · 224 conv. │ 56
│ ▦    │                                                                   Mois 11 758 € / 16 000 € ›│
│Semaine                                       [Tous les clients ▾] [Toutes les personnes ▾]       │
│ ▤    │                                       [Lignes | Événements] [Courses de la semaine] [⋯]   │ 44
│Évén. │ ┌───────────────────────────────────────────────────────────────────────────────────────┐ │
│ ▥    │ │ À faire avant la semaine · 7                                               Réduire ▴ │ │ 36
│Recettes │ ○ Hoona : 5 jours sans événement        Créer la semaine │ ○ 15 lignes sans personne   Assigner │ 40
│ ▧    │ │ ○ Philippson : 2 jours sans événement   Créer la semaine │ ○ Courses non créées (7)  Créer │ 40
│Ingréd. │ ○ Fondation Thalia : type manquant       [Choisir ▾]     │ ○ 2 événements passés à terminer  Terminer │ 40
│ ▨    │ │ ○ Brunch Pirson : aucune recette au menu Ajouter         │ ○ 2 factures impayées · 1 242 €  Voir │ 40
│Courses └───────────────────────────────────────────────────────────────────────────────────────┘ │
│ ▩    │ Lun 19       Mar 20       Mer 21       Jeu 22       Ven 23       Sam 24       Dim 25       │ sticky
│Clients 1 évén·30 c. 2 évén·42 c. 1 évén·30 c. 2 évén·42 c. 2 évén·80 c. aucun        aucun       │ header
│ ▪    │ (AM)         (AM)(KR)     (AM)         (AM)         (AM)(KR)                          +   │ 72
│Compta│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                          │
│ ▫    │ │Hoona     │ │Philippson│ │Hoona     │ │Hoona     │ │Walking   │                          │ card
│Param.│ │30 conv.  │ │12 conv.  │ │30 conv.  │ │30 conv.  │ │dinner    │                          │ 64
│      │ │1 ligne   │ │1 ligne   │ │2 lignes  │ │1 ligne   │ │Thalia    │                          │
│      │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │50 conv.  │                          │
│      │ ○ Lunch bowl ○ Risotto   ○ Poulet    ○ Poulet    │6 lignes  │                          │ line
│      │   pois ch. 30  courg. 12   basq.  30   basq.  30 └──────────┘                          │ 36
│      │          (AM)       (KR)  ○ Mousse        (AM)  ○ Mini quiches 50 (AM)                  │
│      │              ┌──────────┐   choc.   30                ○ Houmous      50 (KR)                  │
```

Regions and sizes:

1. **Header row**, 56px, `flex items-center gap-4`. Left: `‹` (44px link to `weekUrl(prevWeek)`), `Semaine 43` (`font-serif text-h1`), `›` (44px), the range as a button `19 au 25 octobre ▾` (`text-base`, `min-h-11`, opens the week picker, 2.5), `Aujourd'hui` (`text-primary`, rendered only when `safeWeek !== todayWeek`). Right, `ml-auto text-right text-sm`: line 1 `Signé 4 884 € · 224 conv.` (`font-semibold tabular-nums`), line 2 `Mois 11 758 € / 16 000 € ›` as a `Link` to `/comptes/apercu?year=2026` in `text-muted-foreground`; without an objective, `Mois 11 758 € · Définir l'objectif ›` to `/settings#objectifs`. A third fragment `12 / 40 lignes faites` is appended to line 1 only when `monday <= today`. The strip always describes the whole week whatever the filters (`weekPlan(weekEvents)`), as today.
2. **Controls row**, 44px, right-aligned, `flex flex-wrap gap-2`: `<select aria-label="Client">` "Tous les clients" plus the clients with events this week (writes `?client=`); `<select aria-label="Personne">` "Toutes les personnes" plus active people (writes `?personne=`; hidden when `people` has no active person); the existing `Lignes | Événements` toggle (`useLocalStorage("recipe-book:week-view")`, default `lines`, the `innerHeight` rule is removed); `Courses de la semaine` (`TEXT_BTN`); an `ActionMenu` `⋯` with `Imprimer`, `Imprimer par personne`, `Partager…` (one item per active person, 4.6). Both selects are hidden when `clientsConfigured` is false and there are no people.
3. **Checklist**, `card-elevated p-3`, `components/admin/WeekChecklist.tsx`. Header 36px: `text-h3` "À faire avant la semaine · 7" and a `Réduire ▴` text button. Items in `grid xl:grid-cols-2 gap-x-6`, each `min-h-10 flex items-center gap-2 text-base`: a decorative `Dot status="todo"`, the sentence, the action at the right as a text button `text-primary font-medium min-h-10 px-2` (`touch:min-h-11`). Open state in `useLocalStorage("recipe-book:checklist-open", window.innerWidth >= 1280)`. Collapsed: one 44px row "À faire avant la semaine · 7 ›". Empty: one 44px row in `bg-success-soft` "Semaine prête, rien à faire avant lundi". Items and rules in section 3. The block is `aria-live="polite"`.
4. **Plan**: `grid-cols-[repeat(7,minmax(0,1fr))] gap-2`, each column `max-h-[calc(100dvh-300px)] overflow-y-auto`. Column header sticky, 72px: `Mar 20` (`text-h3`, a `Link` to `/jour/:date` carrying `?personne=`), `2 évén. · 42 conv.` (`text-sm text-muted-foreground`; "aucun" for an empty day; the per-day euro figure is dropped), then a people row of 20px `PersonChips` of everyone assigned that day (`weekPlan.peopleByDay`, distinct, four then `+2`; tap a chip sets `?personne=`), and `+` (44px, `/events/new?date=<date>&client=<client>&retour=/semaine/<week>`) at the top right. Today's header keeps `bg-primary-soft`. A `0/2` done fragment is appended once the week has started.
5. **Event card**, `card-elevated min-h-16 p-2.5`, a `Link` to `/events/:id` with `state: { from }`: title `shortEventName(ev, client)` (`text-base font-medium line-clamp-2`), `30 conv. · 1 ligne` (`plural`), the event's `PersonChips` (20px) at the right of the title, a 4px progress bar only when the week has started. No prestation `Tag` (it is in `title`). In Événements mode the card also shows `1 faite`.
6. **Line row**, `min-h-9 text-sm touch:min-h-11`, grid `[36px_1fr_auto_auto]`: `StatusDot` (cycles), recipe name `line-clamp-2` (never `truncate`), portions `font-semibold tabular-nums`, then `PersonChips` of `assigneesOf(line, ev)` (inherited chips at `opacity-60`, nothing when nobody). On pointer hover the `StatusDots` reveal renders `relative` after the chips, not absolutely positioned, so it never overlaps the portions. No `+ n lignes` collapse: the column scrolls. Done lines are `text-muted-foreground`, no strikethrough. Tap on the name → prep sheet with `state: { from }`.
7. **Person filter** (`?personne=`): lines of other people render at `opacity-40`; events without a line for that person collapse to a 36px name-only row. The week stays whole.

Widths: with the rail, `(1366 − 84 − 32 − 48) / 7 = 171px`; at 1280, `159px`. With the sidebar expanded by choice, `149px`. `line-clamp-2` on names handles the rest. Height at 768: 56 + 44 + 12 + 156 (seven items) + 16 = 284px before the day headers.

### 2.2 Phone, 375 wide

```
┌───────────────────────────────┐
│ A  La Table d'Amélie       ≡  │ 68 top bar (existing)
├───────────────────────────────┤
│ ‹    Semaine 43    ›       ⋯  │ 48
│ 19 au 25 octobre ▾  Aujourd'hui│ 32
│ Signé 4 884 € · 224 conv. · Mois 11 758 / 16 000 € ›│ 28, one text-sm line, scrolls horizontally
│ ┌───────────────────────────┐ │
│ │ À faire avant la semaine·7 ▾│ │ 44, collapsed by default
│ └───────────────────────────┘ │
│  L   M   M   J   V   S   D    │
│ 19  20  21  22  23  24  25    │ 56 DayStrip, sticky under the top bar
│  1   2   1   2   2   ·   ·    │
├───────────────────────────────┤
│ Lun 19 · 1 évén. · 30 conv. › │ 48 sticky day bar, link to /jour/:date
│ Hoona · 30 conv.        (AM) ›│ 48 event row
│ ○ Lunch bowl pois chiches  30 │ 48 line row
│ + Nouvel événement            │ 44
├───────────────────────────────┤
│ Mar 20 · 2 évén. · 42 conv. › │ today: bg-primary-soft
│ Philippson · 12 conv.   (KR) ›│
│ ○ Risotto aux courgettes   12 │
│ Hoona · 30 conv.        (AM) ›│
│ ○ Poulet basquaise         30 │
│ + Nouvel événement            │
├───────────────────────────────┤
│ Sam 24 · aucun événement    › │ 48, muted, + inside the bar
```

- Nav row: `‹` 44px, `Semaine 43` `font-serif text-h2` centred, `›` 44px, `⋯` 44px. The `⋯` sheet holds `Courses de la semaine`, `Imprimer`, `Imprimer par personne`, `Partager…`, the client select and the person select as rows. Nothing else stacks.
- Range row: the range button (opens the native date picker) and `Aujourd'hui`.
- Money: one `text-sm` line, `overflow-x-auto whitespace-nowrap`. No tiles.
- Checklist: same component, collapsed by default below 1280 (the `useLocalStorage` default), one item per 44px row when open.
- `DayStrip` (`components/admin/DayStrip.tsx`): `grid-cols-7`, each cell a 44px button: weekday letter `text-caption`, day number `text-base font-semibold`, event count `text-caption` muted (blank when 0). Today `bg-primary-soft`. Tap scrolls the day block into view (`scrollIntoView({ block: "start" })`, offset by the sticky bars). The strip is `sticky top-[68px] z-20 bg-background`.
- Every day is rendered, none collapsed. Day bar 48px, sticky under the strip: `Mar 20` (`text-base font-medium`, fixed 64px), `2 évén. · 42 conv.` (`text-sm text-muted-foreground truncate`), chevron; the whole bar links to `/jour/:date`. Empty days: "aucun événement" muted and a `+` icon in the bar instead of the 44px row.
- Event row 48px: `shortEventName`, `30 conv.`, `PersonChips`, chevron, link to `/events/:id`. Line row 48px: `StatusDot` (44px target), name, portions, chips. The `Assigner` action is not on the phone week; it is on the day and event pages.
- Today is scrolled into view on mount when it falls in the week; on a Sunday (2.5) the first day with events.
- Swipe left or right on the nav and range rows changes the week (60px rule from `Day.tsx`); swipe on the days scrolls.
- Height before the first day bar: 68 + 48 + 32 + 28 + 44 + 56 = 276px, against 560 today.

Breakpoint: the column layout applies from `xl` (1280px); below that the phone layout, including iPads in both orientations (unchanged rule of REDESIGN.md 4).

### 2.3 Every interaction on the week

| Control | Pointer | Touch | Writes or goes to |
|---|---|---|---|
| `‹` `›` | click | tap | `/semaine/<prev|next>` with `?client` and `?personne` kept |
| ← → keys | yes | no | same |
| Range button | opens the date picker | native wheel | `/semaine/<isoWeekOf(value)>` with the query kept |
| `Aujourd'hui` | click | tap | `/semaine/<todayWeek>`; on the phone also scrolls today into view |
| Client select, person select | change | change | `?client=`, `?personne=` (`setSearchParams` with `replace: true`) |
| `Lignes | Événements` | click | tap | `localStorage` |
| `Courses de la semaine` | click | in `⋯` | `createGrocery()` over `filteredEvents`, then `/grocery-list?id=` |
| `⋯ Imprimer` | click | tap | `printMode = "week"`, `window.print()` |
| `⋯ Imprimer par personne` | click | tap | `printMode = "person"`, `window.print()` |
| `⋯ Partager… › Kristoff` | click | tap | `navigator.share({ title, url })` with `url = origin + /jour/<monday or today when in week>?personne=<id>`; clipboard fallback and toast "Lien copié" |
| Checklist action | click | tap | section 3 |
| Day header, day bar | click | tap | `/jour/:date?personne=` |
| Day people chip | click | not shown | `?personne=<id>`; the active chip clears it |
| `+` on a day | click | tap | `/events/new?date=&client=&retour=/semaine/<week>` |
| Event card, event row | click | tap | `/events/:id`, `state: { from: pathname + search }` |
| `StatusDot` | click | tap | `patchLine(eventId, lineId, { prepStatus: NEXT_STATUS[s] })` |
| `StatusDots` (hover) | click | not shown | `patchLine({ prepStatus })` |
| Line name | click | tap | `/events/:eventId/lines/:lineId?personne=`, `state: { from }` |
| Line chips | click | not on the phone | `PersonPicker` for the line, `patchLine({ assignedTo })` |
| Card chips | click | not on the phone | `PersonPicker` for the event, `patchEvent({ assignedTo })` |
| Swipe on the header zone | no | yes | prev or next week |

### 2.4 Navigation and return paths

Rule: every `Link` out of Week, Day and PrepSheet passes `state={{ from: location.pathname + location.search }}`. Every back control uses `state.from` when present, else the computed parent in the table. No `navigate(-1)` anywhere (`RecipeCook.tsx:118` loses its `navigate(-1)`).

| From | Back control | Target |
|---|---|---|
| Day | the Semaine tab, Escape, or a click on the tinted head in the row of days (`title="Fermer le jour"`); no breadcrumb since 06 | `state.from ?? /semaine/<isoWeekOf(date)>?personne=` |
| Day on the phone | top bar shows `‹ Semaine` instead of the logo (`useBackLink`, 2.6) | same |
| Prep sheet | `‹ Mar 13` (44px) in its own bar | `state.from ?? /jour/<date>?personne=` |
| Prep sheet `‹ ›` | prev and next line of the day, inside the person's lines when `?personne=` is set | `/events/:e/lines/:l?personne=` |
| Cook mode | `Quitter` | `state.from ?? (line ? /events/:eventId/lines/:lineId?personne= : event ? /jour/:date : /recipes/:id)` |
| Cook mode | `Marquer fait` | `/jour/:date?done=<lineId>&personne=` (existing toast; "Suivante" scoped to the person, 5.3) |
| Event page | breadcrumb `Semaine 42 / Mar 13 oct / Hoona` | first crumb `state.from ?? /semaine/<isoWeekOf(event.date)>`, second `/jour/<date>`; "Événements" leaves the breadcrumb (one sidebar tap) |
| Event page on the phone | top bar `‹ Mar 13` | `/jour/<date>` |
| Event editor (`/events/new?retour=`) | `Enregistrer`, `Annuler` | `retour` when it starts with `/`, else `/events/:id` as today |
| Grocery page reached from the week | crumb `Semaine 43` built from `list.range` | `/semaine/<isoWeekOf(range.from)>` |
| Sidebar `Semaine` | | `/semaine` (2.6) |

### 2.5 URL state

| Route | Query | Notes |
|---|---|---|
| `/` | | `HomeRedirect`: `weekdayOf(today) === 7 ? isoWeekOf(addDays(today, 1)) : isoWeekOf(today)`. Sunday is the planning day; `Aujourd'hui` brings the current week back |
| `/semaine` (new) | kept | `WeekIndexRedirect`: `sessionStorage["recipe-book:last-week"]` when set, else the Sunday rule above |
| `/semaine/:isoWeek` | `client`, `personne` | `Week.tsx` writes `sessionStorage["recipe-book:last-week"] = pathname + search` on every render of a valid week |
| `/jour/:date` | `personne`, `mode=evenement|categorie|recette|personne`, `masquer=faites`, `done=<lineId>` | `mode` and `masquer` replace the two `useState`s so the browser back button and a shared URL restore them |
| `/jour/aujourdhui` (new) | kept | redirects to `/jour/<todayIso()>` with the same query; the bookmark a person keeps |
| `/events/:eventId/lines/:lineId` | `personne` | carried by prev, next and back |
| `/recipes/:id/cook` | `portions`, `event`, `line`, `personne` | same carry |
| `/events/:id` | `facturer=1|acompte`, `focus=prix`, `ajouter=1` | section 7.1 and 3 |
| `/events/new` | `date`, `client`, `retour` | |
| `/comptes/a-facturer` | | section 7.2 |

Week picker: the range label is a `<button>` wrapping a visually hidden `<input type="date" value={thursday}>`. Click calls `input.showPicker()` when available, otherwise focuses the input. `onChange` navigates to `/semaine/${isoWeekOf(value)}` with the query kept. Keys `←` `→` stay; `t` is not bound. No `<input type="week">` (no Safari support).

### 2.6 What the sidebar does

`apps/frontend/src/components/admin/AdminSidebar.tsx`:

- Delete `COLLAPSE_BELOW`, `useMediaQuery`, `onWeek`, `narrow`. `collapsed = collapsedPref ?? !wide` where `wide = window.innerWidth >= 1400` read once on mount. The chevron persists the choice as today. The same rule on every page, so the sidebar never changes shape between week and day.
- The collapsed state becomes a labelled rail: `w-[84px]`, each item `flex-col items-center gap-1 py-2`, icon 20px, label `text-caption` (13px, `.rail-label` in `index.css`: centered, `leading-tight`). Active item on `bg-sidebar-accent`. "Comptabilité" at 13px is 78px wide, which is why the rail is 84px and not 64. The label is always visible, so the rail never hides where you are.
- `Semaine` keeps `path: "/semaine"`, which now exists as the index redirect above. `isActive` stays: `/semaine/*`, `/jour/*`, prep sheets.
- Mobile top bar: reads `backTo?: { to: string; label: string }` from the outlet context. When set, the left side renders `‹ <label>` (44px link) instead of the logo and name. `AdminLayout.tsx` exposes `setBackTo` and a hook `useBackLink(backTo)` next to `useFullBleed`, cleared on unmount. Day sets `{ to: weekUrl, label: "Semaine" }` (the page title under it already reads `Semaine 43`); EventDetail sets `{ to: /jour/<date>, label: "Mar 13" }`.

## 3. Sunday flow and the week checklist

### 3.1 The flow

Sunday 18 October, laptop. `/` opens `/semaine/2026-W43` (Sunday rule). The checklist is open.

| Step | Action | Taps |
|---|---|---|
| 1 | App opens on next week, checklist visible | 0 |
| 2 | `Hoona : 5 jours sans événement · Créer la semaine` → sheet "Convives : [30]" prefilled → `Créer la semaine` | 2 |
| 3 | `Philippson : 2 jours sans événement · Créer la semaine` → `Créer la semaine` | 2 |
| 4 | One-off: `+` on Ven 23 → `/events/new?date=2026-10-23&retour=/semaine/2026-W43` → fill → `Enregistrer` lands back on the week | 1 + form |
| 5 | `Fondation Thalia : type de prestation manquant · Choisir ▾` → in-row select → pick | 2 |
| 6 | `Brunch Pirson : aucune recette au menu · Ajouter` → `/events/:id?ajouter=1` with the recipe `SearchSelect` focused → pick → portions prefilled from convives → `Ajouter` → crumb `Semaine 43` | 1 + 2 per recipe + 1 |
| 7 | `Lunch étude Delen : prix non fixé · Fixer` → `/events/:id?focus=prix`, the price field in edit mode → type → Enter → crumb back | 1 + typing + 1 |
| 8 | `15 lignes sans personne · Assigner` → `AssignSheet`, one chip tap per event → `Fermer` | 1 + 7 + 1 |
| 9 | `Courses non créées (7) · Créer` → list created, `/grocery-list?id=` → sidebar `Semaine` returns to W43 | 2 |
| 10 | `⋯ › Partager… › Kristoff` → share sheet; or Kristoff's phone already has the bookmark | 3 or 0 |
| 11 | `2 événements passés à terminer · Terminer` (both, one tap each) | 2 |
| 12 | `Mariage Dupont · 3 300 € · Facturer` → `/events/:id?facturer=1` → prefilled form → type the number → `Enregistrer` → crumb back | 2 + typing |
| 13 | `Hoona : septembre à facturer · 8 événements · 3 360 € · Facturer le mois` → journal prefilled → `Enregistrer` | 2 |

About 30 taps plus typing for two recurring clients, one one-off, two invoices. An empty list shows "Semaine prête" and she reads the plan.

### 3.2 The checklist

Pure `weekChecklist(inputs)` in `packages/types/src/lib/checklist.ts` with `checklist.test.ts`. Rendered by `components/admin/WeekChecklist.tsx`, which owns the actions.

```ts
export interface ChecklistInputs {
  weekDates: string[];          // the seven days
  today: string;
  events: AppEvent[];           // all events, every year loaded
  clients: Client[];
  clientsConfigured: boolean;
  groceryLists: Pick<GroceryList, "listId" | "eventIds" | "range">[];
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  people: Person[];
}

export type ChecklistItem =
  | { kind: "client_week"; clientId: string; clientName: string; missingDays: number; guestCount: number }
  | { kind: "no_menu"; eventId: string; name: string; date: string }
  | { kind: "no_price"; eventId: string; name: string; date: string }
  | { kind: "no_type"; eventId: string; name: string; date: string }
  | { kind: "unassigned"; lineCount: number; eventCount: number }
  | { kind: "groceries"; uncoveredEventIds: string[]; partial: boolean; listId?: string }
  | { kind: "to_close"; events: { eventId: string; name: string; date: string }[] }
  | { kind: "to_invoice"; eventId: string; name: string; date: string; htva: number }
  | { kind: "to_invoice_many"; count: number; htva: number }
  | { kind: "to_invoice_month"; clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number }
  | { kind: "unpaid"; count: number; totalTvac: number; oldestDate: string }
  | { kind: "empty_week" }
  | { kind: "not_configured"; clients: boolean; ledger: boolean };

export function weekChecklist(inputs: ChecklistInputs): ChecklistItem[];
```

Order, condition, label and tap target. "Week events" = events dated in `weekDates`.

| # | kind | Condition | Label | Action and target |
|---|---|---|---|---|
| 1 | `client_week` | `clientsConfigured`; for each client with `active !== false` and templates, templates whose `weekday` has no event of that client in the week (today's `missingWeeks` test, moved) | "Hoona : 5 jours sans événement" | `Créer la semaine` opens the existing sheet (`sheet` state, `api.clients.instantiate`) with `guestCount` from the first missing template |
| 2 | `no_menu` | week event with `recipes.length === 0` | "Brunch Pirson : aucune recette au menu" | `Ajouter` → `/events/:id?ajouter=1#menu` |
| 3 | `no_price` | week event with `sellingPricePerGuest <= 0` | "Lunch étude Delen : prix non fixé" | `Fixer` → `/events/:id?focus=prix` |
| 4 | `no_type` | week event without `prestationType` | "Fondation Thalia : type de prestation manquant" | `Choisir ▾` renders a `<select>` in the row (options `settings.prestationTypes ?? DEFAULT_PRESTATION_TYPES`); change → `patchEvent(id, { prestationType, vatRate: type.defaultVatRate })` |
| 5 | `unassigned` | `people.some(p => p.active)`; week lines whose `assigneesOf(line, event)` is empty | "15 lignes sans personne (7 événements)" | `Assigner` opens `AssignSheet` (4.5) |
| 6 | `groceries` | week has events; `covered` = union of `eventIds` over all lists; `uncovered` = week events not covered; item when `uncovered.length > 0`, `partial` when some week event is covered | "Courses non créées (7 évén.)" or "Courses : 3 événements sans liste" | `Créer` builds `buildGroceryItems(uncoveredEvents, …)` and `api.groceryLists.create({ title, items, eventIds: uncovered, range })`, then `/grocery-list?id=`. When every week event is covered, a muted last row "Courses · liste du 19 au 25 ›" links to the newest covering list (not counted) |
| 7 | `to_close` | any event with `status === "upcoming"`, `date < today`, not in `invoicedEventIds(entries)` | "2 événements passés à terminer" with the events listed under it | inline `Terminer` per event: `buildCostSnapshot(event, recipeById, ingredientById)` then `patchEvent(id, { status: "completed", costSnapshot })`; toast "Événement terminé" |
| 8 | `to_invoice` | `status === "completed"`, not invoiced, client `invoicing !== "mensuelle"`, at most 3 items | "Mariage Dupont · 3 300 €" | `Facturer` → `/events/:id?facturer=1#facturation` |
| 8b | `to_invoice_many` | more than 3 of the above | "5 événements terminés à facturer · 8 120 €" | `Voir` → `/comptes/a-facturer` |
| 9 | `to_invoice_month` | completed, uninvoiced events of `invoicing === "mensuelle"` clients grouped by `(clientId, ymOf(date))`, only when `ym < ymOf(today)` | "Hoona : septembre à facturer · 8 événements · 3 360 €" | `Facturer le mois` → `/comptes/journal?client=<id>&prefill=month&ym=2026-09` (existing route, `ClientDetail.tsx:568`) |
| 10 | `unpaid` | sales entries with `isInvoiceEntry(e) && !e.paid` | "2 factures impayées · 1 242 € · la plus ancienne du 12/09" | `Voir` → `/comptes/a-facturer#impayes` |
| 11 | `empty_week` | no week events and no `client_week` item | "Aucun événement cette semaine" | `+ Ajouter` → `/events/new?date=<monday>&retour=` |
| 12 | `not_configured` | `!clientsConfigured || !ledgerConfigured`, rendered last, muted, not counted | "Clients et comptabilité non configurés" or one of the two | `Paramètres ›` → `/settings#apropos` |

Items 7 to 10 are skipped when `ledgerConfigured` is false; item 1 when `clientsConfigured` is false. Items 7 to 10 are not bound to the displayed week: they are the backlog, and Sunday is when it is cleared. The header count is the number of items excluding 12. After every action the page calls `reload()`; the `aria-live` block announces the new count.

`usePlanningData` gains `groceryLists` (`api.groceryLists.list()`, loaded only with `{ withLists: true }`, tolerant to failure), `people` (`settings.people ?? []`), `clientsConfigured` (false on a 503 from `api.clients.list()`, same pattern as `ledgerConfigured`) and `patchEvent(eventId, patch)`.

## 4. People

### 4.1 Types

```ts
// packages/types/src/entities/settings.ts
export interface Person {
  personId: string;     // slug of the name at creation: lowercase, accents stripped, non-alphanumerics to "-", "-2" on collision; never changes
  name: string;         // "Kristoff"
  initials?: string;    // 1 to 3 characters; defaults to the first two letters upper case
  active: boolean;      // false hides the person from pickers and filters, keeps old assignments readable
}
export interface AppSettings {
  // existing fields
  people?: Person[];
}

// packages/types/src/entities/event.ts
export interface EventRecipeLine { /* existing */ assignedTo?: string[] }  // personIds; absent or [] = inherit the event
export interface AppEvent { /* existing */ assignedTo?: string[] }          // personIds, the default for its lines

// packages/types/src/entities/client.ts
export interface ClientTemplate { /* existing */ assignedTo?: string[] }    // copied onto the event by instantiate
```

Unknown ids are tolerated on read (rendered as the id in muted text), so archiving a person never breaks an event. There is no delete, only `active: false`.

### 4.2 DTOs

```ts
// packages/types/src/dto/primitives.ts
export const personIds = z.array(z.string().min(1).max(40)).max(10);

// packages/types/src/dto/settings.ts
export const personSchema = z.object({
  personId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(60).trim(),
  initials: z.string().trim().min(1).max(3).optional(),
  active: z.boolean(),
}).strict();
// updateSettingsRequestSchema gains
people: z.array(personSchema).max(30).optional(),

// packages/types/src/dto/events.ts
// eventRecipeLineSchema and createEventRequestSchema gain
assignedTo: personIds.optional(),
// so addEventLineSchema, patchEventLineSchema and updateEventRequestSchema inherit it

// packages/types/src/dto/clients.ts
// clientTemplateSchema gains
assignedTo: personIds.optional(),
```

Backend: `EventsService.patchLine` merges `definedEntries(patch)`, so `PATCH /admin/events/:id/lines/:lineId { assignedTo: ["kristoff"] }` works once the DTO accepts it and `[]` clears. `putLines` spreads the stored line, so reordering keeps `assignedTo`. `ClientsService.eventFromTemplate` adds `...(template.assignedTo && { assignedTo: template.assignedTo })`. `SettingsService.update` writes given keys, so `PATCH /admin/settings { people }` is enough. `templateLineSchema` omits `assignedTo` (lines inherit the template's event-level value). No new endpoint.

Helpers in `packages/types/src/lib/planning.ts`:

```ts
export function assigneesOf(line: Pick<EventRecipeLine, "assignedTo">, event: Pick<AppEvent, "assignedTo">): string[] {
  return line.assignedTo?.length ? line.assignedTo : event.assignedTo ?? [];
}
// PrepLine gains assignedTo: string[] (effective) and ownAssignment: boolean
export function groupByPerson(lines: PrepLine[], people: Person[]): { personId: string | null; name: string; lines: PrepLine[] }[];
// one group per active person in settings order, then { personId: null, name: "Sans personne" } last; a line with two people appears in both
export function filterByPerson(lines: PrepLine[], personId: string): PrepLine[];
export function personName(people: Person[], personId: string): string;   // falls back to the id
export function personInitials(p: Person): string;
export function slugifyPersonId(name: string, taken: string[]): string;
export function shortEventName(ev: Pick<AppEvent, "name" | "templateId">, client?: Pick<Client, "name">): string;
// client.name when templateId is set and the client exists, or when ev.name is `${client.name} · <weekday> <day> <month>`; else ev.name
```

`weekPlan` gains `peopleByDay: Record<string, string[]>` (distinct effective assignees per date, settings order).

### 4.3 Settings › Équipe

`Settings.tsx`, new `Section title="Équipe"` after Fournisseurs. Rows of 44px: name (`EditableInlineText`), initials (2 to 3 characters, red border when duplicated among active people), `Actif` checkbox, a `Lien du jour` button that copies `${location.origin}/jour/aujourdhui?personne=<personId>` with the toast "Lien copié, à mettre sur l'écran d'accueil du téléphone", ▲▼ to reorder, `Désactiver` instead of delete. `+ Ajouter une personne` creates `{ personId: slugifyPersonId(name, ids), name, active: true }`. Saves through the existing settings draft and `PATCH /admin/settings { people }`. Three fields per person, nothing else: no hours, no rates, no logins. Extra service people paid through the journal (`personnel` entries with `personName`) stay separate.

`Section title="Objectifs par année"` gets `id="objectifs"`; `À propos` gets `id="apropos"` (section 8).

### 4.4 Assignment UI

`components/admin/PersonChips.tsx`: `PersonChips({ personIds, people, size: "sm" | "md", inherited?, onClick? })`. Initials in a circle (`bg-primary-soft text-foreground`), 20px on the week, 28px on the day, event and prep pages; `title` and `aria-label` carry the name; three then `+2`; `opacity-60` when `inherited`; when `onClick` is given and the list is empty, a dashed circle with a `UserPlus` icon. One colour for everyone.

`components/admin/PersonPicker.tsx`: a `card-elevated` popover anchored to the chips (a bottom sheet on `touch:`), one 44px checkbox row per active person with its chip, `Comme l'événement` when `allowInherit` (line context, writes `assignedTo: []`), `Personne` clears. Every toggle writes immediately through `onChange`; closing on outside tap or Escape. Props `{ value: string[]; options: Person[]; onChange(next): void; allowInherit?: boolean; onNext?(): void }`; `onNext` renders a `Suivant` button used by the walk in `AssignSheet`.

Where it appears:

- **Event page**: a row `Équipe` under the status tags with toggle chips (44px each, `aria-pressed`) for every active person, writing `event.assignedTo` through `api.events.update`. Each menu line shows `PersonChips` between the portions and the status dot; tap → `PersonPicker` for the line (`api.events.lines.patch`). Below `md` the line's category select and the chips move into the line's `⋯` (`Catégorie ›`, `Assigner ›`) so a row stays name, portions, dot, `⋯`.
- **Day view**: fourth mode `Par personne` (5.2); in every mode the row's `PersonChips` opens the picker.
- **Week**: card chips open the event picker, line chips open the line picker, both on pointer only (2.3).
- **Prep sheet**: read-only chips on the summary line; tap opens the line picker.
- **Client page**: each weekday template header shows `PersonChips` with the picker, written through `api.clients.update(clientId, { templates })` as the editor already does. This is what makes recurring weeks arrive assigned.
- **Event editor** (`/events/new`): an `Équipe` field (toggle chips) after the client picker, written as `assignedTo`.

Tap counts: assign an event to one person from the week, 2 taps (chips, name; outside tap closes). Per line, same. All lines of an event follow the event unless overridden.

### 4.5 AssignSheet

`components/admin/AssignSheet.tsx`, opened by the checklist `Assigner`: a full-height sheet on the phone, a 520px dialog on the laptop. Lists the week's days; each event is a row `Hoona · mardi 20 · Tout l'événement → (AM)(KR)(+)` (toggle chips write `event.assignedTo`), then its lines indented with their own chips (toggle writes `line.assignedTo`; an inheriting line shows the event's chips at `opacity-50`). Header shows "9 lignes sans personne"; it reaches 0 and turns `bg-success-soft`. `Fermer` closes; every tap already wrote.

### 4.6 A person's own list on their phone

The phone signs in once with the house login. `LoginPage.tsx` gains a checkbox `Rester connecté sur cet appareil` (default off). `AuthContext.tsx` and `api.ts` store the token in `localStorage` when checked, `sessionStorage` otherwise; `getToken()` reads `localStorage` first. Logout clears both. Kristoff then bookmarks `/jour/aujourdhui?personne=kristoff` (copied from Settings or shared from the week or day), which redirects to `/jour/<today>?personne=kristoff` every morning.

Day page with `?personne=` (5.3): title "Kristoff · Mardi 13 octobre", only his lines, status taps write the shared `prepStatus`, prep sheet `‹ ›` stay inside his lines, "Suivante" after Fait picks his next `À faire` line.

`Partager` on the week `⋯`, the day header and each `Par personne` group heading builds `${origin}/jour/${date}?personne=${id}` and calls `navigator.share({ title: "Mardi 20 octobre · Kristoff", url })`, falling back to clipboard with the toast "Lien copié".

### 4.7 Printing per person

- A person's day: `/jour/:date?personne=kristoff` → `Imprimer` prints the filtered list; title "Kristoff · Mardi 13 octobre".
- The whole day by person: `/jour/:date?mode=personne` → `Imprimer` prints one `.print-break` page per person (groups already break).
- The week: ⋯ › Imprimer la semaine… opens `/semaine/:isoWeek/imprimer`, built from `weekPrintPages()` (05-week-tasks-print.md section 6.11); options Une page par jour, Avec les ingrédients, Par personne.

### 4.8 Deferred: team link without login

The cockpit design's tier B (`/equipe/:token/jour/:date`, a `TeamLinkGuard` comparing `settings.teamLink.token` with `crypto.timingSafeEqual`, a `GET` returning events and recipes with every price field stripped, a `PATCH` for `prepStatus` only, and a `PlanningSource` context so Day, PrepSheet and RecipeCook render in a read-only mode) is not built in this iteration. It needs a backend module and a refactor of three pages that this iteration already rewrites. Record it in `REDESIGN.md` section 11 with the contract above; revisit when a person who is not the owner needs the list on a phone the owner never logged in, or when prices must be hidden from staff. The `?personne=` URL contract and `PrepLine.assignedTo` are designed so that tier B adds routes without changing the pages' data shape.

## 5. Jour changes

File `apps/frontend/src/pages/admin/Day.tsx`.

### 5.1 Header

- No breadcrumb since 06: the way back is the Semaine tab, Escape, the tinted head in the row of days and the phone `‹ Semaine` (`useBackLink({ to, label: "Semaine" })`), target `state.from ?? /semaine/<isoWeekOf(date)>?personne=`. `Aujourd'hui` lives in the toolbar `DateNav`, always rendered and disabled on today → `/jour/<today>` with the query kept. The page title reads `Semaine 43` as on the week; the date below is the body heading.
- Title `longDayLabel(date)`; with `?personne=`: "Kristoff · Mardi 13 octobre". Meta `2 événements · 42 convives · 2 lignes · 1 faite` (with a person: `4 lignes · 1 faite`).
- Actions on one row at every width: `‹` `›` (44px, keep `?personne`, `?mode`, `?masquer`), the mode control (segmented on `md+`, `<select>` below), the person `<select>` ("Toutes les personnes", hidden when no active person), and an `ActionMenu` `⋯` with `Courses du jour`, `Imprimer`, `Imprimer par personne`, `Partager…`, `Masquer les lignes faites` (checkable item, writes `?masquer=faites`), and for a past date with `upcoming` events `Terminer les 2 événements` (sequential `patchEvent` with `buildCostSnapshot`, toast with the count). On the phone the five rows of `day-375.png` become title, meta, one 44px row.
- `mode` in the URL: `evenement` (default), `categorie`, `recette`, `personne`. `MODES` gains `{ value: "personne", label: "Par personne" }`, shown only when an active person exists and `?personne=` is not set.

### 5.2 Groups

- `Par événement` headings use `shortEventName(ev, client)`; subtitle `30 convives · Menu à emporter`. "Hoona" no longer appears twice.
- `Par personne`: `groupByPerson(lines, people)`; sticky headings "Kristoff · 6 lignes · 1 faite" with a 44px `Partager` icon button at the right; "Sans personne" last, its rows showing the empty-state chip ready to assign, and a header button `Attribuer…` that opens the picker and writes `assignedTo` on every line of the group.
- Every row gains `PersonChips` (28px) between the name and the portions; tap opens `PersonPicker` for the line. Rows stay 56px.
- The laptop `StatusControl` column becomes `w-60` (240px) and the label `À faire` stops the wrap. `STATUS_LABEL.todo = "À faire"` in `StatusDot.tsx` and `SEGMENTS[0].label` in `StatusControl.tsx`.
- `IngredientList` (Par recette) uses `fmtQty`: "Mini quiches · 80 portions" shows `2,4 kg`, not `2400 g`.

### 5.3 Person view (`?personne=`)

The mode control and the per-event grouping are hidden. One list in course order from `filterByPerson(lines, id)`: `StatusDot` (44px), name at `text-lead`, "Hoona · Plat" under it, portions bold, chevron. Then a `Service` section listing events whose `assignedTo` includes the person but that have no line of theirs ("Mariage Dupont · 60 convives · Buffet avec service", tap → the event). A `Toutes les personnes` link clears the filter. `Masquer les lignes faites` stays. The `?done=` toast's "Suivante" picks the next `todo` line of the same person. Tap on a line → prep sheet with `?personne=` and `state.from`.

## 6. Fiche de préparation and Cuisiner changes

### 6.1 Units: `packages/types/src/lib/quantity.ts` (new, with `quantity.test.ts`)

```ts
export interface QtyParts { value: string; unit: string }    // { "5,4", "kg" }
export function fmtQty(qty: number, unit: UnitQty | string): QtyParts;
export function fmtQtyText(qty: number, unit: UnitQty | string): string;   // "5,4 kg"
export function scaleStepText(step: string, ratio: number): { parts: (string | { from: string; to: string })[]; changed: boolean };
```

Rules, French decimal comma through `Intl.NumberFormat("fr-BE", { maximumFractionDigits })`:

| unit | range | shown |
|---|---|---|
| g | ≥ 1000 | kg with one decimal, trailing zero trimmed: 5400 → `5,4 kg`, 2000 → `2 kg`, 1250 → `1,3 kg` |
| g | 10 to 999 | whole grams: 45.3 → `45 g`, 999 → `999 g` |
| g | < 10 | one decimal: 2.5 → `2,5 g` |
| ml | same thresholds with l | 1500 → `1,5 l`, 150 → `150 ml` |
| pièce, botte | any | unchanged: whole when whole, else one decimal; unit pluralised: `3 pièces`, `1 pièce`, `7,5 pièces`, `2 bottes` |
| other | any | one decimal, unit as stored |

Rendering: value in `font-semibold tabular-nums`, unit in `font-normal text-muted-foreground`, as today. `scaleQty` stays for the recipe cost table and the editor; every cook-facing render switches to `fmtQty(scaleQtyNumber(ri.qty, ratio), ri.unit)`: `RecipeReader.tsx:51`, `RecipeCook.tsx:180`, `Day.tsx:393`, and the "à acheter" display on `GroceryListPage.tsx` (`totalQty`, `haveQty`, the need column; the `NumericInput`s keep raw numbers in the stored unit). Jest: 5400 g → `5,4 kg`, 1000 g → `1 kg`, 999 g → `999 g`, 1500 ml → `1,5 l`, 7.5 pièce → `7,5 pièces`, 1 pièce → `1 pièce`.

`scaleStepText` matches `/(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l|oeufs?|œufs?|pièces?|pcs?)(?![\p{L}])/giu`, scales the number by `ratio`, re-expresses g/kg and ml/l through `fmtQty` (cl stays cl with one decimal), rounds eggs and pièces to the nearest whole (minimum 1), and leaves `°C`, `min`, `h`, `mm`, `cm`, "litres" written in full and "un oeuf" untouched. Ratio 1 returns `{ parts: [step], changed: false }`. Tests: "125 g" ×6 → "750 g"; "1,5 l" ×2 → "3 l"; "170 °C" unchanged; "5 oeufs" ×6 → "30 oeufs"; "20 cl" ×3 → "60 cl"; "un oeuf" unchanged.

Rendering of a changed part: `<mark className="rounded bg-primary-soft px-0.5">750 g</mark>`. On the prep sheet the base value follows in `text-sm text-muted-foreground`: `750 g (125 g)`. Cook mode shows the scaled value only. Both screens show one `text-sm` muted line under the Préparation heading when `ratio !== 1`: "Quantités adaptées pour 60 portions (recette de base : 10)". The `⋯` item `Quantités de la recette de base` (`localStorage["recipe-book:scale-steps"]`, default on) turns scaling off per device.

### 6.2 Mise en place ticks

`apps/frontend/src/hooks/use-mise-en-place.ts`: `useMiseEnPlace(lineId?: string)` returns `{ ticked: Set<number>; toggle(i): void; clear(): void }` backed by `localStorage["recipe-book:mep:<lineId>"]` (ingredient indexes). Without a `lineId` (recipe page) it is in-memory only. Rules:

- Each ingredient row on the prep sheet and in cook mode gets a 44px checkbox at the left (`aria-pressed`); rows stay 48px. A ticked row goes `text-muted-foreground`, no strikethrough (she re-reads a ticked quantity).
- Ticking the first ingredient while the line is `todo` writes `prepStatus: "doing"` with one PATCH, so the week shows the orange dot without a second gesture.
- `clear()` runs when the line reaches `done` from the prep sheet, cook mode or the day view. `Tout décocher` in the prep sheet `⋯`.
- `RecipeReader` gains `ticks?: Set<number>` and `onTick?: (i: number) => void`; without them it renders as today.

### 6.3 Prep sheet (`PrepSheet.tsx`)

```
‹ Mar 13 · Hoona        ‹ 1/2 ›   Aa  ⋯     44px bar
Poulet basquaise                            text-h1, full width (thumbnail only when a photo exists)
30 portions · Plat · (KR)                   text-lead, portions bold, chips tap → picker
Ingrédients
☐ Poulet fermier                  5,4 kg    48px rows, 44px checkbox, value bold, unit muted
☐ Poivron rouge                   1,8 kg
☑ Oignon                          900 g     ticked: muted
☐ Huile d'olive                   150 ml
Préparation
Quantités adaptées pour 30 portions (recette de base : 10)
1  Découper le poulet en morceaux…          scaled numbers marked, base in muted after
Note pour cette fois
[À faire | En cours | Fait]  [Cuisiner]     64px sticky bar (existing)
```

- The grey square goes: `photo ? <img/> : null`. The crumb becomes `Mar 13 · Hoona` (`truncate` on the client part only); the `/ who` suffix with `dayMonthShortLabel` is replaced.
- The `Stepper` and `×2 ÷2` leave the page: `RecipeReader` is rendered without `onPortionsChange`, heading "Ingrédients pour 30". `Modifier les portions` in `⋯` reveals the stepper and the existing `Enregistrer 36 portions / Revenir à 30` row. `showCost` is dropped (money lives on the event).
- "(recette de base : 10)" moves from the lead to the note under Préparation.
- Back, `‹ ›` and `Fait` carry `?personne=`; `‹ ›` walk `filterByPerson(dayLines, personne)` when set, else the full day. `Fait` → `/jour/:date?done=<lineId>&personne=` and `clear()`.
- Keeps: Aa toggle, wake lock, swipe and ← →, the note textarea, the `Ingrédients ▾` pill, the sticky bar.

### 6.4 Cook mode (`RecipeCook.tsx`)

- Subtitle `60 portions · Famille Dupont` (portions first so the truncation drops the name). The header and sheet `Stepper` render only when `line` is absent (opened from the recipe page).
- Ingredient column and sheet through `fmtQty` and `useMiseEnPlace(lineId)`.
- Current and previous step through `scaleStepText`, marks as above, the "Quantités adaptées…" line under the step counter.
- `Quitter` → `state.from ?? (line ? prep sheet : event ? day : recipe)`; `navigate(-1)` at line 118 goes. `Escape` does the same. `Marquer fait` clears the ticks and lands on `/jour/:date?done=&personne=`.
- Keeps: wake lock, swipe, ← →, `Précédent` and `Suivant` at 56px.

## 7. Finance

Money is edited on the event and in Comptabilité. The week counts and points.

### 7.1 Closing and invoicing an event

- **Close**: `Terminer l'événement` on `/events/:id` (existing). `buildSnapshot` moves from `EventDetail.tsx:228` to `packages/types/src/lib/costing.ts` as `buildCostSnapshot(event, recipeCostById, recipePortionsById): CostSnapshotRequest`, so the week checklist (`to_close`), the day header (`Terminer les n événements`) and the À facturer page compute the same numbers. All call `PATCH /admin/events/:id { status: "completed", costSnapshot }`. The event page's `?terminer=1` is not built (one tap on the page is enough).
- **Invoice a one-off**: `Créer la facture` on the event (existing `LedgerEntryForm` through `prefillFromEvent`). New: `?facturer=1` sets `billingForm = "facture"` on mount and scrolls to `#facturation`; `?facturer=acompte` opens the deposit form. The param is removed with `setSearchParams` after use. `?focus=prix` puts the price `EditableInlineNum` in edit mode; `?ajouter=1` opens the `+ Recette` `SearchSelect` focused. `Section title="Menu"` gets `id="menu"`, `Facturation` gets `id="facturation"`.
- **Invoice a monthly client**: `/comptes/journal?client=<id>&prefill=month&ym=` (existing).
- **Mark paid**: the journal's `Réglé` popover (existing `PATCH /admin/ledger/:id { paid, paymentMethod, paidAt }`). The event page's Facturation list gets the same two-field popover on its `À encaisser` tag, and the À facturer page offers it inline.

### 7.2 Comptabilité · À facturer

Route `/comptes/a-facturer`, file `apps/frontend/src/pages/admin/comptes/AFacturer.tsx`, tab added in `ComptesLayout.tsx` after Journal: `Journal · À facturer · Aperçu · Compte de résultats · Prévisionnel · Au réel`. Data from `useReportInputs(year)` plus recipes and ingredients for the snapshot. Pure `aFacturer(inputs, today)` in `packages/types/src/lib/reports.ts` (tests in `reports.test.ts`):

```ts
export interface AFacturer {
  toClose: AppEvent[];                                   // upcoming, date < today, not invoiced
  toInvoice: { eventId: string; label: string; date: string; htva: number; acomptesHtva: number; prestationType?: string }[];
                                                         // completed, not invoiced, client not mensuelle, oldest first
  toInvoiceMonthly: { clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number }[];
                                                         // completed, not invoiced, mensuelle client, ym < current month
  unpaid: (LedgerEntry & { daysOutstanding: number })[]; // isInvoiceEntry && !paid, oldest first
  totals: { toInvoiceHtva: number; unpaidTvac: number };
}
export function aFacturer(inputs: Pick<ReportInputs, "events" | "entries" | "clients">, today: string): AFacturer;
```

Jest: a completed event of a monthly client appears once in a monthly row and never as an event row; an event with only an `acompte` entry stays in `toInvoice` with `acomptesHtva` filled; an event in a `facture` entry's `eventIds` disappears; an `upcoming` past event with a `facture` entry is not in `toClose`.

Layout, `max-w-doc`, a two-tile strip then three `Section`s:

```
[À facturer · 2 · 3 720 € HTVA]   [Impayées · 2 · 1 242 € TVAC]

Événements passés à terminer
  Hoona · lun 12 oct · 30 conv. · 420 €                                   [Terminer]
À facturer                                                     (id="a-facturer")
  Hoona · septembre 2026 · 8 événements · 3 360 € HTVA · mensuelle       [Facturer le mois]
  Mariage Dupont · sam 17 oct · 3 300 € HTVA · acompte reçu 446 €        [Facturer]
Factures impayées                                              (id="impayes")
  n° 2026-033 · Chef à domicile Van Acker · 26/09 · 1 092,00 € TVAC · 16 jours   [Réglé ▾]
  Comptoir septembre · 30/09 · 893,50 € TVAC · 42 jours                         [Réglé ▾]
```

- `Terminer`: `buildCostSnapshot` then `api.events.update`; toast "Événement terminé"; the row moves to À facturer.
- `Facturer` → `/events/:id?facturer=1#facturation`. `Facturer le mois` → `/comptes/journal?client=&prefill=month&ym=`.
- `Réglé ▾`: the two-field popover (`paymentMethod`, `paidAt` default today) → `api.ledger.patch`. Beyond 30 days the age is `text-destructive`. Row title → `/comptes/journal?ym=<entry.ym>&filtre=non_regles` (the journal already reads `filtre`).
- Section meta: `Σ 5 655 € HTVA`, `Σ 1 242 € TVAC` (the same figure as the Aperçu tile and the journal rail). Empty state "Rien à facturer, rien d'impayé." When the ledger table is missing: the existing `NOT_CONFIGURED` message and only the first list.
- Phone: sections stacked, totals in a sticky footer, buttons full width.
- `Apercu.tsx`: the `À encaisser` tile links to `/comptes/a-facturer#impayes`.

### 7.3 What the week shows

Only `Signé 4 884 € · 224 conv.` and `Mois 11 758 € / 16 000 € ›` in the header, and the checklist items `to_close`, `to_invoice`, `to_invoice_month`, `unpaid`, each with a sum and a one-tap link. No margins, no tiles, no `Facturé` tick, no per-day euros, no ledger message. Billing state (Facturé, Acompte reçu, Payé) stays on the event page and À facturer.

### 7.4 What Comptabilité keeps

Journal, Aperçu, Compte de résultats, Prévisionnel and Au réel unchanged in content. Au réel: the month control becomes `‹ ›` around `monthLabel(ym)` (the native month input shows "October 2026"); a `completed` uninvoiced event row is tagged `à facturer` (warning) linking to `/events/:id?facturer=1`; `Heures` and `Observations` render on the amount's row at `md+` and `Heures 0 h` is hidden when `hoursSpent` is undefined (shows `ajouter des heures`).

## 8. Smaller fixes

- `Week.tsx`: "1 lignes · 0 faites" → `plural(total, "ligne")`, `plural(done, "faite")`.
- `Week.tsx`: empty days say "aucun" in the column header and nothing else; no "0 €".
- `Week.tsx`: "Préparation 0 / 15" for a week that has not started is not shown (`monday <= today` rule).
- `clients.service.ts:159`: name the event `client.name` when `template.name` equals the weekday label, else `${client.name} · ${template.name}`; the events list already shows the date on its second line (`subtitleFor`). Existing events are handled by `shortEventName`. `clients.service.spec.ts` gains both cases.
- `Events.tsx:128`: `fmt` from `recipe-helpers.ts` prints `3300.00 €`; use `fmtEur` from `@packages/types`. Same check on `ClientDetail.tsx` history rows (already `fmtEur`).
- `ClientDetail.tsx`: "Lundi" heading then "Lundi" template name; hide the name when it equals the weekday label.
- `EventDetail.tsx`: the italic `Téléphone` placeholder becomes `Ajouter un téléphone` in `text-muted-foreground`, not italic, hidden in print. Same for `E-mail`.
- `EventDetail.tsx` on the phone: menu row = ▲▼, name, portions, dot, `⋯`; category and assignment in `⋯` (4.4).
- `PrepSheet.tsx`, `RecipeCook.tsx`: covered in section 6.
- `Day.tsx`: covered in section 5; `w-72` → `w-60`.
- `StatusDot.tsx`, `StatusControl.tsx`: `À faire`.
- `AuReel.tsx`: month control, `à facturer` tag, inline hours (7.4).
- `Journal.tsx`: the `Total CA` block hides prestation types whose total is 0 and keeps `Sans type` only when non-zero; the right rail (Acomptes, Commissions, À encaisser) moves under the table below `2xl` so the TVA columns are not cut at 1366.
- `Resultats.tsx`: first column `sticky left-0 bg-background`, table `min-w-[1100px]` inside `overflow-x-auto`, so the last three columns are reachable at 1366.
- Infrastructure messages: the week never shows "Comptabilité non configurée" or "Clients non configurés". `usePlanningData` exposes `clientsConfigured`; the checklist renders the muted `not_configured` row with `Paramètres ›`. `Settings.tsx` › À propos lists both tables with their state from `GET /health` (`tables.clients`, `tables.ledger`; `api.health.get()` added if absent) and the sentence "Créer la table ta-clients-<stage> puis renseigner le paramètre SSM (README, étape 4)". `Clients.tsx:122` keeps its message and adds a `Paramètres ›` link, because that page is where she goes to use the feature.
- `index.css`: `.rail-label`; `@page { margin: 12mm }`; print hides empty-state chips.
- `GroceryListPage.tsx`: `fmtQty` on displayed quantities; crumb `Semaine n` from `list.range`.
- `EventEditor.tsx`: honour `?retour=`; `Équipe` field.

## 9. Files to change

Four areas, four developers, no file in two areas. Area A publishes its types and stubs first (day 1: entities, DTOs, `quantity.ts`, `checklist.ts` signatures with empty bodies, `use-planning-data.ts` new fields, `PersonChips`, `PersonPicker` shells) so B, C and D compile from day 1. Routes live in `App.tsx`, owned by B; C and D send B the route lines. `docs/redesign/REDESIGN.md` is updated by the spec author after the merge, not by the developers.

### Area A: types, backend and shared pieces

- `packages/types/src/entities/settings.ts`: `Person`, `AppSettings.people`.
- `packages/types/src/entities/event.ts`: `assignedTo` on `EventRecipeLine` and `AppEvent`.
- `packages/types/src/entities/client.ts`: `ClientTemplate.assignedTo`.
- `packages/types/src/dto/primitives.ts` (`personIds`), `dto/settings.ts` (`personSchema`, `people`), `dto/events.ts` (`assignedTo`), `dto/clients.ts` (`assignedTo` on the template), `dto/dto.test.ts`.
- `packages/types/src/lib/quantity.ts` (new) + `quantity.test.ts`: `fmtQty`, `fmtQtyText`, `scaleStepText`.
- `packages/types/src/lib/checklist.ts` (new) + `checklist.test.ts`: `ChecklistItem`, `weekChecklist`.
- `packages/types/src/lib/planning.ts` + `planning.test.ts`: `assigneesOf`, `PrepLine.assignedTo`, `PrepLine.ownAssignment`, `groupByPerson`, `filterByPerson`, `personName`, `personInitials`, `slugifyPersonId`, `shortEventName`, `WeekPlan.peopleByDay`.
- `packages/types/src/lib/costing.ts` + `costing.test.ts`: `buildCostSnapshot`.
- `packages/types/src/lib/reports.ts` + `reports.test.ts`: `aFacturer`, `AFacturer`.
- `packages/types/src/lib/index.ts`, `src/dto/index.ts`: exports. Run `pnpm build:types`.
- `apps/backend/src/clients/clients.service.ts` + `clients.service.spec.ts`: event naming, `assignedTo` copy.
- `apps/backend/src/events/events.service.spec.ts`: `patchLine` with `assignedTo: []` clears; `putLines` keeps `assignedTo`. No logic change in `events.service.ts`.
- `apps/frontend/src/lib/api.ts`: `health.get()`; token read from `localStorage` then `sessionStorage`; `setToken(token, persist)`.
- `apps/frontend/src/contexts/AuthContext.tsx`, `apps/frontend/src/pages/LoginPage.tsx`: `Rester connecté sur cet appareil`.
- `apps/frontend/src/lib/use-planning-data.ts`: `groceryLists` (`withLists`), `people`, `clientsConfigured`, `patchEvent`, `patchLine` typed with `assignedTo`.
- `apps/frontend/src/hooks/use-mise-en-place.ts` (new).
- `apps/frontend/src/components/admin/PersonChips.tsx` (new), `PersonPicker.tsx` (new).

### Area B: Week and sidebar

- `apps/frontend/src/pages/admin/Week.tsx`: rewrite (2.1 to 2.5, 3, 4.7).
- `apps/frontend/src/components/admin/WeekChecklist.tsx` (new), `AssignSheet.tsx` (new), `DayStrip.tsx` (new), `WeekPicker.tsx` (new: the range button with the hidden date input).
- `apps/frontend/src/components/admin/AdminSidebar.tsx`: labelled rail, no auto-collapse, `backTo` in the mobile bar.
- `apps/frontend/src/components/admin/AdminLayout.tsx`: `backTo` context, `useBackLink`.
- `apps/frontend/src/App.tsx`: Sunday rule in `HomeRedirect`; routes `/semaine` (`WeekIndexRedirect`), `/jour/aujourdhui` (`TodayRedirect`), `/comptes/a-facturer` (lazy import of D's file).
- `apps/frontend/src/index.css`: `.rail-label`, `@page`, print rules.

### Area C: Day, PrepSheet and cook

- `apps/frontend/src/pages/admin/Day.tsx`: section 5.
- `apps/frontend/src/pages/admin/PrepSheet.tsx`: 6.3.
- `apps/frontend/src/pages/admin/RecipeCook.tsx`: 6.4.
- `apps/frontend/src/components/ui/RecipeReader.tsx`: `fmtQty`, `scaleStepText` marks, `ticks` and `onTick`, the "Quantités adaptées" line.
- `apps/frontend/src/components/admin/StatusDot.tsx`, `apps/frontend/src/components/ui/StatusControl.tsx`: `À faire`.
- `apps/frontend/src/pages/admin/GroceryListPage.tsx`: `fmtQty`, `Semaine n` crumb.

### Area D: EventDetail, Journal and Settings

- `apps/frontend/src/pages/admin/EventDetail.tsx`: breadcrumb `Semaine / Jour / name` with `useBackLink`, `Équipe` chips, line `PersonChips`, `?facturer=`, `?focus=prix`, `?ajouter=1`, `#menu` and `#facturation`, Réglé popover on entries, phone line row, placeholder wording, `buildCostSnapshot` import.
- `apps/frontend/src/pages/admin/EventEditor.tsx`: `?retour=`, `Équipe` field.
- `apps/frontend/src/pages/admin/Events.tsx`: `fmtEur`.
- `apps/frontend/src/pages/admin/ClientDetail.tsx`: template header chips, duplicate weekday name.
- `apps/frontend/src/pages/admin/Clients.tsx`: `Paramètres ›` link under the 503 message.
- `apps/frontend/src/pages/admin/Settings.tsx`: `Équipe` section, `id="objectifs"`, `id="apropos"`, À propos table states.
- `apps/frontend/src/pages/admin/comptes/AFacturer.tsx` (new), `ComptesLayout.tsx` (tab), `Apercu.tsx` (tile link), `AuReel.tsx` (7.4), `Journal.tsx` (zero types, rail below `2xl`), `Resultats.tsx` (sticky column).

## 10. Acceptance checks

Take with `cd /tmp/pw && node shot.mjs <routes.json>` on the seeded stack (`smoke@example.com` / `smoke`).

### Semaine at 1366 (`/semaine/2026-W42`, `/semaine/2026-W43`)

- The sidebar is an 84px rail with a label under every icon; "Semaine" is tinted.
- Row 1 holds `‹ Semaine 42 ›`, the range with `▾`, and on the right two lines `Signé 6 874 € · 279 conv. · 1 / 20 lignes faites` and `Mois 11 758 € / 16 000 € ›`. No tiles, no chip row, no "Comptabilité non configurée" line.
- Row 2 holds the two selects, the `Lignes | Événements` toggle, `Courses de la semaine` and `⋯`.
- The checklist card follows with its count; on W43 it lists `Hoona : 5 jours sans événement` with `Créer la semaine`.
- The day headers start above y=300. Column headers read `Mar 13` then `2 évén. · 42 conv.` with no euro line; the people row shows initials once people exist.
- Cards read `Hoona`, not `Hoona · mardi 13 oct.`; `30 conv. · 1 ligne`, never `1 lignes`.
- Lines are visible without touching the toggle; `Lunch bowl pois chiches tahini` wraps to two lines, no ellipsis; Sam 17 shows all seven lines, no `+ 1 ligne`.
- Hovering a line shows the three dots after the chips, not over the portions.
- Sam 24 and Dim 25 on W43 read `aucun` under the date and nothing else.
- After `/jour/2026-10-22` → sidebar `Semaine`, the URL is `/semaine/2026-W43`.

### Semaine at 375

- Before the first day bar, in order: top bar, `‹ Semaine 42 › ⋯`, range plus `Aujourd'hui`, one money line, the collapsed checklist, the seven-cell strip. The first day bar is above y=290.
- No full-width buttons, no chips, no tiles.
- Every day bar is on one line: `Mar 13 · 2 évén. · 42 conv. ›`. Line rows show the dot, the name, the portions on one line.
- All seven days are present without tapping; the strip's `13` is tinted as today.

### Jour (`/jour/2026-10-13` at 375 and 1366; `/jour/2026-10-13?personne=kristoff` at 375)

- 375: title, meta, then one row with `‹ › [Par événement ▾] [Toutes les personnes ▾] ⋯`; the first line starts above y=320.
- 1366: the status control reads `À faire · En cours · Fait` on one line; group headings read `Hoona` with `30 convives · Menu à emporter` under it, never `Hoona` twice.
- With `?personne=`: title `Kristoff · Mardi 13 octobre`, one flat list, no mode control.
- `?mode=recette`: a merged ingredient reads `2,4 kg`, not `2400 g`.

### Fiche de préparation (`/events/<id>/lines/<id>` at 375 and 1366)

- No grey square when the recipe has no photo; the title spans the width.
- The bar reads `‹ Mar 13 · Hoona` without ellipsis at 375.
- No stepper, no ×2 ÷2; the heading reads `Ingrédients pour 30`.
- A checkbox sits at the left of every ingredient; `Poulet fermier` reads `5,4 kg`, `Oignon` reads `900 g`, `Huile d'olive` reads `150 ml`.
- The bottom bar reads `À faire · En cours · Fait` on one line and `Cuisiner`.

### Cuisiner (`/recipes/<id>/cook?portions=60&event=&line=` at 375)

- Subtitle `60 portions · Famille Dupont`; no stepper in the header.
- Step 1 shows `750 g` marked, not `125 g`; `30 oeufs`, not `5 oeufs`; a line `Quantités adaptées pour 60 portions (recette de base : 10)`.
- `Quitter` lands on the prep sheet.

### Événement (`/events/<id>` at 375 and 1366)

- Breadcrumb `Semaine 42 / Sam 17 oct / Mariage Dupont`; on the phone the top bar reads `‹ Sam 17`.
- An `Équipe` row with toggle chips under the status tags.
- 375: each menu line is one row: ▲▼, name, `60 port.`, dot, `⋯`.
- `Ajouter un téléphone` in muted upright text, not italic `Téléphone`.
- `/events/<id>?facturer=1` opens with the invoice form visible.

### Comptabilité

- `/comptes/a-facturer` at 1366: tabs `Journal · À facturer · Aperçu · …`; two tiles; three sections; `Mariage Dupont` under À facturer with `Facturer`; Hoona only as a monthly row once its month is over.
- `/comptes/au-reel` at 1366: the month control reads `‹ Octobre 2026 ›`; a signed event row is one line with `Heures` and `Observations` at the right.
- `/comptes/resultats` at 1366: the first column stays visible while the table scrolls.
- `/events` at 1366: amounts read `3 300,00 €`.

### Settings and clients

- `/settings`: an `Équipe` section after Fournisseurs with `+ Ajouter une personne` and a `Lien du jour` button per row; À propos lists `ta-clients` and `ta-ledger` with their state.
- `/clients` with the table missing: the existing message plus `Paramètres ›`; the week shows only the muted checklist row.

### Not checked by screenshot

- Print output of the week, the per-person print and the day; verify in the browser's print preview.
- iPad landscape (1024 to 1279px): the phone layout applies; check that the seven-cell strip and the day bars fit.
- `navigator.share` on iOS; the clipboard fallback is the one tested on the laptop.
