// Control de Retiros — Cloudflare Worker + D1
// La página está en index.html (se incluye automáticamente al publicar).
import HTML from "./index.html";

// GET    /                     -> la página
// GET    /api/sesion           -> valida la clave y devuelve el rol
// GET    /api/registros        -> lista todos los registros (admin y transportista)
// PUT    /api/registros/:id    -> admin: crea/edita todo · transportista: solo el estado de descarga
// DELETE /api/registros/:id    -> solo admin
//
// Quien abre la página sin clave entra como TRANSPORTISTA (ver todo + marcar descarga).
// Clave del administrador (Cloudflare → Worker → Configuración → Variables y secretos, tipo "Secreto"):
//   ADMIN_CLAVE

const CAMPOS_TEXTO = ["embarque", "referencia", "almacenadora", "bodega", "fechaDocs", "fechaRetiro", "fechaDescarga", "creado", "actualizado"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function iguales(a, b) {
  // Comparación en tiempo constante para no filtrar la clave por tiempos de respuesta
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function rolDe(request, env) {
  const clave = request.headers.get("X-Clave") || "";
  if (!clave) return "transportista";           // sin clave: transportista
  if (iguales(clave, env.ADMIN_CLAVE)) return "admin";
  return null;                                  // clave enviada pero incorrecta
}

function usuarioDe(request, rol) {
  if (rol !== "admin") return "Transportista";
  let n = request.headers.get("X-Usuario") || "";
  try { n = decodeURIComponent(n); } catch { n = ""; }
  n = n.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 40) || "Sin nombre";
  return `${n} (${rol})`;
}

function limpiar(body) {
  const out = {};
  for (const k of CAMPOS_TEXTO) {
    const v = body[k];
    out[k] = typeof v === "string" ? v.trim().slice(0, 200) : "";
  }
  for (const k of ["fechaDocs", "fechaRetiro", "fechaDescarga"]) {
    if (out[k] && !FECHA.test(out[k])) out[k] = "";
  }
  out.tipo = body.tipo === "camion" || body.tipo === "contenedor" ? body.tipo : null;
  const n = Number(body.unidad);
  out.unidad = out.tipo && Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
  out.descargado = body.descargado === true;
  if (!out.descargado) out.fechaDescarga = "";
  return out;
}

async function guardar(env, id, reg, usuario) {
  await env.DB.prepare(
    `INSERT INTO registros (id, data, actualizado, modificado_por) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado, modificado_por = excluded.modificado_por`
  ).bind(id, JSON.stringify(reg), new Date().toISOString(), usuario).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Método no permitido", { status: 405 });
      return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
    }

    if (!env.ADMIN_CLAVE) {
      return json({ error: "Falta configurar ADMIN_CLAVE en Cloudflare." }, 500);
    }

    const rol = rolDe(request, env);
    if (!rol) return json({ error: "Clave incorrecta" }, 401);

    if (url.pathname === "/api/sesion" && request.method === "GET") {
      return json({ rol });
    }

    if (!url.pathname.startsWith("/api/registros")) return json({ error: "No encontrado" }, 404);

    const partes = url.pathname.split("/").filter(Boolean); // ["api","registros",id?]
    let id = null;
    try { id = partes[2] ? decodeURIComponent(partes[2]) : null; } catch { return json({ error: "Identificador inválido" }, 400); }
    const usuario = usuarioDe(request, rol);

    try {
      if (request.method === "GET" && !id) {
        const { results } = await env.DB.prepare("SELECT id, data, modificado_por FROM registros").all();
        return json(results.map((r) => ({ id: r.id, ...JSON.parse(r.data), modificadoPor: r.modificado_por || "" })));
      }

      if (request.method === "PUT" && id) {
        if (!ID.test(id)) return json({ error: "Identificador inválido" }, 400);
        let body;
        try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
        if (!body || typeof body !== "object") return json({ error: "Cuerpo inválido" }, 400);

        if (rol === "transportista") {
          // El transportista solo puede cambiar el estado de descarga de un registro existente
          const fila = await env.DB.prepare("SELECT data FROM registros WHERE id = ?1").bind(id).first();
          if (!fila) return json({ error: "Solo el administrador puede crear registros" }, 403);
          const actual = JSON.parse(fila.data);
          actual.descargado = body.descargado === true;
          actual.fechaDescarga = actual.descargado
            ? (typeof body.fechaDescarga === "string" && FECHA.test(body.fechaDescarga) ? body.fechaDescarga : new Date().toISOString().slice(0, 10))
            : "";
          actual.actualizado = new Date().toISOString();
          await guardar(env, id, actual, usuario);
          return json({ ok: true });
        }

        const reg = limpiar(body);
        if (!reg.referencia) return json({ error: "La referencia es obligatoria" }, 400);
        if (reg.tipo && !reg.fechaRetiro) return json({ error: "Falta la fecha de retiro" }, 400);
        await guardar(env, id, reg, usuario);
        return json({ ok: true });
      }

      if (request.method === "DELETE" && id) {
        if (rol !== "admin") return json({ error: "Solo el administrador puede eliminar" }, 403);
        await env.DB.prepare("DELETE FROM registros WHERE id = ?1").bind(id).run();
        return json({ ok: true });
      }

      return json({ error: "Método no permitido" }, 405);
    } catch (e) {
      console.error(e);
      return json({ error: "Error del servidor" }, 500);
    }
  },
};
