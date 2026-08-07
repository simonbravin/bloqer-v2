export { handlers, auth, signIn, signOut } from "./auth";
export {
  SESSION_ABSOLUTE_MAX_AGE_SEC,
  SESSION_IDLE_MAX_AGE_SEC,
} from "./session-limits";
export type { Session } from "next-auth";
// Side-effect: apply session type augmentation
import "./types";
