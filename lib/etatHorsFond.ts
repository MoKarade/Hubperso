// lib/etatHorsFond.ts — l'état partagé de LIA ne se relit pas dans un onglet caché.
//
// lia-ui relit l'état (`GET /api/lia/etat`, qui appelle aussi MemoryAI) au montage puis chaque minute, même si l'onglet est en
// arrière-plan : un onglet oublié coûtait 1 440 invocations par jour (Vercel, octobre 2026). Ses écritures, elles, sont déjà
// sautées onglet caché. Cet adaptateur enveloppe `etatHttp` : onglet caché, `lire` rend la dernière lecture gardée, sans réseau.
//
// Honnête : on ne rend jamais un état inventé. Sans lecture gardée (onglet ouvert directement en arrière-plan), on lit pour de
// vrai, une fois. Au retour sur l'onglet, la minuterie de lia-ui relit au prochain pas. PUR : la visibilité se passe en paramètre.

import type { EtatHote } from "@mokarade/lia-ui";

export function etatSansLectureCachee(base: EtatHote, ongletCache: () => boolean): EtatHote {
  let gardee: { valeur: unknown } | null = null;
  return {
    async lire() {
      if (gardee !== null && ongletCache()) return gardee.valeur;
      const valeur = await base.lire();
      gardee = { valeur };
      return valeur;
    },
    async ecrire(etat) {
      const rendu = await base.ecrire(etat);
      // Si le serveur garde un état plus récent que le nôtre, c'est lui la dernière lecture connue.
      if (rendu !== null && rendu !== undefined) gardee = { valeur: rendu };
      return rendu;
    },
  };
}
