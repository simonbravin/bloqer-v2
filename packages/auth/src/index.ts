export { handlers, auth, signIn, signOut } from "./auth";
export type { Session } from "next-auth";
// Side-effect: apply session type augmentation
import "./types";
