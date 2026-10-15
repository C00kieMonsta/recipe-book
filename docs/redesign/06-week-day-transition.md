# 06. Week to day: one header, one row of days

Status: spec, nothing implemented. Applies after the tasks/print workflow (05) has landed in `Week.tsx`, `Day.tsx` and `PlanningBar.tsx`; it edits the same blocks.

Inputs: Dalia's three production screenshots (`/tmp/shots/prod/week.png`, `day-tue-empty.png`, `day-wed.png`), three designs and two judges. Both judges picked the "one page, two zoom levels" design; this spec is that design with the grafts they asked for.

---

## 1. Goal

Dalia, verbatim: « the transition from week to day is still not very clean i find ».

Two earlier rounds added ways back (the Semaine | Jour tabs, a breadcrumb, the phone top-bar back link). She still finds the switch unclean, so the problem is not the lack of a back control. It is that about ten things change at once above the content when she clicks a day, and all of them change back when she returns. The page reads as a different page, not as the same week with one column open.

What the three screenshots show, header area, week versus day. Pixel values are CSS px (the shots are 2x). Note that her three shots have three viewport widths (week 1291, Tuesday 1171, Wednesday 1267 CSS px): the week is just above the `xl` breakpoint (1280) and both days are just under it, so some of what she sees is the breakpoint flipping. The design below is identical on both sides of the breakpoint, so this stops mattering.

1. Breadcrumb. The week has none. The day adds a row « Semaine 42 / Mar 13 oct » above the title (`PageHeader` nav `h-6` + `mb-3`). Everything under it drops by about 40 px on entry and rises again on return: the title sits at y≈19 on the week and y≈61 on the day, the toolbar at y≈84 and y≈126.
2. Title text. « Semaine 42 » becomes « Mardi 13 octobre » then « Mercredi 14 octobre ». Same emoji and size, a different kind of noun (a number, then a date) and a different width every day.
3. Meta line. Week: « Signé 0 € HTVA · 9 convives · 0 lignes de préparation faites sur 1 · Définir l'objectif du mois › » (money, a blue link). Day: « 0 événements · 0 convives · 0 lignes · 0 faites » (counts, no link, another vocabulary). Same grey, different subject.
4. Tabs. Week: « Semaine | Jour · Aujourd'hui » (the `dayTabLabel` suffix at `lg+`). Day: « Semaine | Jour ». The tabs lose about 65 px, so the DateNav slides left by that much while the underline moves from the first tab to the second.
5. DateNav label. Week « Semaine 42 · 12 au 18 oct. ▾ » (about 200 px). Day « Mar. 13 oct. ▾ » (about 100 px). The › chevron moves left by about 135 px (suffix plus label). The day is spelled four ways on one screen: « Mar 13 oct » (crumb), « Mar. 13 oct. » (DateNav), « M 13 » (strip), « Mardi 13 octobre » (title).
6. « Aujourd'hui ». Absent on the week (current week) and on Tuesday (today), present on Wednesday. Between two neighbouring days it pops in after › and pushes the « Grouper » pill right by about 70 px.
7. « Grouper : Événement » pill. Day only, in the centre group right after the DateNav. Nothing sits there on the week, so the middle of the toolbar changes shape.
8. « Filtrer ». Day only in her data (the week hides it when no client and no person is configured). The right group goes from « ⋯ + Nouvel événement » to « Filtrer ⋯ + Nouvel événement ».
9. Callouts. The week shows the « Première visite ? » callout (about 80 px) and the « Ce qui manque pour la semaine 42 · 5 points » row (about 36 px) under the toolbar. The day shows neither. About 115 px of content vanish and come back.
10. The row of days. Week: seven left-aligned column heads « Lun 12 / aucun événement », « Mer 14 / 1 évén. · 9 conv. · 0/… » at 14/600 with a 12 px caption, in a `grid-cols-7 gap-2`. Day: the `DayStrip`, seven centred 44 px cells « L / 12 / count » with a blue tint on the open day. Same seven slots, different glyphs, alignment, height and information. Only the red circle on 13 survives.
11. Vertical position of that row. Week: the heads sit under the callouts at y≈264. Day: the strip sits right under the hairline at y≈148. Clicking « Mar 13 » lands on « M 13 » about 115 px higher, and the eye has to find it again.
12. Empty day. Week column: caption « aucun événement », then a left-aligned ghost « + Nouvel événement ». Day: a centred block « Aucune ligne à préparer ce jour. » with a centred blue link « + Nouvel événement », in a narrower `max-w-doc` column. Different words, alignment, control style and position.
13. Day with an event. Week card: « caitlin moens / 9 conv. · 1 ligne · 0 faites ». Day: a 20 px heading « caitlin moens » with « 9 convives » under it and « 1 ligne » pinned to the invisible right edge of `max-w-doc` (x≈860) while the strip above spans to x≈1240.
14. The way back. The Semaine tab, Escape and the breadcrumb all reverse items 1 to 12 at once. The « Jour » tab then points at today or Monday, not at the day she just left.
15. Phone. The top bar switches from « ☰ · Semaine 42 » to « ‹ Semaine 42 · Mardi 13 octobre » and the strip is already shared under the toolbar. The phone switch is the one that is already close to clean; item 2 and 3 are the only phone differences besides the top bar.

---

## 2. Principle

The day is the week with one column open. Nothing above the row of seven days changes between the two views: same title, same meta, same toolbar geometry, same callouts, same row of day heads at the same y. Clicking a day moves the tab underline, rewrites the tail of the date label, tints one head, and replaces the seven column bodies by one body. Coming back does the reverse and nothing else.

