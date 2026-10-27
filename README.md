# Control de Retiros

Registro de retiros de carga, agrupación de referencias por camión de 8 ton o contenedor,
confirmación de descarga en el Centro de Distribución y estadísticas consolidadas.
Cloudflare Worker + base de datos D1 compartida (se actualiza cada 15 segundos).

## Archivos
- `index.html`: la página (diseño, textos, pantallas). Edita este archivo para cambiar la apariencia.
- `worker.js`: el servidor (API, permisos y base de datos)
- `wrangler.jsonc`: configuración del Worker y de la base D1
- `schema.sql`: tabla de la base de datos (ya ejecutada en la consola de D1)

## Roles
| Rol | Puede |
|---|---|
| Administrador | Crear, editar y eliminar registros, asignar transporte, cambiar el estado de la carga, ver estadísticas |
| Transportista (cualquiera que abra la URL, sin login) | Ver registros y estadísticas, y cambiar el estado: Carga retirada o Inconveniente (con observación) |

Los permisos se validan en el servidor: aunque alguien modifique la página, el transportista
no puede crear, editar ni borrar.

## Acceso del administrador
Botón "Ingresar como administrador" (arriba a la derecha), con el usuario y la contraseña
definidos en `worker.js` (ADMIN_USUARIO / ADMIN_HASH).
La contraseña no está escrita en el código: solo su huella SHA-256.
Para cambiarla, reemplaza ADMIN_HASH por la huella de la nueva contraseña.

Cada registro guarda quién hizo el último cambio (usuario administrador o "Transportista").

## Peso y volumen
Cada referencia puede llevar Peso (kg) y Volumen (m³). Al crear o editar, la plataforma suma las referencias
de la misma almacenadora y fecha y evalúa cuántos equipos se necesitan:
- Camión 8 ton (todas excepto MARITIMA ACAJUTLA): más de 8,000 kg o más de 36 m³ = 2 camiones.
- Contenedor (MARITIMA ACAJUTLA): más de 16,000 kg o más de 72 m³ = 2 contenedores.
También avisa si la unidad elegida ya no tiene capacidad y propone una nueva unidad.
Los límites están en `index.html` (variable LIM).

## Responsables
El administrador agrega o quita responsables con el botón "Responsables" (arriba a la derecha).
La lista se guarda en la base D1 (tabla `ajustes`, se crea sola). Quitar a alguien no borra su nombre
de las referencias que ya tiene asignadas.

## Publicación
Cloudflare → Workers & Pages → control-retiros, conectado a este repositorio.
- Comando de compilación: (vacío)
- Comando de implementación: `npx wrangler deploy`
Cada commit a `main` se publica solo en 1–2 minutos. Los datos no se borran.

## Respaldo
Cloudflare → D1 → control-retiros-db → Consola → `SELECT * FROM registros;`

## Cómo actualizar la página
1. En GitHub, abre `index.html` → lápiz (Edit) → haz el cambio, o súbelo de nuevo con Add file → Upload files.
2. Commit changes.
3. Cloudflare publica la nueva versión sola en 1–2 minutos.
