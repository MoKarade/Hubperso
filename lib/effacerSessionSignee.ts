// lib/effacerSessionSignee.ts — la déconnexion efface AUSSI le cookie de session signé.
//
// Les apps acceptent `__Secure-hub.session` en plus du cookie chiffré : sans cet effacement,
// « Se déconnecter » laisserait l'accès ouvert chez elles jusqu'à l'expiration (30 jours).
// À appeler AVANT `signOut()`, qui termine par une redirection.
import { cookies } from "next/headers";
import { NOM_COOKIE_SESSION_SIGNEE, optionsCookieSignee } from "@/lib/sessionSignee";

export async function effacerSessionSignee(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const domaine = env.AUTH_COOKIE_DOMAIN?.trim();
  if (!domaine) return;
  (await cookies()).set(NOM_COOKIE_SESSION_SIGNEE, "", optionsCookieSignee(domaine, 0));
}