Concretely, between `/semaine/2026-W42` and `/jour/2026-10-13` on a laptop, the only pixels that may differ above the body are: the underline under « Semaine » or « Jour »; the text after « Semaine 42 · » in the DateNav; the enabled or disabled state of « Aujourd'hui »; the « Grouper : Événement ▾ » pill sliding in at the left of « Filtrer »; the blue tint on one head cell.

### Decisions on the judges' flags

- The day page shows the same callouts as the week, in the same state. The checklist is open by default (05 section 6.9), so a summary row on the day would collapse 150 px of rows into one and move the heads. The day renders the full `WeekChecklist` with the same items; three of its five actions (assign sheet, client week sheet, create groceries) navigate to the week and run there (section 5). The first-run callout shows on the day too, until she dismisses it; one click removes it from both views, and the alternative is a 80 px jump during her very first session.
- The day keeps its name: the body starts with a 20/600 heading « Mardi 13 octobre » and the day's own counts. To avoid two identical date strings one above the other, the DateNav on the day reads « Semaine 42 · Mar. 13 oct. » (short form, same prefix as the week) and only the body heading carries the long form.
- `DateNav` keeps today's behaviour everywhere except the planning bar: a new `todayAlways` prop keeps « Aujourd'hui » mounted and disabled. The five comptes pages do not pass it and do not change.
- The breadcrumb tour anchor is replaced by `day-open` on the tinted cell (heads at `xl`, strip under it). The step keeps its key `breadcrumb`. The phone step keeps the `back` anchor and the top-bar link.
- The phone top-bar back link stays. Its label becomes « Semaine » (was « Semaine 42 ») because the page title under it now reads « Semaine 42 » on the day too; the phone tour copy already says « ‹ Semaine ».
- The week stat-line copy is unchanged (05 section 6.2); the day reuses it through a shared component.
- With `?personne=` (staff share link) the day header shows the person meta, never the money line, and hides the first-run callout; the week with `?personne=` is unchanged (it shows the money line today; out of scope).
- The heads row is sticky on the week (it replaces the seven per-column sticky heads) and not sticky on the day, where the group headers are already sticky.
- Build order: after 05 lands, in two phases (section 8), so the toolbar fixes ship before the head extraction.

---

## 3. Shared header anatomy

Laptop (`xl`, 1366, sidebar collapsed), both views, top to bottom. Same DOM order, same classes, same heights.

```
 📅 Semaine 42                                                                            40/700, both views
 Signé 0 € HTVA · 9 convives · 0 lignes de préparation faites sur 1 · Définir l'objectif du mois ›    16 grey, both views
 [Semaine] [Jour] [Par personne]   ‹ Semaine 42 · 12 au 18 oct. ▾ ›  Aujourd'hui                 Filtrer ▾  ⋯  [+ Nouvel événement]   week
 [Semaine] [Jour] [Par personne]   ‹ Semaine 42 · Mar. 13 oct.  ▾ ›  Aujourd'hui   Grouper : Événement ▾   Filtrer ▾  ⋯  [+ Nouvel événement]   day
 ──────────────────────────────────────────────────────────────────────────────────────────── hairline
 ┌ 👋 Première visite ? …  [Faire la visite] Plus tard ┐                                   until dismissed, both views
 ┌ 📋 ▾ Ce qui manque pour la semaine 42 · 5 points ┐                                      same open/closed state, both views
 Lun 12          Mar (13)        Mer 14          Jeu 15      Ven 16    Sam 17    Dim 18     DayHeads, 14/600, both views
 aucun événement aucun événement 1 évén. · 9 c…  aucun …                                    12 grey caption; + reveals on hover
 ── week: seven column bodies in the same grid ───────────────────────────────────────────
 + Nouvel év.    + Nouvel év.    ┌ caitlin moens ┐ …
 ── day, Mar 13 tinted: one body, max-w-doc ─────────────────────────────────────────────
 Mardi 13 octobre                                                                           20/600
 0 événement · 0 convive · 0 préparation · 0 faites                                         14 grey
 Aucune préparation ce jour.                                                                14 grey
 + Nouvel événement                                                                         ghost, same as a column foot
```

