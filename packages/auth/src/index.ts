export { handlers, auth, signIn, signOut } from "./config";
export type { Session } from "next-auth";
// Side-effect: apply session type augmentation
import "./types";
