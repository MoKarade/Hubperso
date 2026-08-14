// app/administration/page.tsx — ajouter ou retirer une personne, sans toucher à Vercel.
//
// Répond à la demande d'origine de Marc : pouvoir inviter quelqu'un sur BatchChef sans
// lui ouvrir JobAI. Réservée au PROPRIÉTAIRE (exigerProprietaire, lib/gardeHub.ts) —
// voir le tableau de bord du hub ne donne aucun droit d'administrer qui d'autre le voit.
//
// NO FAKE DATA, même ici. Base absente ou injoignable : la page le DIT, elle ne se fait
// pas passer pour vide. Une liste vide est un état honnête (« personne d'ajouté ») ; un
// message d'erreur avalé qui produit la même liste vide en serait un malhonnête.

import Link from "next/link";
import { exigerProprietaire } from "@/lib/gardeHub";
import { baseConfiguree } from "@/lib/db";
import { APPS_DISPONIBLES, listerPersonnes, type PersonneAvecAcces } from "@/lib/administration";
import { formatDateTime } from "@/lib/format";
import {
  actionAccorderAcces,
  actionAjouterPersonne,
  actionDefinirActif,
  actionRetirerAcces,
  actionSupprimerPersonne,
} from "./actions";

export const metadata = {
  title: "Administration — Hub perso",
};

export const dynamic = "force-dynamic";

function PersonneCarte({ personne }: { personne: PersonneAvecAcces }) {
  const accesActuels = new Set(personne.appIds);
  return (
    <li className="admin__personne">
      <div className="admin__personne-tete">
        <div>
          <p className="admin__personne-email">{personne.email}</p>
          {personne.nom && <p className="admin__personne-nom">{personne.nom}</p>}
          <p className="admin__personne-meta">
            ajoutée le {formatDateTime(personne.creeLe.toISOString())}
            {!personne.actif && <span className="admin__badge-inactif"> · désactivée</span>}
          </p>
        </div>
        <div className="admin__personne-actions">
          <form action={actionDefinirActif}>
            <input type="hidden" name="email" value={personne.email} />
            <input type="hidden" name="actif" value={String(!personne.actif)} />
            <button type="submit" className="btn">
              {personne.actif ? "Désactiver" : "Réactiver"}
            </button>
          </form>
          <form action={actionSupprimerPersonne}>
            <input type="hidden" name="email" value={personne.email} />
            <button type="submit" className="btn admin__btn-danger">
              Retirer
            </button>
          </form>
        </div>
      </div>

      <ul className="admin__apps">
        {APPS_DISPONIBLES.map((app) => {
          const accorde = accesActuels.has(app.id);
          return (
            <li key={app.id}>
              <form action={accorde ? actionRetirerAcces : actionAccorderAcces}>
                <input type="hidden" name="email" value={personne.email} />
                <input type="hidden" name="appId" value={app.id} />
                <button
                  type="submit"
                  className={`admin__app-toggle${accorde ? " admin__app-toggle--actif" : ""}`}
                  aria-pressed={accorde}
                >
                  {accorde ? "✓" : "+"} {app.nom}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export default async function AdministrationPage() {
  await exigerProprietaire();

  if (!baseConfiguree()) {
    return (
      <main className="page">
        <header className="page__head">
          <div>
            <p className="page__eyebrow">hubperso.com</p>
            <h1 className="page__title">Administration</h1>
          </div>
          <Link href="/" className="btn">
            ← Hub
          </Link>
        </header>
        <p className="admin__vide">
          Aucune base configurée (<code>DATABASE_URL</code> absent). Sans elle, personne ne
          peut être ajouté — seul le propriétaire a accès au hub. Voir <code>.env.example</code>.
        </p>
      </main>
    );
  }

  let personnes: PersonneAvecAcces[];
  try {
    personnes = await listerPersonnes();
  } catch (erreur) {
    // Journalisée, jamais avalée — et dite à l'écran : une base injoignable n'est pas
    // une liste vide, ce sont deux états différents qui appellent des actions différentes.
    console.error("[administration] lecture impossible :", erreur);
    return (
      <main className="page">
        <header className="page__head">
          <div>
            <p className="page__eyebrow">hubperso.com</p>
            <h1 className="page__title">Administration</h1>
          </div>
          <Link href="/" className="btn">
            ← Hub
          </Link>
        </header>
        <p className="admin__vide" role="alert">
          Base injoignable pour l&apos;instant. Réessaie dans un instant ; si ça persiste,
          vérifie <code>DATABASE_URL</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Administration</h1>
        </div>
        <Link href="/" className="btn">
          ← Hub
        </Link>
      </header>

      <p className="admin__intro">
        Une app accordée entière, jamais un niveau de lecture/écriture séparé. Le
        propriétaire (toi) a accès à tout, toujours — il n&apos;apparaît pas ci-dessous.
      </p>

      <form action={actionAjouterPersonne} className="admin__ajout">
        <input
          type="email"
          name="email"
          placeholder="adresse@exemple.com"
          required
          className="admin__input"
        />
        <input
          type="text"
          name="nom"
          placeholder="nom (facultatif)"
          className="admin__input"
        />
        <button type="submit" className="btn">
          Ajouter
        </button>
      </form>

      {personnes.length === 0 ? (
        <p className="admin__vide">Personne d&apos;ajouté pour l&apos;instant.</p>
      ) : (
        <ul className="admin__liste">
          {personnes.map((personne) => (
            <PersonneCarte key={personne.email} personne={personne} />
          ))}
        </ul>
      )}
    </main>
  );
}
