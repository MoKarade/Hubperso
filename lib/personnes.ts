// lib/personnes.ts — la seule question que cette base sait répondre.
//
// « Cette adresse a-t-elle accès à cette app ? »
//
// ── LE PROPRIÉTAIRE NE PEUT PAS ÊTRE ENFERMÉ DEHORS ─────────────────────────────────
//
// `AUTHORIZED_EMAIL` NE disparaît pas avec l'arrivée de la base. Il change de rôle : il
// désigne le PROPRIÉTAIRE, qui a accès à tout, toujours, sans passer par la base.
//
// C'est ce qui rend le reste sûr. Sans lui, trois situations enfermeraient Marc dehors —
// et dehors de la page d'administration, donc sans moyen de se réparer :
//
//   1. la table est vide (premier déploiement : personne n'a accès, personne ne peut
//      ajouter personne) ;
//   2. `DATABASE_URL` est absent ou la base injoignable ;
//   3. une ligne a été supprimée par erreur.
//
// Une porte de service qui n'existe que pour son propriétaire, et qui ne dépend d'aucune
// infrastructure, vaut mieux qu'une procédure de secours qu'on découvre le jour où on en a
// besoin.
//
// ── ÉCHEC FERMÉ POUR TOUS LES AUTRES ────────────────────────────────────────────────
//
// Base injoignable ⇒ personne d'autre n'entre. Le hub devient un point de panne unique,
// c'est écrit noir sur blanc dans l'ADR 0001 et assumé : mieux vaut une app qui refuse que
// six qui s'ouvrent parce qu'une requête a échoué.

import { and, eq } from "drizzle-orm";
import { db, baseConfiguree } from "./db";
import { acces, personnes } from "./db/schema";
import { isAuthorizedEmail } from "./authorized";

/** L'app elle-même, qui n'est pas dans `lib/sources.ts` puisqu'elle ne s'interroge pas. */
export const APP_HUB = "hubperso";

/**
 * Normalise une adresse pour la comparer ou la stocker.
 *
 * Casse et espaces ne distinguent pas deux adresses. Deux lignes qui ne différeraient que
 * par la casse seraient deux personnes pour la base et une seule pour Google — l'écart
 * exact où une révocation ne révoque rien.
 */
