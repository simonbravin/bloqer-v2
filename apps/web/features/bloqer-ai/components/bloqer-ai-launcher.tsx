import { isBloqerAiEnabled } from "@bloqer/ai/env";
import { BloqerAiChat } from "./bloqer-ai-chat";

/** Server wrapper: only mount chat UI when feature flag is on. */
export function BloqerAiLauncher({ currentProjectId }: { currentProjectId?: string | null }) {
  // `@bloqer/ai/env` — no provider SDK.
  if (!isBloqerAiEnabled()) return null;
  return <BloqerAiChat enabled currentProjectId={currentProjectId} />;
}