| Element | Week view | Day view | Phone (both views) |
|---|---|---|---|
| Phone top bar | not shown on laptop | not shown on laptop | week « ☰ · Semaine 42 »; day « ‹ Semaine · Mardi 13 octobre · ☰ » (`useBackLink` label « Semaine », `useTopTitle` unchanged) |
| Breadcrumb | none | none (the `breadcrumb` prop is no longer passed) | none |
| Title | 📅 « Semaine 42 », `text-h1-lg` | 📅 « Semaine 42 » plus an `sr-only` « · Mardi 13 octobre » inside the `h1` | 📅 « Semaine 42 », `text-h1` (30/700) |
| Meta (16 grey) | `WeekMeta`: « Signé 0 € HTVA · 9 convives · 0 lignes de préparation faites sur 1 · Définir l'objectif du mois › », `data-tour="week-stats"` | the same `WeekMeta`; with `?personne=` « Kristoff · 3 préparations · 1 faite » instead | the same, with the short forms the week already has (« conv. », « 0/1 lignes faites », « Objectif … ») |
| View tabs | « Semaine », « Jour », « Par personne » (when people exist), underline on Semaine. No « · Aujourd'hui » suffix | same labels, underline on Jour (on Par personne with `?mode=personne`) | same, 44 px tabs |
| DateNav | ‹ « Semaine 42 · 12 au 18 oct. » ▾ › ; label `md:min-w-[15rem] justify-start` so ‹ and › sit at the same x in both views | ‹ « Semaine 42 · Mar. 13 oct. » ▾ › ; same slot | own row under the tabs; the « Semaine 42 · » prefix hidden under `md` as today |
| « Aujourd'hui » | always rendered after ›, `disabled` when the week contains today | always rendered, `disabled` when the day is today | same, same row as the DateNav |
| Right group (right-anchored) | « Filtrer ▾ » · ⋯ · « + Nouvel événement » | « Grouper : Événement ▾ » · « Filtrer ▾ » · ⋯ · « + Nouvel événement ». Grouper joins the right group, so ⋯ and the primary never move | ⋯ · + (icon); Grouper and the filters live in the ⋯ sheet, as today |
| Filtrer content | Client (when clients this week), Personne (when people), check « Masquer les lignes faites » (new, so the button always has content) | Personne, « Masquer les lignes faites » (as today) | in the ⋯ sheet |
| Filter chips row | when a filter is set | when a filter is set | same |
| Hairline | `Toolbar` `border-b` | same | same |
| Callouts (`data-tour="week-checklist"`, `mt-3`) | `FirstRunCallout` (hidden with `?personne=`), then `WeekChecklist` (open state from `recipe-book:checklist-open`) | identical: same components, same items, same open state | identical |
| Row of days | `DayHeads` (`mt-4`), seven cells « Lun 12 / caption / + », today's number in the red circle, past days `opacity-60`, no tint; `data-tour="week-day"` on the first cell's link | `DayHeads`, the open cell `bg-selected rounded`, `aria-current="page"`, `data-tour="day-open"`, never dimmed, its link goes back to the week (`title="Fermer le jour"`) | under `xl`: `DayStrip` (letters, numbers, counts, sticky) in both views, tinted on the day; its selected cell carries `data-tour="day-open"` |
| Under the row | the seven column bodies in the same `grid-cols-7 gap-2` | one body in `max-w-doc` starting with the day heading | stacked day sections (week) or the day body (day) |

---

## 4. Body

### 4.1 Week columns (xl)

> Superseded by `11-team-margin-reminders.md` (6.11): the column layout is gated on the `cols` screen (`COLS_QUERY` in `apps/frontend/src/lib/screens.ts`: 1280 px and up, or 1024 px landscape), not on `xl`. Every `xl:` below reads `cols:`, and the `window.innerWidth >= 1280` test reads `useMediaQuery(COLS_QUERY)`.

The seven column heads leave the columns and become the shared `DayHeads` row above (section 6). The grid keeps the column bodies only: `hidden grid-cols-[repeat(7,minmax(0,1fr))] gap-2 xl:grid print:hidden`, no `mt-4` (the heads row has `pb-1`). Each column root keeps `group min-w-0` and `opacity-60` for past days; the body `div.space-y-2.px-0.5.pb-2` keeps the drop-target classes and handlers from 05.

Column content in 05 section 6.2 order, unchanged: event cards, own-day lines, task rows, caption rows « 1 préparation le jeu. 8 », moved-in groups « pour sam. 17 · Mariage Dupont », then the foot « + Nouvel événement » and « + Tâche » (`TaskComposer` on pointer). The `assign` tour anchor on the first card is untouched.

Two visible consequences of the extraction, both gains: every column body starts at the same y (an « Équipe » chip row no longer pushes one column down), and the heads are one sticky row (`sticky top-0 z-20 bg-background`) instead of seven. The reveal « + » of a head now shows on hovering the head cell, not the whole column.

New on the week: `?masquer=faites` (Filtrer › « Masquer les lignes faites »). `lineRows` and `taskRows` skip items whose `prepStatus` is `done` in both layouts; chip « Lignes faites masquées »; carried to the day links and back.

### 4.2 Day view (xl)

Under `DayHeads`, one body `div.mt-3.max-w-doc`, left-aligned under the first columns. It starts with the day's own heading, which is where the big title's information moves:

```
Mardi 13 octobre                                  h2, text-h3 (20/600), print:text-h1
1 événement · 9 convives · 1 préparation · 0 faites   p, mt-1 text-sm text-muted-foreground tabular-nums
```

Text: `title` for the heading (`longDayLabel(safeDate)`, or « Kristoff · Mardi 13 octobre » with `?personne=`), the 05 section 6.3 `meta` string for the line under it. The `h1 hidden print:block` is deleted; the heading prints as the title.

Then the groups as in 05 section 6.3, with one change: the count sits next to the title instead of at the far edge. Group header row: `flex min-h-7 items-center gap-3`; `h3` (was `h2`, same `text-h3` class) with the title and the gray « pour sam. 17 » tag; then `span.shrink-0.text-sm.text-muted-foreground.tabular-nums` with « 1 ligne »; the « Partager » button and `GroupAssign` of the Par personne mode get `ml-auto`. First group `mt-6` (was `mt-4`), the others `mt-6` as today. Rows, « + Tâche », the composer, the ⋯ menu with « Imprimer la semaine… »: unchanged.

The open day is marked three times and consistently: « Jour » underlined, « Semaine 42 · Mar. 13 oct. » in the DateNav, the tinted head « Mar (13) ».

### 4.3 Empty day

No centred `EmptyState`. After the heading and the meta line (« 0 événement · 0 convive · 0 préparation · 0 faites », the 05 string as is):

```
Aucune préparation ce jour.          p, mt-4 text-sm text-muted-foreground touch:text-base
+ Nouvel événement                   Button ghost sm, icon Plus, as Link to newEventUrl, className "mt-1 justify-start text-muted-foreground"
+ Tâche                              the existing ghost, when the week has an event (05)
```

With `?personne=`: « Aucune préparation pour Kristoff ce jour. » then `Button variant="link" size="sm" as={Link} to={/jour/${safeDate}}` « Toutes les personnes », left-aligned, `mt-1`; the « Service » section as today. The « Tout est fait. » line (everything hidden by `masquer`) is unchanged.

An empty week column and an empty day now read the same words with the same ghost rows at the same left edge.

