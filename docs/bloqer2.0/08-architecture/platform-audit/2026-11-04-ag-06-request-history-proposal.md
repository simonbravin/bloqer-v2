# AG-06 — Devolución de solicitudes con cotizaciones históricas

Estado: **aprobada explícitamente por el Owner el 04/11/2026**, formalizada en D-126; Q-073 resuelta. No se borran antecedentes para resolver la inconsistencia.

## Problema confirmado

BR-PUR-025 permite devolver una solicitud si no hay cotizaciones **activas**, aunque conserve ofertas `REJECTED`/`SUPERSEDED`. La tabla de estados, en cambio, dice cero cotizaciones. Al volver a borrador, el editor de SC elimina/recrea sus líneas, pero `ProcurementQuoteLine` conserva referencias obligatorias a ellas. Guardar puede fallar por integridad referencial. Reutilizar los IDs no basta si se quitan ítems o cambia la cantidad: las ofertas antiguas leen esa cantidad de la SC y no tienen un snapshot propio que preserve el antecedente. D-118 exige conservar las cotizaciones históricas.

## Alternativa recomendada

Por ahora, **Devolver a borrador solo si la SC nunca tuvo cotizaciones**, además de las comprobaciones ya existentes de OC/cobertura y motivo obligatorio. Si hay ofertas de cualquier estado, se conserva la solicitud y sus antecedentes; para cambiar sus ítems se utiliza anular y crear una solicitud nueva, según los permisos y frenos actuales. El mensaje explica el motivo y no presenta una falla de base de datos.

Las SC históricas que ya estén en borrador con cotizaciones se mantienen consultables y no permiten cambios destructivos de sus ítems. No se eliminan ofertas, no se redirigen sus líneas ni se reescribe su cantidad histórica. Los cambios de cabecera que no alteren el contenido de las ofertas pueden conservar su edición existente; el servidor valida esa separación.

Se conserva la edición normal de una SC sin cotizaciones. La decisión no impide gestionar ofertas, su vigencia, rechazo o sustitución mediante las acciones existentes; tampoco habilita anular una SC con compras que hoy lo impiden.

Sin nuevos estados, tablas, campos persistidos, dependencias o migraciones. Se armonizan BR-PUR-025, la máquina de estados, Guía y ayuda.

## Alternativa de desarrollo posterior

Versionar la solicitud y guardar snapshots inmutables de las ofertas permitiría volver a editar ítems conservando su historia. Requiere un contrato de versiones/cantidades y cambios de persistencia aprobados; no se improvisa ese modelo durante este arreglo.

## Verificación prevista

Devolver sin cotizaciones; rechazar devolución con ofertas activas, rechazadas o sustituidas; conservar las líneas y ofertas; proteger borradores históricos; concurrencia entre devolver y cargar oferta; motivo y permisos; edición normal y mensaje operativo.

La definición requiere aprobación por AGENTS.md §2: las dos fuentes describen reglas distintas y la solución conservadora restringe una acción hoy documentada. El versionado alternativo también requeriría §5 y un ADR.
