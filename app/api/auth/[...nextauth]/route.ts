// Route handler d'Auth.js : expose /api/auth/* (signin, callback, signout, session…).
// Toute la logique est dans auth.ts ; on ne fait que brancher les handlers.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
