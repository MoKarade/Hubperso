/**
 * Interroge les CINQ apps pour de vrai et juge la cohérence de la constellation.
 *
 * Pourquoi un script et pas un test : il a besoin des VRAIS jetons et du VRAI réseau. Le
 * mettre dans le gate rendrait la CI dépendante de la disponibilité de cinq apps — un
 * déploiement en cours ailleurs peindrait cette PR-ci en rouge, et on prendrait l'habitude
 * du rouge. C'est la même raison qui tient le job `audit` à part.
 *
 * La LOGIQUE, elle, est pure et testée sans réseau (`lib/constellation.ts`,
 * `tests/constellation.test.ts`). Ce fichier n'est que le transport.
 *
 *   npx tsx scripts/verifier-constellation.ts
 *
 * Sortie : 0 si aucune incohérence bloquante, 1 sinon. Les avertissements n'échouent pas —
 * des périodes de coût différentes sont AUTORISÉES par le contrat, elles méritent d'être
 * dites, pas d'arrêter quoi que ce soit.
 */
import { getSources } from "../lib/sources";
import { fetchAllSummaries } from "../lib/fetchSummary";
import { rapportConstellation, verifierConstellation } from "../lib/constellation";

async function main(): Promise<number> {
  const sources = getSources(process.env);
  const configurees = sources.filter((s) => s.token !== null);

  console.log(
    `Constellation : ${sources.length} apps déclarées, ${configurees.length} avec un jeton.`,
  );
  if (configurees.length === 0) {
    // Sans jeton, le script ne prouve RIEN — et rendre 0 ferait passer un run vide pour un
    // run vert. C'est exactement le mode d'échec qu'on essaie d'éliminer ailleurs.
    console.error(
      "Aucun jeton dans l'environnement : ce run ne vérifie rien. Échec volontaire —\n" +
        "un run vide ne doit pas ressembler à un run vert.",
    );
    return 1;
  }

  const results = await fetchAllSummaries(sources);

  for (const r of results) {
    const id = r.state === "ok" ? r.summary.app.id : "—";
    console.log(`  ${r.source.id.padEnd(12)} ${r.state.padEnd(18)} app.id=${id}`);
  }

  const incoherences = verifierConstellation(results);
  console.log("\n" + rapportConstellation(incoherences));

  return incoherences.some((i) => i.gravite === "bloquant") ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Le vérificateur lui-même a échoué :", err);
    process.exit(1);
  });