### 4.4 Stacked layout (below xl, week)

Unchanged. The `DayStrip` under the toolbar, then one section per day with the 44 px header « Lun 12 · aucun événement · + » (`data-tour="week-day"` on the first), cards, rows, moved-in groups, « + Nouvel événement », « + Tâche ». The callouts sit between the strip and the sections as today.

### 4.5 Phone (both views)

Top bar: week « ☰ · Semaine 42 »; day « ‹ Semaine · Mardi 13 octobre · ☰ ». Then, identical in both views: 📅 « Semaine 42 » 30/700, the meta line (short forms), the tabs, the DateNav row with « Aujourd'hui », the sticky `DayStrip` (tinted on the day), the callouts. Then the week's stacked sections or the day body starting with the heading « Mardi 13 octobre ». The strip is the same component in both views, so the phone switch changes the top bar, the tint and the body, nothing else. Swipe keeps changing the week on the week page and the day on the day page.

---

## 5. Navigation and URLs

Routes are unchanged: `/semaine/:isoWeek`, `/jour/:date`, `/jour/aujourdhui`, `/semaine/:isoWeek/imprimer`. Query: `?personne=`, `?mode=`, `?masquer=faites` (now on both pages), `?client=` (week only).

Entering a day:

- click a head cell's link (xl), a section title (stacked), a strip cell (below xl), or the « Jour » tab (today when it is in the week, else Monday, as today);
- the link goes to `/jour/<date>` plus the day query (`personne`, `masquer`) with `state.from` = the week URL and search, as today;
- nothing above the heads moves: the eye sees one head get a tint and seven columns become one.

Coming back:

- the « Semaine » tab, Escape, the phone « ‹ Semaine », or a click on the tinted head (`title="Fermer le jour"`). Target `state.from ?? /semaine/<week>` plus `personne` and `masquer`;
- the checklist actions that live on the week page also come back: see below.

Checklist on the day. `WeekChecklist` renders the same items (shared `weekSummary`). Row links (invoices, unpaid, no menu, no price, empty week) work as on the week with `from` = the day URL. The type `SelectPill` and « Terminer » run on the day (`patchEvent`, same code as the week). The three actions that need a sheet or a creation flow on the week navigate there:

```ts
// lib/week-summary.ts
export type ChecklistIntent =
  | { kind: "assign" }
  | { kind: "client_week"; clientId: string; guestCount: number }
  | { kind: "groceries"; eventIds: string[] };
export interface WeekLinkState { from?: string; openChecklist?: boolean; checklistIntent?: ChecklistIntent }
```

The day calls `navigate(weekUrl, { state: { openChecklist: true, checklistIntent } })`. `Week.tsx` opens the checklist when `state.openChecklist` is set, and once `loading` is false runs the intent exactly once (`setAssignOpen(true)`, `openClientSheet(clientId, guestCount)` or `createGrocery(weekEvents.filter(...))`), then replaces the history entry with `state: { from }` so a reload does not repeat it.

DateNav semantics: unchanged. ‹ › move one week on the week, one day on the day (state kept). « Aujourd'hui » goes to the current week or to today; it is disabled, not hidden, when already there. The picker is a week picker on the week and a date picker on the day.

Keyboard: unchanged. Week ← → previous/next week. Day ← → previous/next day, Escape back to the week. No new shortcut.

Scroll: react-router does not reset `window.scrollY`; with identical header heights the heads keep their y during both trips. No scroll handling.

Tour anchors:

- `week-day`: unchanged, on the first cell's link of `DayHeads` (the week route renders it) and on the first stacked section title. Step 3 resolves as before.
- `breadcrumb` (step 4, route `/jour/aujourdhui`): the planning pages no longer render a breadcrumb. The step keeps its key and route and anchors on `day-open`, carried by the tinted cell of `DayHeads` (xl) and of `DayStrip` (below xl); `findAnchor` picks the visible one. Both render from the URL dates before data arrives, so there is no loading race. Phone override: anchor `back` unchanged. New copy: title « Revenir à la semaine », body « Le jour ouvert est surligné dans la rangée des jours. L'onglet Semaine, Échap ou un clic sur ce jour ramènent à la semaine. Le rond devant chaque préparation est son statut : vide à faire, bleu en cours, vert fait. » (214 characters). Phone body unchanged.
- `week-stats`, `week-checklist`, `planning-tabs`, `assign`: unchanged. `PageHeader` keeps `data-tour="breadcrumb"` for the record pages.

---

## 6. Changes per file

All paths under `apps/frontend/src` unless stated. Copy is French with vouvoiement. Nothing from 05 is undone: tasks, moved-in groups, « + Tâche », the composer, drag and drop, « Imprimer la semaine… » and the print route stay as they are.

### 6.1 `components/ui/DateNav.tsx`

Two new props:

```ts
// Extra classes on the label button; the planning bar fixes its width so ‹ › do not move between views.
labelClassName?: string;
// Keep « Aujourd'hui » mounted and disabled on today instead of unmounting it.
todayAlways?: boolean;
```

Label button classes: `cn("inline-flex h-7 items-center gap-1 whitespace-nowrap rounded px-2 text-sm font-medium hover:bg-hover touch:h-11 touch:text-base", labelClassName)`.

Today button:

```tsx
{onToday && (todayAlways || !isToday) && (
  <Button variant="subtle" size="sm" onClick={onToday} disabled={todayAlways && isToday}>{todayLabel}</Button>
)}
```

Default behaviour (comptes pages) unchanged.

### 6.2 `components/admin/PlanningBar.tsx`

