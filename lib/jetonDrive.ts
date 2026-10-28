// lib/jetonDrive.ts — le jeton d'accès Google qui lit Drive, tiré de la session de Marc.
//
// Les jetons Google vivent dans le JWT chiffré du cookie de session (`lib/jetonsGoogle.ts`), jamais dans la
// session que voit le navigateur. Une route du hub lit donc le cookie elle-même (`getToken`), vérifie que le
// droit « lecture de Drive » y figure, et renouvelle le jeton d'accès avec le `refresh_token` s'il a expiré.
// Le jeton ne sort JAMAIS de cette route : ni réponse, ni journal.
//
// DÉCIDER est pur (`choisirJeton`) ; lire le cookie et appeler Google est l'I/O (`jetonDrive`).

import { getToken } from "next-auth/jwt";
import { jetonExpire, PORTEE_DRIVE_LECTURE } from "@/lib/jetonsGoogle";

export type RaisonSansJeton =
  | "session" // pas de cookie lisible
  | "droit-absent" // connecté avant l'ajout du droit : se reconnecter une fois
  | "jeton-refuse" // Google refuse le renouvellement
  | "injoignable"; // réseau

export type ChoixJeton =
  | { type: "valide"; jeton: string }
  | { type: "renouveler"; refreshToken: string }
  | { type: "sans"; raison: RaisonSansJeton };

interface JetonJwt {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  error?: string;
}

/** Que faire de ce JWT pour lire Drive. PUR : l'horloge se passe en paramètre. */
export function choisirJeton(token: JetonJwt | null, maintenantMs: number): ChoixJeton {
  if (!token) return { type: "sans", raison: "session" };
  if (!(token.scope ?? "").split(" ").includes(PORTEE_DRIVE_LECTURE)) {
    return { type: "sans", raison: "droit-absent" };
  }
  if (token.accessToken && !token.error && !jetonExpire(token.expiresAt, maintenantMs)) {
    return { type: "valide", jeton: token.accessToken };
  }
  if (token.refreshToken) return { type: "renouveler", refreshToken: token.refreshToken };
  return { type: "sans", raison: "jeton-refuse" };
}

/** Le nom du cookie de session : celui que fixe `lib/sessionPartagee.ts` en HTTPS, celui d'Auth.js sinon. */
export function nomCookieSession(https: boolean): string {
  return https ? "__Secure-authjs.session-token" : "authjs.session-token";
}

async function renouveler(refreshToken: string): Promise<{ jeton: string } | { raison: RaisonSansJeton }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { access_token?: string };
    if (res.ok && data.access_token) return { jeton: data.access_token };
    return { raison: "jeton-refuse" };
  } catch (erreur) {
    console.error("[bilans] renouvellement du jeton Google impossible", erreur);
    return { raison: "injoignable" };
  }
}

/** Le jeton qui lit Drive pour cette requête, ou la raison honnête de son absence. */
export async function jetonDrive(request: Request): Promise<{ jeton: string } | { raison: RaisonSansJeton }> {
  const https = new URL(request.url).protocol === "https:";
  const nom = nomCookieSession(https);
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: https,
    cookieName: nom,
    salt: nom,
  });
  const choix = choisirJeton(token, Date.now());
  if (choix.type === "valide") return { jeton: choix.jeton };
  if (choix.type === "sans") return { raison: choix.raison };
  return await renouveler(choix.refreshToken);
}
