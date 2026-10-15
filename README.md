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
| Administrador | Crear, editar y eliminar registros, asignar transporte, marcar descargas, ver estadísticas |
| Transportista | Ver registros y estadísticas, y marcar/desmarcar "Descargado en CD" |

Los permisos se validan en el servidor: aunque alguien modifique la página, el transportista
no puede crear, editar ni borrar.

## Claves (obligatorio)
Cloudflare → Workers & Pages → control-retiros → Configuración → Variables y secretos → Agregar:
- `ADMIN_CLAVE` (tipo Secreto): clave del administrador
- `TRANSPORTISTA_CLAVE` (tipo Secreto): clave de los transportistas

Usa claves largas (mínimo 12 caracteres). Para cambiar una clave, edítala ahí:
quien tenga la clave anterior deberá ingresar de nuevo.

Cada registro guarda quién hizo el último cambio (nombre y rol).

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
