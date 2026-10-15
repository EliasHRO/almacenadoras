// Control de Retiros — API compartida sobre Cloudflare D1
// GET    /api/registros        -> lista todos los registros
// PUT    /api/registros/:id    -> crea o actualiza un registro
// DELETE /api/registros/:id    -> elimina un registro

const CAMPOS_TEXTO = ["embarque", "referencia", "almacenadora", "bodega", "fechaDocs", "fechaRetiro", "fechaDescarga", "creado", "actualizado"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/registros")) {
      return env.ASSETS.fetch(request);
    }

    const partes = url.pathname.split("/").filter(Boolean); // ["api","registros",id?]
    const id = partes[2] ? decodeURIComponent(partes[2]) : null;
    // Si la app está protegida con Cloudflare Access, este encabezado trae el correo del usuario.
    const usuario = request.headers.get("Cf-Access-Authenticated-User-Email") || "";

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
        const reg = limpiar(body);
        if (!reg.referencia) return json({ error: "La referencia es obligatoria" }, 400);
        if (reg.tipo && !reg.fechaRetiro) return json({ error: "Falta la fecha de retiro" }, 400);
        const ahora = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO registros (id, data, actualizado, modificado_por) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(id) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado, modificado_por = excluded.modificado_por`
        ).bind(id, JSON.stringify(reg), ahora, usuario).run();
        return json({ ok: true });
      }

      if (request.method === "DELETE" && id) {
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
