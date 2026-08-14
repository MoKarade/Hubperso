// lib/administration.ts — gérer les personnes et leurs accès, réservé au propriétaire.
//
// `lib/personnes.ts` répond « cette adresse a-t-elle accès à cette app ? ». Ce module
// répond à une question différente : « qui a accès à quoi, et comment le changer ? ».
//
// AUCUNE fonction ici ne revérifie qui appelle. La vérification vit à la porte —
// `exigerProprietaire()` (lib/gardeHub.ts) pour la page, et une revérification server-side
// dans chaque Server Action (app/administration/actions.ts), qui sont des points d'entrée
// POST à part entière et ne peuvent pas se fier au fait que le formulaire n'est affiché
// qu'au propriétaire. Le même principe que la page Commandes de CarAI : on vérifie à
// l'écriture, pas seulement à l'affichage.

import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { acces, personnes } from "./db/schema";
import { SOURCE_DEFS } from "./sources";
import { APP_HUB, normaliser } from "./personnes";

/** Une app qu'on peut accorder — le hub lui-même, plus chaque app du contrat. */
export interface AppDisponible {
  id: string;
  nom: string;
}

/**
 * Toutes les apps administrables. `APP_HUB` d'abord : c'est celle qui donne accès au
 * tableau de bord, la plus significative à accorder ou retirer.
 */
export const APPS_DISPONIBLES: readonly AppDisponible[] = [
  { id: APP_HUB, nom: "Hubperso (tableau de bord)" },
  ...SOURCE_DEFS.map((def) => ({ id: def.id, nom: def.name })),
];

const IDS_APPS_DISPONIBLES = new Set(APPS_DISPONIBLES.map((a) => a.id));

/** Une adresse minimalement plausible. Un refus clair vaut mieux qu'une ligne inutilisable. */
const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PersonneAvecAcces {
  email: string;
  nom: string | null;
  actif: boolean;
  creeLe: Date;
  /** Identifiants d'app (`APPS_DISPONIBLES[].id`) auxquels cette personne a accès. */
  appIds: string[];
}

/**
 * Toutes les personnes, chacune avec la liste des apps auxquelles elle a accès.
 *
 * Deux requêtes plutôt qu'une jointure : `personnes` sans aucun `acces` (quelqu'un ajouté
 * mais à qui rien n'a encore été accordé) doit quand même apparaître, et une jointure
 * interne l'aurait fait disparaître de la liste — invisible, donc jamais complété.
 */
export async function listerPersonnes(): Promise<PersonneAvecAcces[]> {
  const [lignesPersonnes, lignesAcces] = await Promise.all([
    db.select().from(personnes).orderBy(personnes.creeLe),
    db.select().from(acces),
  ]);

  const appsParEmail = new Map<string, string[]>();
  for (const ligne of lignesAcces) {
    const liste = appsParEmail.get(ligne.email);
    if (liste) liste.push(ligne.appId);
    else appsParEmail.set(ligne.email, [ligne.appId]);
  }

  return lignesPersonnes.map((p) => ({
    email: p.email,
    nom: p.nom,
    actif: p.actif,
    creeLe: p.creeLe,
    appIds: appsParEmail.get(p.email) ?? [],
  }));
}

/**
 * Ajoute une personne. Idempotent : ajouter une adresse déjà présente ne fait rien plutôt
 * que d'échouer — un double clic, ou ajouter quelqu'un qu'on a oublié avoir déjà ajouté,
 * ne doit pas être une erreur qui interrompt le formulaire.
 */
export async function ajouterPersonne(email: string, nom: string | null): Promise<void> {
  const adresse = normaliser(email);
  if (!FORME_EMAIL.test(adresse)) {
    throw new Error(`Adresse invalide : « ${email} ».`);
  }
  await db
    .insert(personnes)
    .values({ email: adresse, nom: nom?.trim() || null })
    .onConflictDoNothing();
}

/**
 * Retire une personne. La CASCADE du schéma (`acces.email` → `personnes.email` ON DELETE
 * CASCADE) emporte tous ses accès avec elle : pas d'appel séparé, pas d'accès orphelin
 * qu'aucune page n'afficherait et que personne ne penserait à retirer.
 */
export async function supprimerPersonne(email: string): Promise<void> {
  const adresse = normaliser(email);
  await db.delete(personnes).where(eq(personnes.email, adresse));
}

/**
 * Active ou désactive une personne SANS retirer ses accès.
 *
 * Différent de la suppression : une désactivation temporaire (départ prolongé, incident)
 * garde la liste de ce à quoi la personne avait droit, pour la réactiver telle quelle.
 * `aAcces` exige `actif = true` (lib/personnes.ts) — désactiver ferme l'entrée aussi
 * sûrement qu'une suppression, juste de façon réversible.
 */
export async function definirActif(email: string, actif: boolean): Promise<void> {
  const adresse = normaliser(email);
  await db.update(personnes).set({ actif }).where(eq(personnes.email, adresse));
}

function validerAppId(appId: string): void {
  if (!IDS_APPS_DISPONIBLES.has(appId)) {
    throw new Error(`App inconnue : « ${appId} ».`);
  }
}

/**
 * Accorde l'accès à une app. Idempotent, même raison que `ajouterPersonne`.
 *
 * La clé étrangère de `acces.email` exige que la personne existe déjà : accorder un accès
 * à une adresse jamais ajoutée échoue au niveau de la base plutôt que de créer une ligne
 * d'accès orpheline — l'échec est le comportement voulu, pas un cas à intercepter ici.
 */
export async function accorderAcces(email: string, appId: string): Promise<void> {
  validerAppId(appId);
  const adresse = normaliser(email);
  await db.insert(acces).values({ email: adresse, appId }).onConflictDoNothing();
}

/** Retire l'accès à une app précise, sans toucher aux autres ni à la personne elle-même. */
export async function retirerAcces(email: string, appId: string): Promise<void> {
  validerAppId(appId);
  const adresse = normaliser(email);
  await db.delete(acces).where(and(eq(acces.email, adresse), eq(acces.appId, appId)));
}
