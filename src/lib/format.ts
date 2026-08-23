export function formatFcfa(value: number): string {
  return `${Math.round(value)
    .toLocaleString("fr-FR")
    .replace(/\u202f|\u00a0/g, " ")} FCFA`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
