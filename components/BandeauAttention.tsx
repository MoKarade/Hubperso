import Link from "next/link";
import type { Attention } from "@/lib/attention";
import { compteParGravite } from "@/lib/attention";

// Le bandeau d'en-tête : il ne s'affiche QUE s'il y a quelque chose à dire.
//
// Un bandeau permanent qui annonce « 0 problème » est un bandeau qu'on cesse de voir en
// trois jours — et le jour où il passe à « 1 », l'œil ne s'arrête plus dessus. Absent quand
// tout va bien, il redevient une information le jour où il apparaît.
//
// Les `info` ne le déclenchent pas : ce sont des nouvelles, pas des décisions à prendre.
// Elles restent visibles sur /attention, qui liste tout.

export function BandeauAttention({ liste }: { liste: Attention[] }) {
  const compte = compteParGravite(liste);
  if (compte.alert === 0 && compte.warn === 0) return null;

  const morceaux: string[] = [];
  if (compte.alert > 0) morceaux.push(`${compte.alert} à régler`);
  if (compte.warn > 0) morceaux.push(`${compte.warn} à surveiller`);

  return (
    <Link
      className="bandeau-attention"
      href="/attention"
      data-gravite={compte.alert > 0 ? "alert" : "warn"}
    >
      <span className="bandeau-attention__pastille" aria-hidden="true" />
      <span>{morceaux.join(" · ")}</span>
      <span className="bandeau-attention__fleche" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
