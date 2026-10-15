// lib/messageAdmin.ts — phrases de la page Administration (pures, testables).

/** Question posée avant de retirer une personne : le geste supprime aussi ses accès. */
export function confirmationRetrait(email: string): string {
  return `Retirer ${email} ? Ses accès seront supprimés.`;
}
