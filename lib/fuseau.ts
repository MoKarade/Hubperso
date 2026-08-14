// lib/fuseau.ts — le fuseau horaire de référence de tout le hub.
//
// ── POURQUOI CETTE CONSTANTE EXISTE ──────────────────────────────────────────────────
//
// `Intl.DateTimeFormat` sans `timeZone` utilise le fuseau de la MACHINE qui exécute le
// code. Or le hub formate ses dates côté SERVEUR (Server Components), et Vercel tourne
// en UTC. « Données du 13 août, 15:20 » affichait donc 15:20 UTC, soit 11:20 chez Marc :
// quatre heures d'écart, sans le moindre signe que quelque chose clochait.
//
// C'est exactement le genre de mensonge que le hub refuse ailleurs : afficher une
// fraîcheur fausse est pire que ne rien afficher, parce qu'on la croit.
//
// ── POURQUOI `America/Toronto` ET PAS UN DÉCALAGE FIXE ───────────────────────────────
//
// Le Québec passe à l'heure avancée : UTC−5 l'hiver, UTC−4 l'été. Un décalage écrit en
// dur serait juste la moitié de l'année. Un identifiant IANA laisse le système appliquer
// la bonne règle à la bonne date, y compris pour les dates passées.
//
// `America/Toronto` et non `America/Montreal` : les deux désignent le même fuseau, mais
// Montréal est un ALIAS déprécié dans la base IANA. Toronto est l'identifiant canonique
// de la zone Est du Canada — c'est celui qui est garanti présent partout.

/** Fuseau de Marc (Québec). Tout affichage de date du hub s'y rapporte. */
export const FUSEAU = "America/Toronto";
