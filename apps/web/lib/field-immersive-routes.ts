/** Full-screen field flows: hide bottom nav to keep the keyboard and CTA usable. */
const IMMERSIVE_PATTERNS: RegExp[] = [
  /^\/proyectos\/[^/]+\/libro-obra\/nuevo\/?$/,
  /^\/proyectos\/[^/]+\/libro-obra\/[^/]+\/editar\/?$/,
  /^\/proyectos\/[^/]+\/solicitudes-compra\/nueva\/?$/,
  /^\/proyectos\/[^/]+\/ordenes-compra\/[^/]+\/recepciones\/nueva\/?$/,
  /^\/proyectos\/[^/]+\/cuentas-por-pagar\/[^/]+\/pagar\/?$/,
  /^\/finanzas\/cuentas-por-pagar\/[^/]+\/pagar\/?$/,
  /^\/proyectos\/[^/]+\/cuentas-por-cobrar\/[^/]+\/cobrar\/?$/,
  /^\/finanzas\/cuentas-por-cobrar\/[^/]+\/cobrar\/?$/,
];

export function isFieldImmersivePath(pathname: string): boolean {
  return IMMERSIVE_PATTERNS.some((re) => re.test(pathname));
}
