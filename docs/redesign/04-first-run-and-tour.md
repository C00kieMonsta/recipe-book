# 04. First run and the guided tour ("Visite guidée")

Status: ready to build. Depends on 03-notion-ui.md (primitives, tokens, the `touch:` variant). No new library.

Paths are relative to `apps/frontend/` unless they start with `docs/`.

---

## 1. Goal

A first-time user (Dalia on Sunday, Kristoff on his phone, a new caterer on an empty install) is shown around once, in ten steps, following the order of the week: the Semaine page, the checklist, a day, the way back, the fiche with scaled quantities, assigning people, Événements and Hoona duplication, Offres and the devis, Comptabilité, Paramètres. The tour can be restarted from Paramètres › Général at any time.

Rules:

- The tour works on any workspace, including a fresh install with no data. A step whose anchor is missing shows a centred card with a static explanation. Never a crash, never a blank step.
- Route-driven: a step navigates with `react-router` before it spotlights. Only routes that exist on every workspace: `/semaine`, `/jour/aujourdhui`, `/events`, `/offres`, `/comptes/journal`, `/settings`. The fiche step resolves its route from data and falls back to a centred card.
- Notion feel: one small white card (hairline, `shadow-dialog`), 14px text, a dim overlay with a rectangular cut-out so the page stays visible. Nothing animated beyond `animate-pop`, `animate-fade-in` and `animate-sheet`.
- Vouvoiement everywhere. Body copy at most 290 characters, titles at most 40.