- Delete `dayTabLabel` and the `lg:inline` suffix: the tab reads « Jour » in both views.
- Delete the `after` prop and the centre wrapper; `center` is the `DateNav` alone, with `labelClassName="md:min-w-[15rem] justify-start"` and `todayAlways`.
- The strip wrapper gets ` xl:hidden` in both views (drop the `isWeek` condition): `DayHeads` takes over at `xl` on the day too.
- `data-tour="planning-tabs"` stays.

`md:min-w-[15rem]` (240 px) holds « Semaine 42 · 12 au 18 oct. » and « Semaine 42 · Mar. 13 oct. ». A month-crossing week (« Semaine 40 · 28 sept. au 4 oct. ») overflows the minimum by about 25 px and shifts › by that much on those four or five weeks a year; accepted.

### 6.3 `components/admin/DayStrip.tsx`

The selected cell adds `data-tour="day-open"`. Nothing else.

### 6.4 `components/admin/DayHeads.tsx` (new)

The seven column heads of `Week.tsx` (the `sticky top-0 z-10 bg-background pb-1` block inside each xl column: day name, red-circle number, caption, reveal « + », « Équipe » chips) extracted into one row.

```ts
export interface DayHeadsProps {
  // Seven dates of the displayed week, from the URL; the row renders before data arrives.
  dates: string[];
  // weekPlan(events, monday, people); absent while loading (captions blank, same height).
  plan?: WeekPlan;
  // monday <= today; decides whether the « 0/1 faites » fragment shows.
  started: boolean;
  today: string;
  // Day page: the open day.
  selected?: string;
  href: (date: string) => string;
  // Target of the selected cell (back to the week).
  closeHref?: string;
  state?: unknown;
  newEventHref: (date: string) => string;
  people: Person[];
  selectedPerson?: string;
  onPersonFilter?: (personId: string) => void;
  // Week: the row sticks under the top edge; day: it scrolls with the page.
  sticky?: boolean;
}
```

Markup, copied from the current column head so the two pages are pixel-identical:

```tsx
<div role="group" aria-label="Jours de la semaine"
     className={cn("grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 bg-background pb-1", sticky && "sticky top-0 z-20")}>
  {dates.map((date, i) => {
    const day = plan?.days[i];
    const isToday = date === today;
    const isSelected = date === selected;
    const past = date < today && !isSelected;
    const [dayName, dayNum] = dayLabel(date).split(" ");
    const dayPeople = plan?.peopleByDay[date] ?? [];
    return (
      <div key={date} data-tour={isSelected ? "day-open" : undefined}
           className={cn("group min-w-0 rounded", past && "opacity-60", isSelected && "bg-selected")}>
        <div className="flex items-start gap-1">
          <Link to={isSelected && closeHref ? closeHref : href(date)} state={state}
                title={isSelected ? "Fermer le jour" : day ? dayHeaderTitle(day, started) : undefined}
                aria-current={isSelected ? "page" : undefined}
                data-tour={i === 0 ? "week-day" : undefined}
                className="min-w-0 flex-1 rounded px-1 hover:bg-hover">
            <div className="flex h-7 items-center gap-1 text-sm font-semibold">
              <span>{dayName}</span>
              <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${isToday ? "bg-danger-solid text-white" : ""}`}>{dayNum}</span>
            </div>
            <div className="truncate text-caption text-muted-foreground">{day ? dayHeaderMeta(day, started) : " "}</div>
          </Link>
          <IconButton size="sm" as={Link} to={newEventHref(date)} aria-label={`Nouvel événement le ${longDayLabel(date)}`} className="reveal mt-1" icon={<Plus />} />
        </div>
        {dayPeople.length > 0 && ( /* the « Équipe » row exactly as in Week.tsx today, onClick → onPersonFilter?.(id) */ )}
      </div>
    );
  })}
