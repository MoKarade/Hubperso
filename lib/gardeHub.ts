// lib/gardeHub.ts — la garde des pages du hub lui-même.
//
// Le hub est une app comme les autres dans le modèle d'accès : son identifiant est
// `APP_HUB` ("hubperso"). Être connecté ne suffit donc PAS pour voir son tableau de bord.
//
// ── POURQUOI CETTE DISTINCTION EST LE CŒUR DU SUJET ─────────────────────────────────
//
// La connexion est unique : quelqu'un invité sur BatchChef DOIT pouvoir se connecter au
// hub, sinon il ne peut pas atteindre BatchChef (c'est la porte d'entrée). Mais le tableau
// de bord du hub affiche les données des CINQ apps — le laisser entrer là parce qu'il a une
// session reviendrait à lui ouvrir tout ce qu'on voulait précisément cloisonner.
//
// D'où deux questions distinctes :
//   - `peutSeConnecter`  → obtenir une session (au moins un accès quelque part) ;
//   - `aAcces(…, APP_HUB)` → voir les pages du hub.
//
// ── POURQUOI UNE FONCTION PLUTÔT QU'UNE VÉRIFICATION DANS CHAQUE PAGE ───────────────
//
// Parce qu'on oublie. `tests/gardePages.test.ts` énumère les pages de `app/` et exige que
// chacune passe par ici : une page ajoutée sans garde fait tomber le test au lieu de
// s'afficher pour qui n'y a pas droit. Le même principe que le test qui vérifie que
// `.env.example` documente chaque jeton — le code marchait, seul le fichier mentait.

import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { APP_HUB, aAcces, estProprietaire } from "./personnes";
import { assurerMigrations } from "./migrations";

/**
 * Exige une session ET l'accès au hub. Ne rend la main que si les deux sont acquis ;
 * sinon, redirige (donc ne retourne jamais).
 *
 * Sans session → `/login`. Session valide mais pas d'accès au hub → `/sans-acces`, qui
 * explique honnêtement la situation au lieu de renvoyer sur un login qui réussirait
 * aussitôt pour aboutir au même refus — une boucle qui ressemblerait à une panne.
 */
export async function exigerAccesHub(): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/login");

  // Sans DATABASE_URL, cet appel ne fait rien ; avec, il garantit que les tables existent
  // avant la première lecture, sans commande à lancer.
  await assurerMigrations();

  if (!(await aAcces(session.user?.email, APP_HUB))) redirect("/sans-acces");
  return session;
}

/**
 * Exige le PROPRIÉTAIRE, rien de moins — pour la page d'administration.
 *
 * Voir l'accès au hub n'est PAS voir la liste des personnes qui y ont accès : une
 * personne invitée sur BatchChef a le droit d'entrer dans le hub une fois qu'on lui a
 * accordé `aAcces(…, APP_HUB)`, mais ça ne lui donne aucune raison de pouvoir SE
 * l'accorder à elle-même, ni à quiconque, sur n'importe quelle app. L'administration est
 * une capacité strictement plus forte que « voir le tableau de bord » — elle mérite sa
 * propre garde, pas une variante affaiblie de `exigerAccesHub`.
 *
 * Passe D'ABORD par `exigerAccesHub()` (session + accès au hub), puis resserre sur le
 * seul propriétaire. Quelqu'un avec accès au hub mais pas propriétaire est renvoyé vers
 * `/` — c'est une page qu'il a légitimement le droit de voir, contrairement à
 * `/sans-acces` qui décrirait une situation qui n'est pas la sienne.
 */
export async function exigerProprietaire(): Promise<Session> {
  const session = await exigerAccesHub();
  if (!estProprietaire(session.user?.email)) redirect("/");
  return session;
}
