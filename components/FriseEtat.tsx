import { MOT_PLAGE, libellePlage, resumeFrise, type EtatPlage, type FriseApp } from "@/lib/friseEtat";

// Sous les cartes : ce que le hub a vu de chaque app sur les 24 dernières heures (maquette validée). Tout vient des
// relevés réels (`lib/friseEtat.ts`, pur) : une plage sans relevé est dessinée comme telle, jamais comme « à jour ».
// La couleur ne porte jamais seule l'information : chaque état a son mot (légende, résumé, survol) et sa forme
// (plein, hachuré, demi-hauteur, pointillé).

const LEGENDE: readonly EtatPlage[] = ["ok", "panne", "refus", "vide"];

export function FriseEtat({ frises }: { frises: FriseApp[] }) {
  if (frises.length === 0) return null;
  return (
    <section className="frise" aria-label="Les dernières 24 heures">
      <div className="frise__tete">
        <p className="frise__eyebrow">Les dernières 24 h</p>
        <ul className="frise__legende" aria-label="Légende">
          {LEGENDE.map((e) => (
            <li key={e} className="frise__legende-item">
              <span className="frise__plage" data-etat={e} aria-hidden="true" />
              {MOT_PLAGE[e]}
            </li>
          ))}
        </ul>
      </div>
      <ul className="frise__lignes">
        {frises.map((f) => (
          <li key={f.appId} className="frise__ligne">
            <span className="frise__nom">{f.nom}</span>
            <p className="frise__resume">{resumeFrise(f)}</p>
            <div className="frise__barre" role="img" aria-label={`${f.nom} : ${resumeFrise(f)}`}>
              {f.plages.map((p) => (
                <span key={p.debutMs} className="frise__plage" data-etat={p.etat} title={libellePlage(p)} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="frise__note">Un relevé tous les quarts d’heure, plages de 30 min, heure du Québec. Une plage sans relevé n’est jamais comptée comme à jour.</p>
    </section>
  );
}