export function normaliser(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Le propriétaire a tout, toujours, sans base. Voir l'en-tête.
 *
 * `Partial<ProcessEnv>` et non `ProcessEnv` : ce dernier exige `NODE_ENV` (typage Next),
 * ce qui obligerait chaque test à fabriquer un faux environnement complet pour vérifier
 * une seule variable. Même choix que `lib/autorisation.ts` de JobAI.
 */
export function estProprietaire(
  email: string | null | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return isAuthorizedEmail(email, env.AUTHORIZED_EMAIL);
}

/**
 * Cette adresse a-t-elle accès à cette app ?
 *
 * ÉCHEC FERMÉ pour tout le monde sauf le propriétaire : une adresse vide, une base
 * absente, une requête en erreur — tout cela répond `false`. L'erreur est journalisée et
 * jamais avalée en silence, mais elle ne devient pas une autorisation.
 */
export async function aAcces(
  email: string | null | undefined,
  appId: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<boolean> {
  const adresse = normaliser(email);
  if (!adresse || !appId) return false;

  if (estProprietaire(adresse, env)) return true;
  if (!baseConfiguree(env)) return false;

  try {
    const lignes = await db
      .select({ email: acces.email })
      .from(acces)
      .innerJoin(personnes, eq(personnes.email, acces.email))
      .where(
        and(
          eq(acces.email, adresse),
          eq(acces.appId, appId),
          eq(personnes.actif, true),
        ),
      )
      .limit(1);
    return lignes.length > 0;
  } catch (erreur) {
    // Journalisée, jamais avalée — mais une base en panne n'ouvre aucune porte.
    console.error("[acces] lecture impossible :", erreur);
    return false;
  }
}

/** Durée de vie d'une réponse POSITIVE mémorisée. Une révocation mord en moins d'une minute. */
export const CACHE_CONNEXION_MS = 60_000;

/**
 * Adresses dont on sait qu'elles peuvent se connecter, et jusqu'à quand.
 *
 * ⚠️ POSITIFS SEULEMENT, et c'est une décision. Mémoriser un refus ferait attendre jusqu'à
 * une minute à quelqu'un qu'on vient d'ajouter — précisément le moment où l'on regarde si
 * ça marche. Mémoriser un accord fait durer un accès retiré au plus une minute : c'est le
 * délai déjà annoncé pour les révocations (docs/ACCES-PAR-APP.md).
 *
 * Portée réelle : la mémoire du PROCESS. Sur Vercel, plusieurs instances, chacune la sienne
 * — le délai reste borné à une minute par instance, pas cumulé.
 */
const cacheConnexion = new Map<string, number>();

/** Pour les tests, et pour rendre le cache observable plutôt que magique. */
export function viderCacheConnexion(): void {
  cacheConnexion.clear();
}

/**
 * Cette adresse peut-elle OBTENIR UNE SESSION ?
 *
 * À ne pas confondre avec `aAcces` :
 *   - `peutSeConnecter` = « as-tu le droit d'entrer quelque part dans le hub ? » ;
 *   - `aAcces(email, appId)` = « as-tu le droit d'entrer ICI ? ».
 *
 * La distinction existe parce que la connexion est UNIQUE (le hub est la porte d'entrée de
 * toutes les apps) alors que les accès sont PAR APP. Quelqu'un invité sur BatchChef doit
 * pouvoir se connecter au hub — sinon il ne peut pas atteindre BatchChef — sans pour autant
 * voir le tableau de bord, qui affiche les données des cinq apps. C'est `aAcces(email,
 * APP_HUB)` qui garde ce tableau de bord, pas cette fonction.
 *
 * Une personne sans AUCUN accès ne peut pas se connecter : une session qui n'ouvre rien
 * n'aurait aucune utilité, et vaut mieux ne pas exister.
 */
export async function peutSeConnecter(
  email: string | null | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  maintenantMs: number = Date.now(),
  // Dernier paramètre injectable : c'est la SEULE partie qui touche la base. L'extraire
  // rend la logique de cache — celle où se joue le délai d'une révocation — vérifiable
  // pour de vrai, sans mocker un module ni brancher une base distante.
  lireAuMoinsUnAcces: (adresse: string) => Promise<boolean> = lireAccesEnBase,
): Promise<boolean> {
  const adresse = normaliser(email);
  if (!adresse) return false;

  if (estProprietaire(adresse, env)) return true;
  if (!baseConfiguree(env)) return false;

  const expiration = cacheConnexion.get(adresse);
  if (expiration !== undefined && expiration > maintenantMs) return true;

  try {
    if (!(await lireAuMoinsUnAcces(adresse))) {
      // Un accès retiré doit disparaître du cache tout de suite, sinon l'entrée mémorisée
      // survivrait à la révocation qu'on vient justement de constater.
      cacheConnexion.delete(adresse);
      return false;
    }
    cacheConnexion.set(adresse, maintenantMs + CACHE_CONNEXION_MS);
    return true;
  } catch (erreur) {
    console.error("[connexion] lecture impossible :", erreur);
    return false;
  }
}

/** A-t-elle au moins un accès, quelle que soit l'app ? (la seule requête de la fonction ci-dessus) */
async function lireAccesEnBase(adresse: string): Promise<boolean> {
  const lignes = await db
    .select({ email: acces.email })
    .from(acces)
    .innerJoin(personnes, eq(personnes.email, acces.email))
    .where(and(eq(acces.email, adresse), eq(personnes.actif, true)))
    .limit(1);
  return lignes.length > 0;
}
