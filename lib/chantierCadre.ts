// lib/chantierCadre.ts — la page Chantier vit dans un cadre isolé (iframe) ; ce fichier dit comment
// elle est isolée et ce que le hub lui répond. PUR : aucune I/O.
//
// ── POURQUOI UN CADRE ISOLÉ ET PAS DE LA PAGE DU HUB ────────────────────────────────
//
// La page Chantier est un document autonome (CSS, JS et rendu à elle, 440 Ko) venu de l'artefact
// claude.ai. La réécrire en React est possible plus tard, seulement si Marc le veut (décision du
// 26/10/2026, option A). En attendant elle est servie TELLE QUELLE, et c'est son isolement qui
// la rend sûre à côté de la session du hub :
//
//   - origine OPAQUE (`sandbox` sans `allow-same-origin`) : ni cookie du hub, ni lecture de ses
//     pages, ni son stockage local ;
//   - AUCUN réseau (`connect-src 'none'`) : elle ne peut rien envoyer ailleurs, ni relire l'API
//     du hub avec la session ;
//   - elle ne reçoit QUE ce que le hub lui poste (`postMessage`) : le relevé du Gantt.
//
// Le document servi ne contient AUCUNE donnée (ni relevé, ni montant, ni registre des dépenses) :
// `tests/chantierCadre.test.ts` le verrouille, parce que ce dépôt est PUBLIC.

/** Où le hub sert le document du cadre (route réservée au propriétaire). */
export const URL_CADRE = "/api/chantier/cadre";

/** Où le hub relit le relevé pour le poster au cadre (`app/api/chantier/releve/route.ts`). */
export const URL_RELEVE = "/api/chantier/releve";

/**
 * L'attribut `sandbox` du `<iframe>`. Ni `allow-same-origin` (origine opaque), ni
 * `allow-top-navigation`, ni `allow-forms`. Les fenêtres ouvertes (liens GitHub, `target="_blank"`)
 * sortent du bac à sable pour s'afficher normalement.
 */
export const SANDBOX_CADRE = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/**
 * La CSP de la route du cadre. Elle REMPLACE celle du hub sur cette seule route (`next.config.mjs`
 * l'exclut de la CSP globale : deux CSP s'additionnent en intersection, et `frame-ancestors 'none'`
 * du hub interdirait de la mettre en cadre). `sandbox` figure aussi ICI : même si quelqu'un ouvrait
 * la route hors du cadre, le document resterait en origine opaque.
 */
export const CSP_CADRE = [
  `sandbox ${SANDBOX_CADRE}`,
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  // Seul le hub peut la mettre en cadre (et le hub est le seul à y poster).
  "frame-ancestors 'self'",
].join("; ");

/** Ce que le document du cadre et le hub se disent (`chantier/cadre.html`, `components/ChantierCadre.tsx`). */
export const MESSAGE_PRET = "chantier-pret";
export const MESSAGE_PING = "chantier-ping";
export const MESSAGE_RELEVE = "chantier-releve";
export const MESSAGE_ETAT = "chantier-etat";

/** Le cadre dit qu'il est prêt à recevoir le relevé. Tout le reste est ignoré. */
export function estMessagePret(donnee: unknown): boolean {
  return (
    typeof donnee === "object" &&
    donnee !== null &&
    (donnee as { type?: unknown }).type === MESSAGE_PRET
  );
}

/** Ce que le hub fait d'une réponse de `GET /api/chantier/releve`. */
export type Consigne =
  | { type: "poster" }
  | { type: "inchange" }
  | { type: "etat"; message: string };

/**
 * 200 : un nouveau relevé à poster. 304 : celui du cadre est le dernier, on ne fait rien. Le reste
 * est dit au cadre, en clair : un relevé absent n'est pas une panne, une panne n'est pas une
 * absence (no fake data). Le cadre garde ce qu'il affichait déjà.
 */
export function consigneDeReponse(status: number): Consigne {
  if (status === 200) return { type: "poster" };
  if (status === 304) return { type: "inchange" };
  if (status === 401) {
    return { type: "etat", message: "La session du hub a expiré : recharge la page pour te reconnecter." };
  }
  if (status === 404) return { type: "etat", message: "Aucun relevé reçu pour l'instant." };
  if (status === 429) {
    return { type: "etat", message: "Trop de lectures d'affilée : nouvel essai dans une minute." };
  }
  if (status === 503) {
    return { type: "etat", message: "Le hub n'a pas de base : le relevé ne peut pas être lu." };
  }
  return { type: "etat", message: `Le relevé est indisponible (erreur ${status}).` };
}

/**
 * Ces octets sont-ils encore un gzip ? La route répond `Content-Encoding: gzip` : le navigateur
 * décompresse seul et la page reçoit du JSON. Si un intermédiaire retire l'en-tête (ou si la
 * décompression n'a pas eu lieu), le cadre recevrait un gzip qu'il lit comme du JSON et
 * n'afficherait RIEN, sans erreur : le hub décompresse alors lui-même (`1f 8b`, RFC 1952).
 */
export function estGzip(octets: ArrayBuffer): boolean {
  const debut = new Uint8Array(octets, 0, Math.min(2, octets.byteLength));
  return debut.length === 2 && debut[0] === 0x1f && debut[1] === 0x8b;
}
