/**
 * Images fixes du site, à part des routes.
 *
 * TanStack Start extrait `head()` dans un module distinct du composant. Une constante
 * déclarée dans le fichier de route et utilisée des deux côtés n'y survit pas : le
 * module extrait tente de l'importer, ne la trouve pas, et l'hydratation échoue — la
 * page s'affiche mais ne répond plus.
 */
export const IMAGE_ACCUEIL = "/images/hero-napkin.jpg";
