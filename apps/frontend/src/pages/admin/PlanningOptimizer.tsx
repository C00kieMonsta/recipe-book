import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProductionSchedule, ScheduleOptions } from "@packages/types";
import { addDays } from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";

export default function PlanningOptimizer() {
  const [options, setOptions] = useState<ScheduleOptions>({
    from: todayIso(),
    to: addDays(todayIso(), 6),
    start: "08:00",
    end: "18:00",
    workers: 1,
    ovens: 1,
    stoves: 2,
  });
  const [plan, setPlan] = useState<
    (ProductionSchedule & { fingerprint: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const change = (patch: Partial<ScheduleOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
    setPlan(null);
    setMessage("");
  };
  const calculate = async () => {
    setBusy(true);
    setMessage("");
    try {
      setPlan(await api.planning.preview(options));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calcul impossible.");
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const response = await api.planning.apply(options, plan.fingerprint);
      setMessage(
        `${response.results.filter((r) => r.ok).length} événement(s) mis à jour. ${response.results
          .filter((r) => !r.ok)
          .map((r) => r.error)
          .join(" ")}`,
      );
      setPlan(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Application impossible.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Optimiser les préparations" iconKey="semaine" />
      <p>
        Le calcul utilise les durées, le matériel et les dépendances saisis dans
        les recettes. Les dates choisies dans le planning sont conservées. Les
        cuissons indépendantes sont placées en premier.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["from", "Du", "date"],
            ["to", "Au", "date"],
            ["start", "Début", "time"],
            ["end", "Fin", "time"],
          ] as const
        ).map(([key, label, type]) => (
          <label className="text-sm" key={key}>
            {label}
            <input
              className="input-field"
              type={type}
              value={options[key]}
              onChange={(e) => change({ [key]: e.target.value })}
            />
          </label>
        ))}
        {(
          [
            ["workers", "Personnes disponibles"],
            ["ovens", "Places au four"],
            ["stoves", "Feux disponibles"],
          ] as const
        ).map(([key, label]) => (
          <label className="text-sm" key={key}>
            {label}
            <input
              className="input-field"
              type="number"
              min={key === "workers" ? 1 : 0}
              max="20"
              value={options[key]}
              onChange={(e) => change({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <Button onClick={calculate} disabled={busy}>
        Calculer une proposition
      </Button>
      {message && (
        <p role="status" className="rounded border border-border p-3">
          {message}
        </p>
      )}
      {plan && (
        <>
          <p className="text-sm text-muted-foreground">{plan.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Jour</th>
                  <th>Horaire</th>
                  <th>Préparation</th>
                  <th>Matériel</th>
                </tr>
              </thead>
              <tbody>
                {plan.slots.map((slot) => (
                  <tr
                    className="border-b border-border"
                    key={`${slot.eventId}:${slot.taskId}`}
                  >
                    <td className="p-2">{slot.date}</td>
                    <td className="p-2 whitespace-nowrap">
                      {slot.start} à {slot.end}
                    </td>
                    <td className="p-2">
                      <Link
                        className="underline"
                        to={`/events/${slot.eventId}`}
                      >
                        {slot.label}
                      </Link>
                    </td>
                    <td className="p-2">
                      {
                        {
                          bench: "Plan de travail",
                          oven: "Four",
                          stove: "Feu",
                        }[slot.resource]
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.issues.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">
                À compléter ({plan.issues.length})
              </h2>
              {plan.issues.map((issue) => (
                <p key={`${issue.eventId}:${issue.taskId}`} className="text-sm">
                  <Link
                    className="underline"
                    to={
                      issue.recipeId
                        ? `/recipes/${issue.recipeId}/edit`
                        : `/events/${issue.eventId}`
                    }
                  >
                    {issue.label}
                  </Link>{" "}
                  : {issue.reason}
                </p>
              ))}
            </div>
          )}
          <Button disabled={busy || !plan.slots.length} onClick={apply}>
            Appliquer les horaires proposés
          </Button>
        </>
      )}
    </div>
  );
}
