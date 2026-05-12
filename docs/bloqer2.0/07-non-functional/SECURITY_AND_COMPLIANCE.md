# Seguridad y cumplimiento

## Autenticación
- Email + contraseña fuerte; sesión invalidación en cambio permisos.
- **2FA** recomendado para OWNER/ADMIN ([Q-016]).

## Autorización
- RBAC simple por módulo ([D-012]).
- Permisos efectivos = unión de roles ([`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md)).

## Datos sensibles
- Rentabilidad neta restringida ([D-013]).
- Datos bancarios parcialmente enmascarados en UI para roles no FINANCE.

## Transporte y almacenamiento
- TLS obligatorio; secretos en vault; attachments en storage privado con URLs firmadas.

## Referencias
- [`USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md)
