import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type EntreeAdresse } from "@/lib/api";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Address } from "@/data/types";

/**
 * Carnet d'adresses de livraison.
 *
 * Enregistrer une adresse évite de la ressaisir à chaque commande — à Dakar, une
 * adresse est souvent une description (« villa 12, en face de la pharmacie »), longue
 * à retaper sur un téléphone.
 *
 * Les frais affichés viennent de la zone vivante, pas d'une copie : un tarif figé au
 * moment de l'enregistrement annoncerait un prix qui n'est plus celui facturé.
 */
export function MesAdresses() {
  const { regions } = useStore();
  const client = useQueryClient();
  const [edition, setEdition] = useState<Address | "nouvelle" | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["mes-adresses"],
    queryFn: ({ signal }) => api.adresses(signal),
  });
  const adresses = data ?? [];

  const supprimer = useMutation({
    mutationFn: (id: string) => api.supprimerAdresse(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["mes-adresses"] });
      toast.success("Adresse supprimée");
    },
    onError: (erreur: Error) => toast.error(erreur.message),
  });

  if (isError) {
    return (
      <div className="border border-border p-8 text-center">
        <p className="text-muted-foreground">Impossible de charger vos adresses.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="btn-square btn-outline mt-6 border-border"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (edition) {
    return (
      <FormulaireAdresse
        adresse={edition === "nouvelle" ? null : edition}
        premiere={adresses.length === 0}
        onFini={async () => {
          await client.invalidateQueries({ queryKey: ["mes-adresses"] });
          setEdition(null);
        }}
        onAnnuler={() => setEdition(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="h-32 animate-pulse border border-border bg-muted/40" />
      ) : adresses.length === 0 ? (
        <div className="border border-border p-8 text-center">
          <p>Aucune adresse enregistrée.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            En enregistrer une vous évitera de la ressaisir à chaque commande.
          </p>
        </div>
      ) : (
        adresses.map((a) => (
          <article key={a.id} className="border border-border bg-background p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.label}</span>
                  {a.isDefault && (
                    <span className="label-mono bg-foreground px-2 py-0.5 text-background">
                      Par défaut
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm">{a.fullName}</p>
                <p className="text-sm text-muted-foreground">{a.phone}</p>
                <p className="mt-2 text-sm text-muted-foreground">{a.address}</p>
                {a.areaName ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.areaName}, {a.regionName} — livraison {formatFcfa(a.fee ?? 0)}
                  </p>
                ) : (
                  // La zone a été retirée du catalogue de livraison : l'adresse reste
                  // lisible mais ne peut plus annoncer de tarif.
                  <p className="mt-1 text-sm text-orange-brand">
                    Zone de livraison à revoir — elle n'est plus desservie.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                <button type="button" onClick={() => setEdition(a)} className="underline">
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => supprimer.mutate(a.id)}
                  disabled={supprimer.isPending}
                  className="text-destructive underline disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </article>
        ))
      )}

      <button
        type="button"
        onClick={() => setEdition("nouvelle")}
        disabled={regions.length === 0}
        className="btn-square btn-solid disabled:opacity-60"
      >
        Ajouter une adresse
      </button>
    </div>
  );
}

function FormulaireAdresse({
  adresse,
  premiere,
  onFini,
  onAnnuler,
}: {
  adresse: Address | null;
  premiere: boolean;
  onFini: () => Promise<void>;
  onAnnuler: () => void;
}) {
  const { regions, user } = useStore();

  const [label, setLabel] = useState(adresse?.label ?? "Maison");
  const [fullName, setFullName] = useState(adresse?.fullName ?? user?.name ?? "");
  const [phone, setPhone] = useState(adresse?.phone ?? user?.phone ?? "");
  const [regionId, setRegionId] = useState(adresse?.regionId ?? regions[0]?.id ?? "");
  const [areaId, setAreaId] = useState(adresse?.areaId ?? "");
  const [texte, setTexte] = useState(adresse?.address ?? "");
  const [note, setNote] = useState(adresse?.note ?? "");
  const [parDefaut, setParDefaut] = useState(adresse?.isDefault ?? premiere);
  const [envoi, setEnvoi] = useState(false);

  const region = regions.find((r) => r.id === regionId) ?? regions[0];
  const zone = region?.areas.find((a) => a.id === areaId) ?? region?.areas[0];

  const enregistrer = async (evenement: React.FormEvent): Promise<void> => {
    evenement.preventDefault();
    if (!zone) {
      toast.error("Choisissez une zone de livraison.");
      return;
    }
    if (texte.trim().length < 5) {
      toast.error("Précisez l'adresse : rue, quartier, repère.");
      return;
    }

    const entree: EntreeAdresse = {
      label: label.trim() || "Adresse",
      fullName: fullName.trim(),
      phone: phone.trim(),
      areaId: zone.id,
      address: texte.trim(),
      note: note.trim(),
      isDefault: parDefaut,
    };

    setEnvoi(true);
    try {
      if (adresse) await api.majAdresse(adresse.id, entree);
      else await api.creerAdresse(entree);
      toast.success(adresse ? "Adresse modifiée" : "Adresse enregistrée");
      await onFini();
    } catch (erreur) {
      toast.error(erreur instanceof Error ? erreur.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={enregistrer} className="border border-border bg-background p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="adresse-libelle">Nom de l'adresse</Label>
          <Input
            id="adresse-libelle"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Maison, Bureau…"
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label htmlFor="adresse-destinataire">Destinataire</Label>
          <Input
            id="adresse-destinataire"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label htmlFor="adresse-telephone">Téléphone</Label>
          <Input
            id="adresse-telephone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 000 00 00"
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label htmlFor="adresse-region">Région</Label>
          <select
            id="adresse-region"
            value={region?.id ?? ""}
            onChange={(e) => {
              setRegionId(e.target.value);
              // La zone appartient à la région : la garder après un changement
              // désignerait un quartier d'ailleurs.
              setAreaId("");
            }}
            className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="adresse-zone">Quartier / ville</Label>
          <select
            id="adresse-zone"
            value={zone?.id ?? ""}
            onChange={(e) => setAreaId(e.target.value)}
            className="mt-1.5 h-9 w-full border border-input bg-background px-3 text-sm"
          >
            {region?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatFcfa(a.fee)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="adresse-texte">Adresse précise</Label>
          <Textarea
            id="adresse-texte"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={2}
            placeholder="Rue, villa, immeuble, repère connu…"
            className="mt-1.5 rounded-none"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="adresse-note">Indication pour la livraison (facultatif)</Label>
          <Input
            id="adresse-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Appeler en arrivant, portail bleu…"
            className="mt-1.5 rounded-none"
          />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={parDefaut}
          onChange={(e) => setParDefaut(e.target.checked)}
          disabled={premiere}
        />
        Utiliser cette adresse par défaut
      </label>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={envoi} className="btn-square btn-solid disabled:opacity-60">
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={onAnnuler} className="btn-square btn-outline border-border">
          Annuler
        </button>
      </div>
    </form>
  );
}
