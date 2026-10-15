# Control de Retiros

Registro de retiros de carga (embarque, referencia, almacenadora, bodega, fechas),
agrupación de referencias por camión de 8 ton o contenedor, confirmación de descarga
en el Centro de Distribución y estadísticas consolidadas.

Funciona como un Cloudflare Worker con base de datos D1 compartida:
todas las personas que abren la URL ven y editan los mismos registros
(la página se actualiza sola cada 15 segundos).

## Archivos
- `worker.js`: la aplicación completa (página + API `/api/registros`)
- `wrangler.jsonc`: configuración del Worker y de la base D1
- `schema.sql`: tabla de la base de datos (se ejecuta una sola vez en la consola de D1)

## Publicación
Cloudflare → Workers & Pages → proyecto `control-retiros`, conectado a este repositorio.
- Comando de compilación: (vacío)
- Comando de implementación: `npx wrangler deploy`

Cada commit a la rama `main` se publica automáticamente en 1–2 minutos.
Los datos viven en D1, así que actualizar el código no los borra.

## Acceso
Proteger la URL con Cloudflare Access (Zero Trust, gratis hasta 50 usuarios):
Worker → Configuración → Dominios y rutas → activar Cloudflare Access en la URL workers.dev,
y en la política permitir solo los correos del equipo.

## Respaldo
Cloudflare → D1 → control-retiros-db → Consola → `SELECT * FROM registros;`
