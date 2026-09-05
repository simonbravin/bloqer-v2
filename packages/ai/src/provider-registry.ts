import type { AiProvider } from "./provider";
import { AiProviderError } from "./errors";

export type AiProviderFactory = () => AiProvider;

export class AiProviderRegistry {
  private readonly factories = new Map<string, AiProviderFactory>();

  register(id: string, factory: AiProviderFactory): void {
    this.factories.set(id, factory);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  listIds(): string[] {
    return [...this.factories.keys()].sort();
  }

  create(id: string): AiProvider {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new AiProviderError("NOT_CONFIGURED", `AI provider "${id}" is not registered`, {
        providerId: id,
      });
    }
    return factory();
  }
}

/** Shared process registry — adapters register at module load / bootstrap. */
export const defaultAiProviderRegistry = new AiProviderRegistry();
