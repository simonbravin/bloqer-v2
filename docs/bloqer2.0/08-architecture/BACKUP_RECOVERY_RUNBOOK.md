# Respaldo y recuperación: alcance inicial

Estado al 21/11/2026. Bloque **10/J** del plan de desarrollo.

## Decisión operativa

Con un cliente activo, mantener los proveedores actuales y no contratar otro servicio por ahora. El usuario delegó una solución proporcional al riesgo. Se incorpora un ensayo automático con datos sintéticos; **no se activa ni se declara existente un backup independiente de producción**.

La documentación oficial de [Neon](https://neon.com/docs/introduction/plans) informa hasta **6 horas** de instant restore en Free, con límite de historial de cambios. Es una capacidad del plan, no evidencia de la ventana efectiva del proyecto Bloqer: falta verificar esa configuración. Una incidencia detectada después puede quedar fuera de recuperación. La base contiene metadatos y referencias; no contiene los bytes guardados en R2.

Las revisiones inmutables, el archivado y SHA-256 preservan trazabilidad dentro del almacenamiento operativo. No protegen por sí solos frente a pérdida del bucket, eliminación administrativa o compromiso de credenciales. Los [bucket locks de R2](https://developers.cloudflare.com/r2/buckets/bucket-locks/) evitan eliminación/sobrescritura durante un plazo, pero tampoco crean otra copia. No se cambian reglas del bucket operativo en esta entrega.

## Ensayo automático mantenido

La etapa `Restore rehearsal on disposable SQL and synthetic files` de `.github/workflows/ci.yml` ejecuta `packages/services/src/documents/document-recovery.live.test.ts`:

1. Crea dos bases vacías en Postgres 16 efímero de CI. Solo migra la fuente con las migraciones existentes.
2. Verifica CI, opt-in, URLs loopback exactas, usuario, puerto y nombre efectivo de ambas bases. Rechaza destino con tablas, fuente con tenants, URLs remotas y parámetros de redirección.
3. Prepara empresa/proyecto, autores, PDF original archivado, revisión activa y foto PNG sintéticos, con fechas, SHA-256 y auditoría.
4. Ejecuta `pg_dump` real en formato custom. Copia archivos y manifiesto a un directorio temporal separado; vacía el transporte de objetos original.
5. Ejecuta `pg_restore` real en la segunda base, en una transacción. Recupera los archivos desde las copias y compara filas completas, auditoría, hashes y tamaños.
6. Usa los servicios reales sobre la base restaurada: descarga, autor/fecha, historial, revisiones y rechazo de otro tenant, otra empresa y un usuario sin membresía del proyecto. Una copia alterada debe fallar la verificación de integridad.
7. Comprueba que la fuente conserva sus filas. Elimina solo su directorio temporal único; CI destruye el contenedor al terminar, incluso si falla.

El transporte R2 es simulado en memoria; no usa credenciales reales ni accede a buckets. SQL y las copias de archivos temporales son reales. Los fixtures se insertan directamente como preparación de prueba; las cargas del producto mantienen sus suites existentes. **No demuestra restauración remota de R2, backup programado, retención ni RPO/RTO de producción.** No exportar dumps, archivos ni credenciales como artefactos de GitHub.

Evidencia: enlace del PR y ejecución de CI con SHA exacto. Un test omitido no cuenta como restauración aprobada. Localmente sin Docker solo corren los guards; la restauración completa corre en GitHub Actions.

## Ante una incidencia real

1. Identificar hora UTC y alcance; detener escrituras afectadas de forma coordinada. Conservar logs y estado actual.
2. Comprobar la ventana efectiva de Neon. Recuperar primero a una rama/base aislada siguiendo [la documentación oficial](https://neon.com/docs/postgres/backup-restore/backups); no reemplazar producción durante el diagnóstico.
3. Inventariar objetos referenciados por el estado recuperado y verificar existencia, tamaño y SHA-256. Restaurar SQL no recrea archivos faltantes. No purgar objetos por no aparecer en una instantánea antigua.
4. Comprobar tenant/empresa/proyecto, autores/fechas, permisos, documentos/revisiones y conciliaciones financieras. Desactivar notificaciones, correos y crons en la copia de recuperación.
5. Registrar evidencia y aprobar el cambio concreto antes de reconectar producción. Conservar una vía de reversión y comprobar los flujos después del cambio.

## Siguiente mínimo recomendado

Priorizar antes de sumar otro cliente o ampliar documentos críticos; no dejarlo abierto indefinidamente:

- Backup diario cifrado de PostgreSQL y originales/revisiones de archivos con manifiesto de integridad, en destino privado separado y credenciales distintas de la aplicación.
- Propuesta inicial: 7 copias diarias y 4 semanales, ajustada a volumen/costo y obligaciones de conservación. **No es una política activa ni una garantía contractual.**
- Otro bucket del mismo R2 comparte cuenta/proveedor y no cubre su pérdida total. La independencia completa requiere otra cuenta o proveedor y custodia separada de claves.
- Verificar consistencia entre base/archivos, alertar ante fallos y ensayar recuperación periódica. Medir RPO/RTO antes de prometerlos.

Pendientes: ventana efectiva de Neon, destino/costo/custodia, automatización diaria, retención, copia remota de objetos y simulacro con backup real. No se cambian planes ni se ejecutan migraciones o fixtures en bases de clientes.

## Continuidad del plan

- **1/A:** piloto remoto completo de captura documental pendiente; este ensayo no lo sustituye.
- **2/B y 3/C:** continuar comunicaciones/alertas con el alcance existente; WhatsApp oficial y frecuencia adicional conservan sus decisiones operativas pendientes.
- **9/I:** administración Vercel diferida por el usuario; publicación por GitHub.
- **10/J:** ensayo reproducible incorporado; respaldo independiente real pendiente.

Sin impacto documental/AI funcional: solo CI, tests y procedimiento técnico; no cambian rutas, etiquetas, permisos ni flujos de usuarios.
