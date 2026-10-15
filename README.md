# Control de Retiros

Página + API en un Cloudflare Worker, con datos compartidos en una base D1.
Todas las personas que abren la URL ven y editan los mismos registros (se actualiza cada 15 s).

Estructura:
- `public/index.html`: la aplicación
- `src/worker.js`: API (/api/registros)
- `schema.sql`: tabla de la base de datos
- `wrangler.jsonc`: configuración del Worker y de la base D1

---

## Despliegue: GitHub → Cloudflare (sin usar terminal)

### 1. Crear la base de datos en Cloudflare
1. Panel de Cloudflare → **Storage & Databases → D1 SQL Database → Create**.
2. Nombre: `control-retiros-db` → Create.
3. Abre la base → pestaña **Console**, pega el contenido de `schema.sql` y ejecútalo.
4. Copia el **Database ID** (aparece en la página de la base).

### 2. Subir el código a GitHub
1. Crea un repositorio **privado** (ej. `control-retiros`).
2. Sube el **contenido** de esta carpeta (que `wrangler.jsonc` quede en la raíz del repo, no dentro de otra carpeta).
3. Edita `wrangler.jsonc` en GitHub y reemplaza `PEGA_AQUI_EL_ID_DE_TU_BASE_D1` por el Database ID. Commit.

### 3. Conectar GitHub con Cloudflare
1. Panel de Cloudflare → **Workers & Pages → Create → Import a repository**.
2. Autoriza la cuenta de GitHub y elige el repo `control-retiros`.
3. Configuración:
   - Project name: `control-retiros` (debe coincidir con `"name"` en wrangler.jsonc)
   - Build command: (vacío)
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
4. **Save and Deploy**. Al terminar aparece la URL: `https://control-retiros.<tu-cuenta>.workers.dev`.

Desde ese momento, cada commit a la rama `main` se publica solo en 1–2 minutos.
Los datos están en D1, así que actualizar el código no los borra.

### 4. Restringir el acceso (recomendado)
Sin este paso, cualquiera con la URL puede ver y editar.
- Workers & Pages → `control-retiros` → **Settings → Domains & Routes** → activa **Cloudflare Access** en la URL workers.dev.
- Zero Trust → Access → Applications → edita la política: permite solo los correos de tu equipo o tu dominio (ej. `@tuempresa.com`). Gratis hasta 50 usuarios.

Con Access activo, cada registro guarda el correo de quien hizo el último cambio.

---

## Respaldo de datos
Panel → D1 → `control-retiros-db` → Console → `SELECT * FROM registros;` y exporta,
o con terminal: `npx wrangler d1 export control-retiros-db --remote --output=respaldo.sql`

## Trabajar en local (opcional, para desarrolladores)
    npx wrangler login
    npx wrangler d1 execute control-retiros-db --local --file=schema.sql
    npx wrangler dev
