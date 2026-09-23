// lib/icones.ts — QUELLE icône, décidé sans rendu. PUR, donc testable.
//
// Les TRACÉS vivent dans `components/Icone.tsx` ; le CHOIX vit ici. C'est la même séparation
// que `lib/carte.ts` face à `components/AppWidget.tsx` : le composant peint, le module juge
// (§2 du CLAUDE.md, « fonctions pures d'un côté, I/O de l'autre »).
//
// ⚠️⚠️ CE QUI CHOISIT UNE ICÔNE : UNIQUEMENT DES CHAMPS DU CONTRAT — `severity`, le signe de
// `trend`. JAMAIS `app.id`. C'est le principe n° 1 du dépôt : le hub ne connaît aucune app.
// Une icône « portefeuille pour FinanceAI » serait la première entorse, elle demanderait une
// liste à tenir à jour, et la septième app arriverait sans icône sans que rien ne rougisse.

export type NomIcone =
  | "alerte"
  | "attention"
  | "info"
  | "conseil"
  | "hausse"
  | "baisse"
  | "horloge"
  | "section";

/**
 * L'icône d'une sévérité du contrat, ou `null` quand il n'y a rien à signaler.
 *
 * ⚠️ LE CONTRAT A DEUX ÉCHELLES DE GRAVITÉ, ET ELLES NE SE RECOUVRENT PAS. Une métrique ou
 * une ligne de `details` vaut `ok | warn | alert` ; une alerte vaut `info | warn | alert`.
 * `ok` et `info` n'existent donc chacune que d'un côté. Le paramètre accepte l'UNION des
 * deux plutôt que l'une d'elles : typer sur une seule obligerait les appelants de l'autre
 * échelle à transtyper, c'est-à-dire à éteindre le contrôle exact qu'on veut garder.
 *
 * ⚠️ `ok` et `info` n'ont PAS d'icône, et c'est le même raisonnement pour les deux : une
 * ligne qui va bien n'a rien à signaler, une note d'information non plus. Leur coller un
 * pictogramme apprendrait à balayer les icônes des yeux, et le jour où un triangle paraît,
 * il serait déjà noyé. Le retour est donc nullable — jamais un repli silencieux sur `info`.
 */
export function iconeSeverite(
  severity: "ok" | "info" | "warn" | "alert",
): NomIcone | null {
  if (severity === "alert") return "alerte";
  if (severity === "warn") return "attention";
  return null;
}

/**
 * L'icône d'une tendance, à partir de son SIGNE.
 *
 * ⚠️ ZÉRO MONTE, et c'est un choix assumé plutôt qu'un oubli : `formatTrend` écrit déjà
 * « 0 % » à côté, donc la flèche ne porte pas l'information seule. Une troisième icône
 * « stable » ajouterait une forme à reconnaître pour un cas que le texte dit déjà.
 */
export function iconeTendance(trend: number): NomIcone {
  return trend >= 0 ? "hausse" : "baisse";
}
