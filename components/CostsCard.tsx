// Panneau « Coûts et quotas » de l'accueil, sous les cartes d'apps (maquette de base, 22/10/2026).
// Générique : il peint l'agrégat des blocs `usage` publiés par les apps (`lib/usage.ts`), rien
// de spécifique à une app.
//
// HONNÊTETÉ, dans l'ordre où la maquette la met en danger :
//  - un bloc PAR période, jamais fusionnés (`pourquoiPasDeTotalUnique` le dit à l'écran) ;
//  - aucun plafond de dépense : le contrat n'en porte pas, on n'en invente pas ;
//  - un quota sans plafond publié n'a pas de jauge (« plafond non publié ») ;
//  - une app sans coût est nommée, jamais comptée pour 0.

import Link from "next/link";
import { formatCad } from "@/lib/format";
import { ditCouts } from "@/lib/liaParole";
import {
  appsSansCout,
  blocsCouts,
  jauges,
  pourquoiPasDeTotalUnique,
  remiseAZero,
  type BlocCout,
  type Jauge,
  type UsageDigest,
} from "@/lib/usage";

const NOTE_DEVISE =
  "Montants en dollars canadiens ; les coûts en USD sont convertis à un taux fixe (environ 1,38).";

function Bloc({ bloc }: { bloc: BlocCout }) {
  return (
    <section className="couts-panneau__bloc" aria-label={bloc.titre}>
      <h3 className="couts-panneau__titre">{bloc.titre}</h3>
      <p className="couts-panneau__montant">≈ {formatCad(bloc.totalCad)}</p>
      {/* La barre découpe le total par app : la part de chacune vient de son propre montant. */}
      <div className="couts-panneau__barre" aria-hidden="true">
        {bloc.lignes.map((l) => (
          <span
            key={l.id}
            className="couts-panneau__part"
            style={{ flexGrow: Math.max(l.cad, 0.01), background: l.couleur ?? undefined }}
          />
        ))}
      </div>
      <ul className="couts-panneau__lignes">
        {bloc.lignes.map((l) => (
          <li key={l.id}>
            <span
              className="couts-panneau__pastille"
              style={l.couleur ? { background: l.couleur } : undefined}
              aria-hidden="true"
            />
            <span className="couts-panneau__nom">{l.nom}</span>
            <span className="couts-panneau__cad">{formatCad(l.cad)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JaugeQuota({ jauge, maintenant }: { jauge: Jauge; maintenant: number }) {
  const reset = remiseAZero(jauge.resetAt, maintenant);
  const unite = jauge.unit ? ` ${jauge.unit}` : "";
  const pct = jauge.ratio === null ? null : Math.round(jauge.ratio * 100);
  return (
    <li className="couts-panneau__quota" data-niveau={jauge.niveau}>
      <div className="couts-panneau__quota-tete">
        <span>
          <strong>{jauge.appNom}</strong> {jauge.label}
        </span>
        <span className="couts-panneau__cad">
          {jauge.limit === null
            ? `${jauge.used}${unite}`
            : `${jauge.used} / ${jauge.limit}${unite}`}
        </span>
      </div>
      {pct !== null ? (
        <div
          className="couts-panneau__jauge"
          role="progressbar"
          aria-label={`${jauge.appNom} : ${jauge.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
          aria-valuetext={`${pct} %`}
        >
          <span style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      ) : null}
      <p className="couts-panneau__note">
        {pct === null ? "plafond non publié" : `${pct} %`}
        {reset ? ` · ${reset}` : ""}
      </p>
    </li>
  );
}

export function CostsCard({
  digest,
  maintenant,
  detail = false,
}: {
  digest: UsageDigest;
  maintenant: number;
  /** Le détail des coûts vit dans l'onglet Coûts du Chantier, réservé au propriétaire : le lien n'est posé que pour lui. */
  detail?: boolean;
}) {
  const blocs = blocsCouts(digest);
  const sansCout = appsSansCout(digest);
  const quotas = jauges(digest);
  const note = pourquoiPasDeTotalUnique(digest.totalsByPeriod) ?? NOTE_DEVISE;

  return (
    <section
      className="couts-panneau"
      aria-label="Coûts et quotas"
      data-lia-cible=""
      data-lia-dit={ditCouts(digest.quotaWarnings, quotas.length)}
    >
      <header className="couts-panneau__tete">
        <div>
          <h2 className="couts-panneau__eyebrow">Coûts et quotas</h2>
          {digest.quotaWarnings > 0 && (
            <p className="couts-panneau__alerte">
              {digest.quotaWarnings} quota{digest.quotaWarnings > 1 ? "s" : ""} à surveiller
            </p>
          )}
        </div>
        {detail && (
          <Link className="btn couts-panneau__detail" href="/chantier?onglet=couts">
            Voir le détail
          </Link>
        )}
      </header>

      {digest.trackedCount === 0 ? (
        <p className="couts-panneau__vide">
          Aucune app ne publie encore ses coûts. Rien inventé.
        </p>
      ) : (
        <>
          {blocs.length > 0 && (
            <>
              <p className="couts-panneau__explication">{note}</p>
              <div className="couts-panneau__blocs">
                {blocs.map((b) => (
                  <Bloc key={b.period} bloc={b} />
                ))}
              </div>
            </>
          )}
          {sansCout.length > 0 && (
            <p className="couts-panneau__explication">
              Pas de coût publié : {sansCout.join(", ")}.
            </p>
          )}
          {quotas.length > 0 && (
            <section className="couts-panneau__quotas" aria-label="Quotas">
              <h3 className="couts-panneau__titre">Quotas</h3>
              <ul className="couts-panneau__liste-quotas">
                {quotas.map((j) => (
                  <JaugeQuota key={j.cle} jauge={j} maintenant={maintenant} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
