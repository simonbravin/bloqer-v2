import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

export const completeTrialOnboardingInputSchema = z.object({
  displayName: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  legalName:   z.string().trim().min(1, "La razón social es obligatoria").max(200),
  taxId:       z.string().trim().min(1, "El CUIT / identificación fiscal es obligatorio").max(32),
  country:     z.string().trim().length(2, "País inválido").toUpperCase(),
  city:        z.string().trim().min(1, "La ciudad es obligatoria").max(120),
  address:     z.string().trim().min(1, "La dirección es obligatoria").max(500),
  phone:       z.string().trim().min(1, "El teléfono es obligatorio").max(40),
  website: z.preprocess(
    emptyToUndefined,
    z.string().trim().url("URL inválida").max(512).optional(),
  ),
  industry: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120).optional(),
  ),
  companySize: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(64).optional(),
  ),
});

export type CompleteTrialOnboardingInput = z.infer<typeof completeTrialOnboardingInputSchema>;
