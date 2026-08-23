import type { OrderStatus } from "@/data/types";
import { statusLabels, statusOrder } from "@/lib/store";

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "annulee" || status === "non_honoree") {
    return (
      <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Commande {statusLabels[status].toLowerCase()}. Contactez-nous sur WhatsApp pour la relancer.
      </p>
    );
  }
  const currentIndex = statusOrder.indexOf(status);

  return (
    <ol className="grid gap-3 sm:grid-cols-5">
      {statusOrder.map((s, i) => {
        const done = i <= currentIndex;
        return (
          <li key={s} className="flex items-center gap-2 sm:block">
            <span
              className={`block h-0.5 w-full min-w-8 ${done ? "bg-foreground" : "bg-border"}`}
            />
            <span
              className={`mt-2 block text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}
            >
              {statusLabels[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