</div>
```

The caption stays `truncate` in both views (the full text is in `title` and, on the day, in the body meta line); a wrapping caption would change the row height between views.

### 6.5 `components/admin/WeekMeta.tsx` (new)

The stat line JSX of `Week.tsx` (`<span className="tabular-nums" data-tour="week-stats">` with the `abbr` « Signé », the guests, `doneFragment`, the month link), moved verbatim. Props:

```ts
export interface WeekMetaProps {
  weekTotals: Pick<WeekPlan, "signedRevenue" | "guests" | "linesDone" | "linesTotal">;
  started: boolean;
  monthLink: { to: string; text: string; short: string };
  state?: unknown;
}
```

Copy unchanged (05 section 6.2): « lignes de préparation faites sur », « 0/1 lignes faites » on phones, « Objectif du mois … / … » or « Définir l'objectif du mois ».

### 6.6 `components/admin/PlanningFrame.tsx` (new)

The shared skeleton. It owns every wrapper and margin above the body so the two pages cannot drift.

```ts
export interface PlanningFrameProps {
  weekNo: number;
  // Screen-reader suffix of the title on the day: " · Mardi 13 octobre".
  titleSuffix?: string;
  meta: ReactNode;
  bar: ReactNode;        // <PlanningBar …/>
  error?: string | null;
  callouts?: ReactNode;  // FirstRunCallout + WeekChecklist
  heads?: ReactNode;     // <DayHeads …/>
  className?: string;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  children: ReactNode;
}
```

```tsx
<div className={cn("mx-auto max-w-wide", className)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
  <PageHeader iconKey="semaine" className="no-print" meta={meta}
              title={<>Semaine {weekNo}{titleSuffix && <span className="sr-only">{titleSuffix}</span>}</>} />
  {bar}
  {error && <p className="no-print mt-3 text-sm text-danger">{error}</p>}
  {callouts && <div className="no-print mt-3" data-tour="week-checklist">{callouts}</div>}
  {heads && <div className="no-print mt-4 hidden xl:block">{heads}</div>}
  {children}
</div>
```

### 6.7 `lib/week-summary.ts` (new)

Pure helper so both pages compute the same meta and the same checklist. Extracted from `Week.tsx` (`weekTotals`, `monthSigned`, `objective`, `checklist`, `coveringList`, `monthLink`).

```ts
export interface WeekSummaryInput {
  isoWeek: string; today: string;
  events: AppEvent[]; clients: Client[]; clientsConfigured: boolean; groceryLists: GroceryList[];
  entries: LedgerEntry[]; ledgerConfigured: boolean; people: Person[]; settings: AppSettings | null;
}
export interface WeekSummary {
  weekNo: number; dates: string[]; monday: string; year: string; ym: string; started: boolean;
  weekTotals: WeekPlan;                                  // weekPlan(events, monday), no filter
  monthLink: { to: string; text: string; short: string };
  checklist: ChecklistItem[];
  coveringList?: Pick<GroceryList, "listId" | "range">;
}
export function weekSummary(input: WeekSummaryInput): WeekSummary;
```

`year` and `ym` come from the Thursday, as `Week.tsx` does today. Also exports `ChecklistIntent` and `WeekLinkState` (section 5).

### 6.8 `lib/use-planning-data.ts`

Export the two caption helpers, moved verbatim from `Week.tsx` (`dayMeta`, `dayTitle`):

```ts
// « aucun événement » | « 1 évén. · 9 conv. » | « 1 évén. · 9 conv. · 0/1 faites »
export function dayHeaderMeta(d: WeekDay, started: boolean): string;
// « 1 événement · 9 convives · 0 lignes faites sur 1 »
export function dayHeaderTitle(d: WeekDay, started: boolean): string;
```

`Week.tsx` uses them for the stacked sections, `DayHeads` for the row.

### 6.9 `pages/admin/Week.tsx`

1. Data: replace the local `weekTotals`, `monthSigned`, `objective`, `checklist`, `coveringList` and `monthLink` by `const summary = useMemo(() => weekSummary({...}), [...])` and destructure the same names. Captions through `dayHeaderMeta` / `dayHeaderTitle`.
2. Layout: wrap the page in `PlanningFrame` (`weekNo`, `meta={<WeekMeta weekTotals started monthLink state />}`, `bar={<PlanningBar …/>}`, `error`, `callouts`, `heads`, touch handlers moved from the bar to the frame). The `PageHeader` call, the error line and the `div.no-print.mt-3[data-tour=week-checklist]` block move into the frame's slots unchanged.
3. `PlanningBar`: drop `dayTabLabel`. `dayHref` and `dayUrl` carry `masquer=faites` with `personne` (`dayQuery`). `right` always renders `FilterButton`.
4. Filtrer: add a check group « Masquer les lignes faites » writing `?masquer=faites`; `hideDone` from the search params; `lineRows` and `taskRows` skip `done` items when set; chip « Lignes faites masquées »; `filterCount` and `clearFilters` include it.
5. xl grid: delete the per-column head block (the `sticky top-0 z-10 bg-background pb-1` div with the Link, caption, « + » and « Équipe » row). The grid loses `mt-4`. Render instead `<DayHeads dates={dates} plan={loading ? undefined : plan} started={started} today={today} href={dayUrl} state={state} newEventHref={newEventUrl} people={people} selectedPerson={selectedPerson} onPersonFilter={(id) => setParam("personne", selectedPerson === id ? "" : id)} sticky />` in the frame's `heads` slot.
6. Checklist state: `const linkState = location.state as WeekLinkState | null`; an effect sets `checklistOpen` true when `linkState?.openChecklist`; another effect runs `linkState?.checklistIntent` once `loading` is false, guarded by a ref, then `navigate(location.pathname + location.search, { replace: true, state: { from: linkState?.from } })`.
7. Stacked layout, keyboard, `anchorDay`, the Jour tab target, the ⋯ menu, the print link, the tour anchors `week-day` (stacked) and `assign`: unchanged.

### 6.10 `pages/admin/Day.tsx`

1. Data: `const year = weekDates[3].slice(0, 4)`; `usePlanningData(year, { withLists: true })` (adds `clients`, `clientsConfigured`, `entries`, `ledgerConfigured`, `groceryLists` to the destructuring). `summary = weekSummary({ isoWeek: week, today, … })`; `plan = useMemo(() => weekPlan(events, weekDates[0], people), …)`; `started = weekDates[0] <= today`; `[checklistOpen, setChecklistOpen] = useLocalStorage("recipe-book:checklist-open", true)` (same key as the week); `prestationTypes` as in `Week.tsx`.
2. Header: `useBackLink({ to: weekUrl, label: "Semaine" })`; `useTopTitle(title)` unchanged. Replace `PageHeader` (breadcrumb, date title, counts) and the `h1 hidden print:block` by `PlanningFrame` with `weekNo={weekNumber}`, `titleSuffix={` · ${title}`}`, `meta={personne ? `${personName(people, personne)} · ${meta}` : <WeekMeta weekTotals={summary.weekTotals} started={started} monthLink={summary.monthLink} state={{ from: here }} />}`, `className="pb-24 print:max-w-none"`, the touch handlers.
3. `PlanningBar`: `dateLabel={<><span className="hidden md:inline">Semaine {weekNumber} · </span>{navLabel(safeDate)}</>}`; drop `after`; `right={<>{groupPill}<FilterButton …/>{moreMenu}{primary}</>}`. `isToday`, `onToday`, `pickValue`, `selected`, `stripHref`, `linkState`: unchanged.
4. `callouts`: `<FirstRunCallout hidden={Boolean(personne)} />` then `<WeekChecklist items={summary.checklist} firstRun={firstRun} open={checklistOpen} onToggle={() => setChecklistOpen((o) => !o)} from={here} monday={weekDates[0]} weekNo={weekNumber} prestationTypes={prestationTypes} coveringList={summary.coveringList} busy={busy} onSetType={setType} onCloseEvent={closeEvent} onAssign={() => toWeek({ kind: "assign" })} onCreateClientWeek={(clientId, guestCount) => toWeek({ kind: "client_week", clientId, guestCount })} onCreateGroceries={(eventIds) => toWeek({ kind: "groceries", eventIds })} />`, where `toWeek = (checklistIntent) => navigate(weekUrl, { state: { openChecklist: true, checklistIntent } })`, `setType` and `closeEvent` copied from `Week.tsx` (`patchEvent` plus `buildCostSnapshot` with the `recipeCostById` / `recipePortionsById` the page already has), `firstRun = !loading && recipes.length === 0 && events.length === 0 && activePeople.length === 0`.
5. `heads`: `<DayHeads dates={weekDates} plan={loading ? undefined : plan} started={started} today={today} selected={safeDate} href={dayUrl} closeHref={weekUrl} state={location.state} newEventHref={(d) => `/events/new?date=${d}&retour=${encodeURIComponent(here)}`} people={people} selectedPerson={personne} onPersonFilter={(id) => setParam("personne", personne === id ? null : id)} />`.
6. Body: `div.mt-3.max-w-doc`: the heading `h2.text-h3.print:text-h1` with `title`, the meta `p.mt-1.text-sm.text-muted-foreground.tabular-nums`, then « Chargement… », the empty states of section 4.3 (both `EmptyState` calls removed), « Tout est fait. », the groups with the count next to the title (section 4.2, `h2` → `h3`, first group `mt-6`), the Par personne list and « Service » section, « + Tâche ».
7. Keyboard, swipe, the ⋯ menu, `TaskDialog`, the confirm dialog, `share`, `finishEvents`, the `?done=` notice: unchanged.

### 6.11 `components/admin/tour-steps.ts`

Step with key `breadcrumb`: `anchor: "day-open"`, title « Revenir à la semaine », body as in section 5. `phone` override unchanged (`anchor: "back"`, same body).

### 6.12 `components/ui/PageHeader.tsx`, `Toolbar.tsx`, `ViewTabs.tsx`, `AdminSidebar.tsx`

No change. `PageHeader` keeps `breadcrumb` and its `data-tour` for the record pages; the day page stops passing it. The phone top bar renders whatever `useBackLink` gives it.

### 6.13 Docs

- `docs/redesign/03-notion-ui.md`: 4.2 and 4.3 (1366 and 375 diagrams and the « Removed » lines): no breadcrumb on Jour; title « Semaine 42 » in both views; DateNav « Semaine 42 · Sam. 17 oct. » with a permanent « Aujourd'hui »; Grouper in the right group; the row of day heads shared by both views at `xl`; the day heading and the left-aligned empty state in the body. Section 3.3 `PlanningBar`: strip hidden at `xl` on both pages; add `DayHeads`, `PlanningFrame`, `WeekMeta`.
- `docs/redesign/04-first-run-and-tour.md`: section 3 row 4 (anchor `day-open`, element « the tinted cell of `DayHeads` or `DayStrip` », new body, character range « 118 to 214 »); section 4.6 table adds `day-open` (`DayHeads.tsx` and `DayStrip.tsx`, the selected cell) and the global check becomes twelve attributes; section 10: `tour-4-1366.png` expects the cut-out around the tinted « Lun 12 » head, « ArrowLeft at step 5 returns to `/jour/…` and the tinted-day cut-out ».
- `docs/redesign/05-week-tasks-print.md` 6.3: empty states become the caption plus ghost rows of section 4.3; the group heading carries the count next to the title.
- `docs/redesign/02-planning-iteration.md` rows mentioning the day breadcrumb (« Day | breadcrumb `Semaine 43` »): the way back is the Semaine tab, Escape, the tinted head and the phone « ‹ Semaine ».

---

## 7. Acceptance screenshots

Driver: `/tmp/pw/shot.mjs`, seeded local stack, output `/tmp/shots/06/`. Laptop shots at 1366 with the sidebar collapsed (her three shots straddle the 1280 breakpoint; take every laptop pair at one width). Phone at 375 with touch emulation. Week 2026-W42, today 2026-10-13.

Before/after pairs against `/tmp/shots/prod`:

| Before | After | Route | Must be visible |
|---|---|---|---|
| `prod/week.png` | `06/week-1366.png` | `/semaine/2026-W42` | « Semaine 42 » title; tabs « Semaine » and « Jour » with no suffix; « ‹ Semaine 42 · 12 au 18 oct. ▾ › Aujourd'hui » with « Aujourd'hui » greyed; right group « Filtrer ▾ ⋯ + Nouvel événement »; both callouts; the seven heads « Lun 12 / aucun événement », « Mar (13) », « Mer 14 / 1 évén. · 9 conv. · 0/… »; the caitlin moens card under Mer 14 |
| `prod/day-tue-empty.png` | `06/day-tue-1366.png` | `/jour/2026-10-13` | no breadcrumb; title « Semaine 42 » at the same y as the week shot; same meta line; « Jour » underlined; « ‹ Semaine 42 · Mar. 13 oct. ▾ › Aujourd'hui » greyed, ‹ and › at the same x as the week; « Grouper : Événement ▾ Filtrer ▾ ⋯ + Nouvel événement »; the same two callouts; the heads row at the same y with « Mar (13) » tinted; body « Mardi 13 octobre », « 0 événement · 0 convive · 0 préparation · 0 faites », « Aucune préparation ce jour. », ghost « + Nouvel événement », ghost « + Tâche » |
| `prod/day-wed.png` | `06/day-wed-1366.png` | `/jour/2026-10-14` | « Aujourd'hui » enabled at the same x as on Tuesday; « Grouper » at the same x; « Mer 14 » tinted; body « Mercredi 14 octobre », « 1 événement · 9 convives · 1 préparation · 0 faites », group « caitlin moens  1 ligne » with the count next to the name, the « À faire » row |

Geometry check on the three « after » shots: crop each to the band above the heads row and diff them (`compare` from ImageMagick, or a pixel diff). The only differing regions allowed: the tab underline, the DateNav text after « Semaine 42 · », the « Aujourd'hui » opacity, the Grouper pill, the tinted cell. The y of the title baseline, the hairline and the heads row must be equal in the three shots.

More laptop shots:

- `06/week-open-1366.png` and `06/day-open-1366.png`: checklist open (`localStorage["recipe-book:checklist-open"] = true`), same routes as above. The heads row sits at the same y in both; the week columns and the day heading start right under it.
- `06/week-sidebar-1366.png`: sidebar open, a person configured so « Par personne » shows: the toolbar stays on one row (no wrap of the right group).
- `06/week-w40-1366.png` (`/semaine/2026-W40`): « Semaine 40 · 28 sept. au 4 oct. » readable, not truncated.
- `06/day-personne-1366.png` (`/jour/2026-10-14?personne=<Kristoff id>`): meta « Kristoff · … préparation(s) · … faite(s) », no « Signé », no first-run callout, body heading « Kristoff · Mercredi 14 octobre », filter chip « Kristoff ».
- `06/day-masquer-1366.png` (`/semaine/2026-W42?masquer=faites` then click « Mer 14 »): the chip « Lignes faites masquées » is present on both pages; the day URL carries `?masquer=faites`.
- `06/day-checklist-assign-1366.png`: on `/jour/2026-10-14` click « Choisir qui fait quoi » in the checklist: the page is `/semaine/2026-W42` with the checklist open and the `AssignSheet` open; reload: the sheet does not reopen.
- `06/day-print-1366.pdf` (`page.pdf()` on `/jour/2026-10-14`): one title « Mercredi 14 octobre », no « Semaine 42 », no toolbar, no heads, the rows as today.
- `06/tour-4-1366.png` (tour, ArrowRight three times from Settings): cut-out around the tinted « Lun 12 » head cell on `/jour/2026-10-12`, card title « Revenir à la semaine ».
- `06/apercu-1366.png` (`/comptes/apercu`): the year DateNav unchanged (« Cette année » hidden on the current year).

Phone, 375:

- `06/week-375.png` (`/semaine/2026-W42`): « ☰ · Semaine 42 » top bar, title « Semaine 42 », tabs, DateNav row with « Aujourd'hui » greyed, strip, callouts, sections.
- `06/day-375.png` (`/jour/2026-10-13`): top bar « ‹ Semaine · Mardi 13 octobre · ☰ », title « Semaine 42 » at the same y as the week shot, strip with « M 13 » tinted, the same callouts, body « Mardi 13 octobre » then « Aucune préparation ce jour. » and the ghost rows.
- `06/tour-4-375.png`: cut-out around « ‹ Semaine » in the top bar, phone body unchanged.
- No horizontal scroll on either capture.

Round trip: on `/semaine/2026-W42` at 1366 scroll to 200 px, click « Mer 14 », press Escape: `window.scrollY` is 200 before and after, and the heads row is at the same screen y in both states.

Tests and checks: `tsc -b` passes; `pnpm --filter @apps/frontend lint:type-scale` passes; `grep -rn "data-tour" apps/frontend/src` lists the twelve attributes of 04 section 4.6 plus `day-open`; the tour runs through its nine steps at 1366 and 375 without a centred card at step 4.

---

## 8. Build order and risks

Phase A, small and additive, no grid edit: 6.1 `DateNav`, 6.2 `PlanningBar`, 6.3 `DayStrip`, 6.11 tour copy, and in `Day.tsx` only: drop the breadcrumb, the DateNav label with the week prefix, Grouper into `right`, the left-aligned empty states, the count next to the group title. In `Week.tsx` only: drop `dayTabLabel`, render Filtrer always with « Masquer les lignes faites ». Ship, screenshot the three pairs.

Phase B: 6.4 to 6.10, the shared frame, meta, summary, heads and the day's callouts. Ship, rerun section 7 in full.

Risks:

- `Week.tsx`, `Day.tsx` and `PlanningBar.tsx` are mid-edit by the 05 workflow. Start Phase A only once 05 is committed; Phase B rewrites the xl head block that 05 touches.
- The day page now loads the ledger year and the grocery lists (two requests; events, recipes, settings and clients come from the 30 s api cache when she arrives from the week). On the staff share link the checklist is shown as on the week; its money rows (unpaid invoices) are visible to staff on both pages today, out of scope here.
- The big date title leaves the day. The day is named in the DateNav, the tinted head, the body heading and the phone top bar. If she misses it, the fallback is to raise the body heading, not to bring the breadcrumb back.
- The toolbar at 1366 with the sidebar open and « Par personne » present has about 20 px of slack on the day view; check before merging. If it wraps, drop the `md:min-w` to `[14rem]` and accept a 16 px shift of › on the day.
- With `?client=` on the week the heads captions are filtered; the day page has no client filter, so its captions are not. Minor and visible only with that filter.
- The `week-day` link and the `day-open` cell are on the same element only when Monday is the open day; the attributes sit on the inner link and the outer cell, so both resolve.
- I did not check the `DayHeads` row against the drag-and-drop drop targets of 05 (the column bodies keep the handlers; the heads carry none) and did not run the print CSS after the extraction; both are in section 7.
