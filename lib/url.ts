// lib/url.ts
//
// Le contrat valide `z.string().url()`, qui accepte AUSSI javascript:/data:/file:.
// Le hub rend ces href comme liens cliquables → on n'autorise QUE http(s) avant
// d'en faire un lien. Un href non conforme n'est simplement pas rendu comme lien
// (défense en profondeur recommandée par la revue du contrat).

export function safeHttpUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
