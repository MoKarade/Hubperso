// components/SignOutButton.tsx
//
// Déconnexion discrète pour le header du hub. Server action → pas de "use client" :
// le clic poste vers signOut() d'Auth.js, qui efface le cookie de session et renvoie
// vers /login.
import { signOut } from "@/auth";
import { effacerSessionSignee } from "@/lib/effacerSessionSignee";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await effacerSessionSignee();
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="signout">
        Se déconnecter
      </button>
    </form>
  );
}
