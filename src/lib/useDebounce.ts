import { useEffect, useState } from "react";

/**
 * Retarde la propagation d'une valeur qui change vite.
 *
 * Sans cela, chaque frappe dans la recherche et chaque pixel du curseur de prix
 * déclencheraient une requête. Sur une connexion mobile sénégalaise, cela veut dire
 * des dizaines d'appels inutiles pour une seule intention de l'utilisateur.
 */
export function useDebounce<T>(valeur: T, delaiMs = 300): T {
  const [retardee, setRetardee] = useState(valeur);

  useEffect(() => {
    const minuteur = setTimeout(() => setRetardee(valeur), delaiMs);
    return () => clearTimeout(minuteur);
  }, [valeur, delaiMs]);

  return retardee;
}
