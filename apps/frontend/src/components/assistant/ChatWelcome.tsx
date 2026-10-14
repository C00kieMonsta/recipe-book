import type { AssistantPageSelection } from "@/lib/assistant-context";
import { dayMonthShortLabel, parseYmd } from "@/lib/dates";

export const WELCOME_TEXT =
  "Posez une question, ajoutez une recette, modifiez un événement ou estimez un prix. Les modifications sont proposées, vous les confirmez.";

export const WELCOME_SUGGESTIONS = [
  "Ajouter une recette",
  "Modifier un événement de la semaine",
  "Estimer un prix : 50 convives menu X, 1 convive menu Y",
  "Qu'est-ce qui manque cette semaine ?",
];

export interface ChatWelcomeProps {
  selection: AssistantPageSelection;
  // Fills the composer; nothing is sent.
  onPick: (text: string) => void;
}

// The first chip follows the page's record; the other three stay.
export function welcomeSuggestions(selection: AssistantPageSelection): string[] {
  const first = contextSuggestion(selection);
  return first ? [first, ...WELCOME_SUGGESTIONS.slice(1)] : WELCOME_SUGGESTIONS;
}

function contextSuggestion(selection: AssistantPageSelection): string | null {
  // Labels read « Mariage Dupont · sam. 17 »; the name is the part before the dot.
  const name = selection.label?.split(" · ")[0]?.trim() || "";
  if (selection.eventId) return `Que reste-t-il à préparer pour ${name || "cet événement"} ?`;
  if (selection.date) {
    const monday = safeWeekday(selection.date) === 1;
    return monday ? "Que reste-t-il à préparer cette semaine ?" : `Que reste-t-il à préparer le ${safeDayLabel(selection.date)} ?`;
  }
  if (selection.recipeId) return `Que contient ${name ? `la recette ${name}` : "cette recette"} et combien coûte une portion ?`;
  if (selection.clientId) return `Quels sont les prochains événements de ${name || "ce client"} ?`;
  return null;
}

function safeWeekday(date: string): number | null {
  try {
    return parseYmd(date).getUTCDay();
  } catch {
    return null;
  }
}

function safeDayLabel(date: string): string {
  try {
    return dayMonthShortLabel(date).toLowerCase();
  } catch {
    return date;
  }
}

export default function ChatWelcome({ selection, onPick }: ChatWelcomeProps) {
  return (
    <div className="flex min-h-full flex-col justify-end gap-3">
      <p className="text-sm text-muted-foreground touch:text-base">{WELCOME_TEXT}</p>
      <div className="flex flex-wrap gap-1.5">
        {welcomeSuggestions(selection).map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="inline-flex min-h-7 items-center rounded-lg px-2.5 py-1 text-left text-sm shadow-outline hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring touch:min-h-11 touch:px-3 touch:text-base"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
