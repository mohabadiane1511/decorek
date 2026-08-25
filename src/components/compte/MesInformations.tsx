import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Nom et téléphone de la cliente.
 *
 * L'adresse e-mail est montrée sans être modifiable : elle identifie le compte et
 * rattache les commandes passées avant l'inscription. La changer suppose de confirmer
 * la nouvelle, faute de quoi une faute de frappe fermerait l'accès au compte — c'est
 * un parcours à part entière, pas un champ de plus dans ce formulaire.
 */
export function MesInformations() {
  const { user, rafraichirSession } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async (evenement: React.FormEvent): Promise<void> => {
    evenement.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Indiquez votre nom.");
      return;
    }
    setEnvoi(true);
    try {
      await api.majProfil({ name: name.trim(), phone: phone.trim() });
      await rafraichirSession();
      toast.success("Informations enregistrées");
      setOuvert(false);
    } catch (erreur) {
      toast.error(erreur instanceof Error ? erreur.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="border border-border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg">{user?.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {user?.phone ? user.phone : "Aucun téléphone renseigné"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Les champs repartent de ce qui est enregistré : rouvrir après avoir
              // renoncé ne doit pas ressusciter une saisie abandonnée.
              setName(user?.name ?? "");
              setPhone(user?.phone ?? "");
              setOuvert(true);
            }}
            className="btn-square btn-outline shrink-0 border-border"
          >
            Modifier
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enregistrer} className="border border-border bg-background p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="profil-nom">Nom complet</Label>
          <Input
            id="profil-nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 rounded-none"
          />
        </div>
        <div>
          <Label htmlFor="profil-telephone">Téléphone</Label>
          <Input
            id="profil-telephone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 000 00 00"
            className="mt-1.5 rounded-none"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="profil-email">Adresse e-mail</Label>
          <Input
            id="profil-email"
            value={user?.email ?? ""}
            readOnly
            disabled
            className="mt-1.5 rounded-none"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Votre adresse identifie votre compte et relie vos commandes. Écrivez-nous pour la
            changer.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={envoi} className="btn-square btn-solid disabled:opacity-60">
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="btn-square btn-outline border-border"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
