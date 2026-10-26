"use client";

// components/RefreshControls.tsx
//
// Rafraîchissement de la LECTURE du hub : router.refresh() ré-exécute la page
// server-side (session revérifiée, summaries refetchés) sans recharger l'onglet ni
// exposer quoi que ce soit au client. Deux modes :
//   - automatique : toutes les REFRESH_INTERVAL_MS, seulement si l'onglet est
//     visible (pas de requêtes en arrière-plan) ;
//   - manuel : bouton « Rafraîchir », désactivé pendant la transition.
// Limite honnête : on relit ce que chaque app publie. Si une app n'a pas
// resynchronisé SES sources, ses chiffres ne bougent pas (cf. « dataAsOf »).

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// 60 s (15 s jusqu'au 26/10/2026) : chaque tick ré-exécute la page serveur ET relit les 6 summaries
// (6 invocations chez les apps), donc 4 ticks par minute coûtaient ~28 invocations par minute et par
// onglet visible (Vercel, 220 $ en octobre 2026). Les chiffres d'une app bougent à l'échelle de la
// minute (relevés espacés, `dataAsOf`), pas de la seconde. Le bouton « Rafraîchir » reste le moyen
// INSTANTANÉ sur demande, et le retour sur l'onglet rafraîchit aussitôt.
const REFRESH_INTERVAL_MS = 60_000;

export function RefreshControls() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, REFRESH_INTERVAL_MS);
    // Au retour sur l'onglet, on remet la vue à jour sans attendre le prochain tick.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return (
    <button
      type="button"
      className="refresh"
      disabled={isPending}
      aria-busy={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <span className={`refresh__icon${isPending ? " refresh__icon--spin" : ""}`} aria-hidden>
        ↻
      </span>
      {isPending ? "Rafraîchissement…" : "Rafraîchir"}
    </button>
  );
}