What the persona reports asked the tour to explain (ids from the reports): the stat line under the week title (Dalia F02, finance F17), the checklist and its bare verbs (Dalia F06, UX F14, F23), how to open a day and the hidden `+` (Dalia F05), the way back from a day (Kristoff K4, UX F21), the status dot legend (Kristoff K5, UX F09), scaled quantities and mise en place ticks (Dalia F16, Kristoff K6), Terminer in cook mode (Dalia F10, Kristoff K13), initials and assigning (Dalia F01, F03, F11, UX F08, F15), duplicating Hoona and the semaine type (Dalia F04, finance F14), offers and the devis (Dalia's third batch, points 2 and 11 of `07-offers-pricing-attachments.md`), the Comptabilité tabs (Dalia F12, UX F17, finance F03, F07, F10), the Paramètres tabs (empty E15, E16, finance F11).

---

## 2. Entry points

| # | Where | Who sees it | Action |
|---|---|---|---|
| 1 | First-run callout on `/semaine/:isoWeek`, above the checklist | Anyone whose browser has no `recipe-book:tour` key | "Faire la visite" starts the tour. "Plus tard" hides the callout for good. |
| 2 | Paramètres › Général › section "Visite guidée" (first section of the tab) | Everyone, always | "Démarrer la visite" starts the tour. |

No sidebar entry, no `?` icon, no query parameter. Two entry points are enough: the callout catches the first visit, the Settings section is where the owner asked for it.

Starting the tour from Settings navigates to `/semaine` for step 1 and ends on `/settings` at step 10, so the user comes back where she started.

---

## 3. Steps

Ten steps. Routes are the seed-independent forms. `/semaine` redirects to the last viewed week or the planning week; `/jour/aujourdhui` redirects to today. The tour waits for the anchor after navigation (see 4.4), so redirects are fine.

| n | Route | Anchor (`data-tour`) | Anchor file and element | Title | Body | Phone (375) |
|---|---|---|---|---|---|---|
| 1 | `/semaine` | `week-stats` | `pages/admin/Week.tsx`, the `<span className="tabular-nums">` passed as `meta` to `PageHeader` | Votre semaine | La Semaine est votre page d'accueil. Cette ligne la résume : chiffre d'affaires signé, convives, préparations faites, et le mois en cours face à l'objectif. Cliquez le mois pour ouvrir la comptabilité. | Same anchor, same copy. Card pinned to the bottom. |
| 2 | `/semaine` | `week-checklist` | `pages/admin/Week.tsx`, the `<div className="no-print mt-3">` that wraps `<WeekChecklist>` | Ce qui manque pour la semaine | Cette case liste ce qui manque avant de lancer la semaine : personnes, courses, prix, factures. Elle se remplit toute seule ; le lien bleu à droite règle chaque point. First-run body (no event yet): Tant que le carnet est vide, cette case liste les cinq étapes pour démarrer. Ensuite elle dit chaque semaine ce qui manque ; le lien bleu à droite règle chaque point. | Same anchor. The tour opens the callout for this step (`setChecklistOpen(true)` through the `tour:open-checklist` event, 4.6) because it is collapsed by default under 1280px. |
| 3 | `/semaine` | `week-day` | `pages/admin/Week.tsx`, two elements carry it, both for the first day (`plan.days[0]`) only: the header `<Link to={dayUrl(day.date)}>` in the xl grid (line ~506) and the header `<Link>` of the stacked `<section>` (line ~614). The resolver picks the visible one. | Un jour par colonne | Cliquez le nom d'un jour pour l'ouvrir. Le + à côté crée un événement ce jour-là. Sous le nom : événements, convives, préparations faites sur le total. Glissez une préparation vers un autre jour, ou ⋯ › Déplacer au…. | Title "Un jour par section". Body: Touchez le nom d'un jour, ou un chiffre dans la bande L M M J V S D, pour l'ouvrir. Le + crée un événement ce jour-là. Maintenez une préparation pour la glisser vers un autre jour. |
| 4 | `/jour/aujourdhui` | `day-open` (step key stays `breadcrumb`) | `components/admin/DayHeads.tsx` and `components/admin/DayStrip.tsx`, the tinted cell of `DayHeads` (xl) or `DayStrip` (below xl); the resolver picks the visible one. Both render from the URL dates before data arrives, so there is no loading race. | Revenir à la semaine | Le jour ouvert est surligné dans la rangée des jours. L'onglet Semaine, Échap ou un clic sur ce jour ramènent à la semaine. Le rond devant chaque préparation est son statut : vide à faire, bleu en cours, vert fait. | Anchor `back`: `components/admin/AdminSidebar.tsx`, the `<Link to={backTo.to}>` in the phone top bar. Body: « ‹ Semaine » en haut à gauche ramène à la semaine. Le rond devant chaque préparation est son statut : vide à faire, bleu en cours, vert fait. Un tap le change, sans confirmation. |
| 5 | resolved: `/events/:eventId/lines/:lineId` of the nearest upcoming event with a menu line, else none (centred card, stays on `/jour/…`) | `fiche-ingredients` | `components/ui/RecipeReader.tsx`, the first `<section>` (heading "Ingrédients pour N" and the list) | La fiche de préparation | Les quantités sont déjà calculées pour les convives de l'événement : rien à recalculer. Cochez les ingrédients pendant la mise en place. Cuisiner montre la recette étape par étape ; Terminer marque la ligne faite. | Same anchor. The list is scrolled so the heading and three rows sit above the bottom card. Fallback body when no line exists: Chaque recette au menu d'un événement a sa fiche : quantités déjà calculées pour les convives, ingrédients à cocher, et Cuisiner pour suivre la recette étape par étape. Créez un événement avec une recette pour la voir. |
| 6 | `/semaine` | `assign` | `pages/admin/Week.tsx`, the `<div className="pr-1 pt-0.5">` wrapping `<AssignChips>` on the first event card of the xl grid (first day with an event, first event). Only that one card carries the attribute. | Attribuer le travail | Les initiales sur une carte sont les personnes de Paramètres › Équipe. Cliquez-les pour attribuer l'événement ou une seule ligne. « Choisir qui fait quoi » dans la case Ce qui manque traite toute la semaine. | Anchor `planning-tabs` (`components/admin/PlanningBar.tsx`, a `<div data-tour="planning-tabs">` around `<ViewTabs>`). Body: Pour attribuer, utilisez « Choisir qui fait quoi » dans la case Ce qui manque. Pour voir ce que chacun doit faire, ouvrez un jour puis l'onglet Par personne. Fallback body (no card, laptop): Les personnes de Paramètres › Équipe reçoivent le travail, par événement ou par ligne, depuis la carte de l'événement ou « Choisir qui fait quoi » dans la case Ce qui manque. L'onglet Par personne d'un jour montre la liste de chacun. |
| 7 | `/events` | `events-list` | `pages/admin/Events.tsx`, a new `<div data-tour="events-list">` around the `<Toolbar>` and the `<div className="mt-2">` holding the `<Table>` | Événements | Tous vos événements, à venir et terminés. Pour refaire une semaine Hoona : ouvrez un événement Hoona, puis ⋯ › Dupliquer. Créer un événement pour un client remplit son menu depuis sa semaine type. | Same anchor; the cut-out is clipped to the viewport height minus the card. |
| 8 | `/offres` | `offers-list` | `pages/admin/Offers.tsx`, the `<div data-tour="offers-list">` around the Offers table or the empty state | Offres et devis | Une offre est un menu type avec son prix par convive : Buffet 1, Walking dinner 2. Depuis une offre, Faire un devis adapte le menu et le nombre de convives pour un client, montre le coût et la marge, puis crée l'événement. Fallback body: the same text. | Same anchor, same copy. |
| 9 | `/comptes/journal` | `comptes-tabs` | `pages/admin/comptes/ComptesLayout.tsx`, a `<div data-tour="comptes-tabs" className="flex min-w-0">` around `<ViewTabs>` in the `Toolbar` left slot | Comptabilité | Journal : une ligne par facture, acompte, CA du mois ou achat. À facturer, ou À terminer quand les factures se font dans un autre outil : les événements passés à clôturer. Aperçu et Compte de résultats : l'année. Prévisionnel : objectif et charges. Au réel : signé face à l'objectif. | Same anchor. The tabs scroll horizontally on the phone; the resolver calls `scrollIntoView({ inline: "start" })` on the anchor's first child before measuring. |
| 10 | `/settings` | `settings-tabs` | `pages/admin/Settings.tsx`, a `<div data-tour="settings-tabs" className="flex min-w-0">` around `<ViewTabs>` in the `Toolbar` left slot. The "Visite guidée" section sits right under it. | Paramètres | Équipe : les personnes à qui vous attribuez le travail. Catalogue : catégories, types de prestation et fournisseurs. Société : vos coordonnées et où se font les factures. Finances : charges fixes et objectif. Pour revoir cette visite : Général › Visite guidée, juste en dessous. | Same anchor and copy. Last step: the primary button reads "Terminer". |

Step 1 on an empty workspace spotlights "Signé 0 € · 0 conv. · Mois 0 € · Définir l'objectif ›", which still matches the copy. Step 2 spotlights the one-row checklist "Aucun événement cette semaine · + Ajouter". Step 3 spotlights "Lun 12 / aucun". Step 5 and step 6 (laptop) show the centred card with their fallback body. Step 8 on an empty workspace spotlights the « Aucune offre type » empty state. Steps 7, 8, 9, 10 anchor toolbars, tables or empty states that render with or without data.

Character counts (checked): every body is 118 to 283 characters (step 9, Comptabilité, is the longest), every title at most 29 (step 2, "Ce qui manque pour la semaine").

---

## 4. Tour component API

Four new files under `src/components/admin` plus one under `src/lib`. No new dependency.

### 4.1 `lib/tour-storage.ts`

```ts
export const TOUR_KEY = "recipe-book:tour";

export interface TourRecord {
  seenAt?: string;          // ISO date-time, set when the tour is finished or skipped
  dismissedOffer?: boolean; // set by "Plus tard" on the first-run callout
}

export function readTour(): TourRecord;                // {} when absent or unparsable
export function writeTour(patch: Partial<TourRecord>): TourRecord; // merge and persist
```

Plain functions, not a hook: the callout, the Settings section and the provider all read the same key and the provider is the only writer at runtime (it exposes the values through context).

### 4.2 `components/admin/tour-steps.ts`

```ts
import type { AppEvent } from "@packages/types";

export interface TourStep {
  key: string;                                  // "week-stats", used for the counter and tests
  // Static route, or a resolver that may return null (stay on the current route, centred card).
  route: string | ((ctx: TourContext) => Promise<string | null>);
  anchor: string | null;                        // data-tour value, null = centred card
  title: string;
  body: string;
  // Shown on the centred card when the anchor is missing or the route resolved to null.
  fallbackBody?: string;
  // Overrides on phones (see 4.5 for the phone test). Resolution order on a phone: phone.anchor, then anchor, then centred.
  phone?: { anchor?: string; title?: string; body?: string };
  // Fired after navigation and before the anchor wait, for pages that must open something (the checklist).
  before?: () => void;
}

export interface TourContext {
  events: () => Promise<AppEvent[]>;            // api.events.list, cached by the api layer
  today: string;                                // todayIso()
}

export const TOUR_STEPS: TourStep[];            // the ten steps of section 3, in order
```

The fiche resolver (step 5):

```ts
route: async ({ events, today }) => {
  const all = await events().catch(() => [] as AppEvent[]);
  const withLine = all.filter((e) => e.recipes.length > 0).sort((a, b) => a.date.localeCompare(b.date));
  const ev = withLine.find((e) => e.date.slice(0, 10) >= today) ?? withLine.at(-1);
  return ev ? `/events/${ev.eventId}/lines/${ev.recipes[0].lineId}` : null;
}
```

The checklist step (step 2) sets `before: () => window.dispatchEvent(new CustomEvent("tour:open-checklist"))`; `Week.tsx` listens and calls `setChecklistOpen(true)`.

### 4.3 `components/admin/TourProvider.tsx`

```ts
export interface TourState {
  active: boolean;
  index: number;                 // 0-based step index while active
  seenAt: string | null;
  dismissedOffer: boolean;
  start: () => void;             // index 0, navigates to the first route
  next: () => void;              // last step: finish()
  prev: () => void;              // index 0: no-op
  skip: () => void;              // "Ignorer" and Escape: writeTour({ seenAt }) then close
  finish: () => void;            // "Terminer": writeTour({ seenAt }) then close
  dismissOffer: () => void;      // "Plus tard": writeTour({ dismissedOffer: true })
}

export function TourProvider({ children }: { children: ReactNode }): JSX.Element;
export function useTour(): TourState;
```

Mounted once in `AdminLayout.tsx`, inside `ChromeContext.Provider` so it can call `useNavigate()` and so the fiche (which hides chrome) still has the tour. The provider renders `<Tour />` (4.4) through a portal when `active`.

Step change sequence (`goTo(index)`):

1. `setPhase("loading")`: the overlay renders at full dim, no card, no cut-out.
2. Resolve the route: a string is used as is; a function is awaited (3 s timeout, then `null`).
3. If the route is a string and differs from `location.pathname`, `navigate(route)`. If `null`, stay.
4. Call `step.before?.()`.
5. Wait for the anchor (4.4). Found: `setPhase("anchored", rect)`. Not found after 2 s or `anchor === null`: `setPhase("centred")`.

Browser back during the tour (the only way to leave a page, since the overlay blocks clicks): a `location` change not started by the provider re-runs step 5 for the current step; missing anchor after 2 s means centred card. The tour never closes on its own.

### 4.4 `components/admin/Tour.tsx`

```ts
export interface TourProps {
  step: TourStep;
  index: number;
  total: number;
  phase: "loading" | "anchored" | "centred";
  rect: DOMRect | null;          // viewport coordinates of the anchor, padded by 6px
  phone: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}
export default function Tour(props: TourProps): JSX.Element;

// Returns the first visible element for a data-tour value, or null.
export function findAnchor(name: string): HTMLElement | null;
// Polls findAnchor with requestAnimationFrame until found or timeout.
export function waitForAnchor(name: string, timeoutMs: number): Promise<HTMLElement | null>;
```

`findAnchor` queries every `[data-tour="<name>"]` and returns the first whose `getClientRects().length > 0` and whose bounding box has width and height above 0. That is what picks the `DayHeads` cell over the stacked header on `week-day`, the `DayHeads` cell over the `DayStrip` cell on `day-open`, and the phone top bar link on a phone.

Rendering, desktop:

```
<div role="presentation" class="fixed inset-0 z-50">                       click catcher, transparent, blocks the page
  <div class="fixed rounded-lg animate-fade-in pointer-events-none"         spotlight box at rect, 6px padding
       style="box-shadow: 0 0 0 100vmax var(--overlay)" />                 the shadow is the dim overlay
  <div role="dialog" aria-label="Visite guidée" tabindex="-1"               the card, 320px wide
       class="fixed z-[60] w-[320px] rounded-2xl bg-background p-4 shadow-dialog outline-none animate-pop">
    <p class="text-caption text-muted-foreground">2 sur 10</p>
    <h2 class="mt-1 text-[15px] font-semibold leading-snug">À faire avant la semaine</h2>
    <p id="tour-card-body" class="mt-1.5 text-sm text-foreground">…</p>
    <div class="mt-3 flex items-center gap-1">
      <Button variant="subtle" size="sm" onClick={onSkip}>Ignorer</Button>
      <span class="ml-auto" />
      <Button variant="subtle" size="sm" onClick={onPrev} disabled={index === 0}>Précédent</Button>
      <Button variant="primary" size="sm" onClick={onNext}>{last ? "Terminer" : "Suivant"}</Button>
    </div>
  </div>
</div>
```

Button mapping: "Ignorer", "Précédent" are `variant="subtle"` (text buttons); "Suivant" / "Terminer" is `variant="primary" size="sm"`. The card is the only primary on screen because the page is under the overlay. Centred phase: same card, no spotlight box, overlay is a plain `bg-overlay` layer, card centred with `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`. Loading phase: overlay only, at most 2 s (3 s for a resolved route).

Rendering, phone: the card is a bottom sheet, `fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-dialog animate-sheet`, the same drag bar as `Sheet`, buttons 44px through `touch:` (the `Button` primitive does that). The spotlight box is drawn above the card and the card never overlaps it (4.5).

Keyboard (document listener while active): `Escape` = Ignorer, `ArrowRight` = Suivant (or Terminer on the last step), `ArrowLeft` = Précédent, `Tab` loops inside the card (same `FOCUSABLE` loop as `Dialog.tsx`). On every phase change the card receives focus (`panelRef.current.focus()`); the element that had focus before the tour is restored on close.

### 4.5 Positioning

Phone test: `useTouchScreen()` or `window.innerWidth < 768` (the `md` breakpoint where the phone top bar replaces the sidebar). Either one makes the bottom-sheet layout.

Desktop:

1. `anchor.scrollIntoView({ block: "center", behavior: "instant" })`, skipped when the anchor or an ancestor is `position: fixed`.
2. Next frame: `rect = anchor.getBoundingClientRect()` expanded by 6px, clamped to the viewport.
3. Card height `h` is measured after a first hidden render (`visibility: hidden`), then:
   below if `rect.bottom + 8 + h <= innerHeight - 16`, else above (`top = rect.top - 8 - h`), else (neither fits, tall anchors such as the Événements table) the card is placed at `top = 16` to the right of the rect when `rect.right + 8 + 320 <= innerWidth - 16`, else centred over the page.
4. `left = clamp(rect.left, 16, innerWidth - 320 - 16)`.
5. The card never intersects the rect: the step 3 check guarantees it; if the computed card box still intersects (rounding), fall through to the next placement.

Phone:

1. Card height `h` measured as above.
2. Visible band for the anchor: from `topbar` (44px when the phone top bar is shown, 0 on the fiche) to `innerHeight - h - 16`.
3. `scrollIntoView({ block: "start" })`, then if `rect.bottom > innerHeight - h - 16`, `window.scrollBy(0, rect.bottom - (innerHeight - h - 16))`; if the anchor is taller than the band, the cut-out is clipped to the band (the top of the element is shown).
4. Fixed anchors (`back` in the top bar) are not scrolled.

Both: re-measure on `resize`, `scroll` (capture, passive) and a `ResizeObserver` on the anchor; the spotlight box and the card update in the same frame. No transition on the box (`transition-none`).

Z-order: click catcher `z-50` (same layer as `Sheet` and `Dialog` overlays, which cannot open while the catcher is up), card `z-[60]`. Toasts (`Toaster`) stay above at their own layer; none fire during the tour.

### 4.6 Anchor attributes

| `data-tour` | File | Element |
|---|---|---|
| `week-stats` | `components/admin/WeekMeta.tsx` | the `meta` `<span className="tabular-nums">`, rendered by both planning pages |
| `week-checklist` | `components/admin/PlanningFrame.tsx` | `<div className="no-print mt-3">` around the callouts, rendered by both planning pages |
| `week-day` | `components/admin/DayHeads.tsx` and `pages/admin/Week.tsx` | the first day's `<Link>` in the heads row and the first stacked section header (both; `data-tour={i === 0 ? "week-day" : undefined}`) |
| `day-open` | `components/admin/DayHeads.tsx` and `components/admin/DayStrip.tsx` | the selected (tinted) cell of each (`data-tour={isSelected ? "day-open" : undefined}`); step 4 anchors on it |
| `assign` | `pages/admin/Week.tsx` | the `<div className="pr-1 pt-0.5">` around `AssignChips` of the first event card (xl grid only) |
| `planning-tabs` | `components/admin/PlanningBar.tsx` | new `<div data-tour="planning-tabs" className="flex min-w-0">` around `<ViewTabs>` |
| `breadcrumb` | `components/ui/PageHeader.tsx` | `<nav aria-label="Fil d'Ariane">`, kept for the record pages; the planning pages no longer pass a breadcrumb |
| `back` | `components/admin/AdminSidebar.tsx` | the phone top bar `<Link to={backTo.to}>` |
| `fiche-ingredients` | `components/ui/RecipeReader.tsx` | the first `<section>` (ingredients) |
| `events-list` | `pages/admin/Events.tsx` | new `<div data-tour="events-list">` around `Toolbar` + table wrapper |
| `offers-list` | `pages/admin/Offers.tsx` | `<div data-tour="offers-list">` around the Offers table or the empty state |
| `comptes-tabs` | `pages/admin/comptes/ComptesLayout.tsx` | new `<div data-tour="comptes-tabs" className="flex min-w-0">` around `<ViewTabs>` |
| `settings-tabs` | `pages/admin/Settings.tsx` | new `<div data-tour="settings-tabs" className="flex min-w-0">` around `<ViewTabs>` |

`Week.tsx` also listens for `tour:open-checklist`:

```ts
useEffect(() => {
  const open = () => setChecklistOpen(true);
  window.addEventListener("tour:open-checklist", open);
  return () => window.removeEventListener("tour:open-checklist", open);
}, [setChecklistOpen]);
```

### 4.7 Degradation

| Situation | Result |
|---|---|
| Anchor absent (empty workspace, person filter active, element hidden at this width) | Centred card with `fallbackBody ?? body`, plain overlay, same buttons. |
| Route resolver returns `null` (no event line) | Stay on the current page, centred card with `fallbackBody`. |
| Route resolver throws or times out (3 s) | Same as `null`. |
| Page still loading after navigation (anchor appears late) | Overlay only for up to 2 s, then centred card. If the anchor appears later during the same step, the card moves next to it on the next measurement (one `animate-pop`). |
| User presses browser back during the tour | The step re-resolves on the new page; missing anchor means centred card. |
| `localStorage` unavailable (private mode) | `readTour()` returns `{}` and `writeTour()` swallows the error: the callout shows every visit, the tour still runs. |
| Window resized across the xl breakpoint mid-step | Re-measure picks the other `week-day` element; the card and box follow. |

---

## 5. Overlay and positioning summary

- Overlay colour: `--overlay` (`rgba(15,15,15,0.6)`), drawn as the `box-shadow: 0 0 0 100vmax` of the spotlight box, so the cut-out is one rounded rectangle (`rounded-lg`, 6px) with 6px padding around the anchor. Centred phase: a plain `bg-overlay` layer.
- A transparent click catcher under the box blocks the page. Wheel and touch scroll still reach the page so the user can look around; the card and box follow the anchor.
- The card is 320px on desktop, full width on phones. It sits below the anchor when there is room, else above, else to the right, else centred. On phones it is always pinned to the bottom and the page is scrolled so the anchor sits above it.
- The anchor is never covered by the card.

---

## 6. Persistence

Key `recipe-book:tour`, JSON:

```json
{ "seenAt": "2026-10-12T19:04:11.000Z", "dismissedOffer": true }
```

| Event | Write |
|---|---|
| "Terminer" on the last step | `seenAt = now` |
| "Ignorer" or Escape at any step | `seenAt = now` |
| "Plus tard" on the first-run callout | `dismissedOffer = true` |
| "Faire la visite" on the callout | nothing until the tour ends (then `seenAt`) |
| "Démarrer la visite" in Settings | nothing until the tour ends (then `seenAt`, overwriting the previous date) |

Other keys are untouched. The existing `recipe-book:checklist-open` key is set to `true` by step 2 (the tour opens the checklist; the user can collapse it again later).

---

## 7. First-run callout

File: `components/admin/FirstRunCallout.tsx`, rendered by `Week.tsx` in the `no-print mt-3` block, before `<WeekChecklist>`.

Condition: `!tour.seenAt && !tour.dismissedOffer && !tour.active && !selectedPerson && !loading`. The `?personne=` guard keeps it off a cook's filtered view (Kristoff K11).

```tsx
<Callout emoji="👋" title="Première visite ?" className="mb-3">
  <p>La visite guidée montre en dix étapes comment planifier la semaine, préparer le jour même et facturer.</p>
  <div className="mt-2 flex flex-wrap gap-1">
    <Button variant="default" size="sm" onClick={tour.start}>Faire la visite</Button>
    <Button variant="subtle" size="sm" onClick={tour.dismissOffer}>Plus tard</Button>
  </div>
</Callout>
```

"Faire la visite" is `default` (white, `shadow-outline`), not `primary`: the page keeps "+ Nouveau" as its single blue button (rule 5). "Plus tard" writes `dismissedOffer` and the callout never returns, on any device that shares this `localStorage`. Finishing or skipping the tour also removes it (`seenAt`).

Phone: same callout, 44px buttons through `touch:`, placed above the collapsed checklist row. It is not collapsible.

---

## 8. Settings section

`pages/admin/Settings.tsx`, the `general` fragment, first `Section`, before "Formats de recette":

```tsx
<Section title="Visite guidée" meta={tour.seenAt ? `Vue le ${longDate.format(new Date(tour.seenAt))}` : undefined}>
  <p className="text-sm text-muted-foreground">Neuf étapes pour voir comment planifier la semaine, préparer le jour même et facturer. Environ deux minutes.</p>
  <Button variant="default" size="md" className="mt-2" onClick={tour.start}>Démarrer la visite</Button>
</Section>
```

- `longDate = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric" })`, so the note reads "Vue le 12 octobre 2026" in the grey `meta` slot next to the title. Absent when `seenAt` is absent.
- "Démarrer la visite" is `variant="default"` (the Notion secondary: white, hairline edge). The page primary stays "Enregistrer" when something changed.
- Phone: same section, button 44px, full copy.
- `tour.start()` navigates to `/semaine` for step 1 and comes back to `/settings` at step 9.

---

## 9. Accessibility

- Card: `role="dialog"`, `aria-label="Visite guidée"`, `tabindex="-1"`, focused on every step. No `aria-modal`: the spotlighted element must stay in the accessibility tree because the card describes it.
- Body paragraph has `id="tour-card-body"`. While a step is anchored, the anchor element gets `aria-describedby="tour-card-body"`; the attribute is removed when the step changes or the tour closes (the previous value, if any, is restored).
- Counter "2 sur 10" is plain text inside the dialog, read with the title.
- Keyboard: Escape = Ignorer, ArrowLeft = Précédent, ArrowRight = Suivant / Terminer, Tab loops inside the card. The Tab loop keeps focus in the card; the page is not made `inert`, because `inert` would also drop the spotlighted anchor from the accessibility tree. The click catcher has `aria-hidden="true"`.
- Buttons have visible text; no icon-only control in the card.
- Colour: card text `#37352f` on white; counter `#787774` on white is 4.6:1, above AA for 12px text.
- Reduced motion: `animate-pop` and `animate-sheet` are 120 to 200 ms; wrap them in `motion-safe:` so `prefers-reduced-motion` gets none.
- Touch targets: 44px buttons on phones through the `touch:` variant.

---

## 10. Acceptance checklist

Take the screenshots with the driver (`/tmp/pw/shot.mjs`), starting the tour by clicking "Démarrer la visite" in Settings, then pressing ArrowRight `n-1` times before each capture. Seeded workspace unless stated. Names: `tour-<n>-<width>.png`.

Desktop, 1366:

- [ ] `tour-1-1366.png` (`/semaine/2026-W42`): dim overlay, cut-out around "Signé 6 874 € · 279 conv. · … ›", card below it, 320px wide, counter "1 sur 10", title "Votre semaine", buttons Ignorer, Précédent (disabled), Suivant (blue). Card does not cover the stat line.
- [ ] `tour-2-1366.png`: cut-out around the whole checklist callout, callout open, card below, title "Ce qui manque pour la semaine".
- [ ] `tour-3-1366.png`: cut-out around "Lun 12 / 1 · 30 conv. · 0/1" only (the first column header, not the whole column), card below.
- [ ] `tour-4-1366.png` (lands on `/jour/2026-10-12`): cut-out around the tinted "Lun 12" head cell in the row of days, card below, title "Revenir à la semaine".
- [ ] `tour-5-1366.png` (lands on `/events/548b873d-…/lines/819f1739-…` or the Monday line): cut-out around "Ingrédients pour 30" and its rows; card to the right or below, never over the list. Chrome hidden, overlay still full screen.
- [ ] `tour-6-1366.png` (`/semaine/…`): cut-out around the "AM" chip of the first card (Hoona, Monday), card below.
- [ ] `tour-7-1366.png` (`/events`): cut-out around the toolbar and the table, card at the right of the table or centred when the table is taller than the viewport.
- [ ] `tour-8-1366.png` (`/offres`): cut-out around the Offres table (Buffet 1, Walking dinner 2), card below or at the right, title "Offres et devis".
- [ ] `tour-9-1366.png` (`/comptes/journal`): cut-out around the six tabs, card below, counter "9 sur 10".
- [ ] `tour-10-1366.png` (`/settings`): cut-out around "Général | Catalogue | Équipe | Finances | Société", the "Visite guidée" section visible under it, button reads "Terminer".
- [ ] `tour-done-1366.png`: after Terminer, no overlay, `/settings` shows "Visite guidée · Vue le 12 octobre 2026".
- [ ] Press Escape at step 4: overlay gone, page is `/jour/2026-10-12`, `localStorage["recipe-book:tour"].seenAt` set.
- [ ] ArrowLeft at step 5 returns to `/jour/…` and the tinted-day cut-out.

Phone, 375 (touch emulation):

- [ ] `tour-1-375.png`: card pinned to the bottom, rounded top, 44px buttons, cut-out around the stat line above.
- [ ] `tour-2-375.png`: checklist expanded (rows visible), fully above the card, title "Ce qui manque pour la semaine".
- [ ] `tour-3-375.png`: cut-out around "Lun 12 · 1 évén. · 30 conv. · 0/1 ›" (stacked header), title "Un jour par section".
- [ ] `tour-4-375.png`: cut-out around "‹ Semaine" in the top bar, body mentions the tap on the dot.
- [ ] `tour-5-375.png`: "Ingrédients pour 30" heading and at least three rows visible above the card.
- [ ] `tour-6-375.png`: cut-out around the "Semaine | Jour | Par personne" tabs.
- [ ] `tour-8-375.png`: cut-out around the Offres list, card pinned to the bottom.
- [ ] `tour-9-375.png`: the Comptabilité tabs scrolled so "Journal" is at the left edge; cut-out clipped to the viewport width.
- [ ] No horizontal scroll on any phone capture; every button in the card measures 44px.

Empty workspace (`APP=http://localhost:5174`):

- [ ] `empty-first-run-1366.png` (`/semaine`, fresh `localStorage`): the 👋 "Première visite ?" callout above "À faire avant la semaine", buttons "Faire la visite" (white) and "Plus tard" (grey text). "+ Nouveau" is still the only blue button.
- [ ] `empty-first-run-375.png`: same callout, buttons 44px.
- [ ] Click "Plus tard", reload: callout gone, key has `dismissedOffer: true`.
- [ ] `empty-tour-5-1366.png`: step 5 is a centred card, body starts with "Chaque recette au menu", route still `/jour/2026-10-12`.
- [ ] `empty-tour-6-1366.png`: step 6 centred, body starts with "Les personnes de Paramètres".
- [ ] `empty-tour-6-375.png`: step 6 anchored on "Semaine | Jour" (no Par personne tab), phone body.
- [ ] Steps 1, 2, 3, 7, 8, 9, 10 are anchored on the empty workspace (no centred card); step 8 spotlights the « Aucune offre type » empty state.

Global:

- [ ] `grep -rn "data-tour" apps/frontend/src` lists exactly the thirteen attributes of 4.6.
- [ ] No new entry in `package.json`.
- [ ] The tour never renders in `/recipes/:id/cook` (outside `AdminLayout`) and never on `/login`.
- [ ] Rules of 03-notion-ui.md hold on the card: white, one font, 14px body, 15px/600 title, `shadow-dialog`, radius 10px, one blue button.
