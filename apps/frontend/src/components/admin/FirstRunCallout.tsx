import { Button, Callout } from "@/components/ui";
import { useTour } from "./TourProvider";

export interface FirstRunCalloutProps {
  // The week page hides it on a person's filtered view.
  hidden?: boolean;
}

// Offers the guided tour once; "Plus tard" or finishing the tour removes it for good.
export default function FirstRunCallout({ hidden = false }: FirstRunCalloutProps) {
  const tour = useTour();
  if (hidden || tour.active || tour.seenAt || tour.dismissedOffer) return null;
  return (
    <Callout emoji="👋" title="Première visite ?" className="mb-3">
      <p>La visite guidée montre en neuf étapes comment planifier la semaine, préparer le jour même et facturer.</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button variant="default" size="sm" onClick={tour.start}>Faire la visite</Button>
        <Button variant="subtle" size="sm" onClick={tour.dismissOffer}>Plus tard</Button>
      </div>
    </Callout>
  );
}
