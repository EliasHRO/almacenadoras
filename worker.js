// Control de Retiros — Cloudflare Worker + D1
// La página está en index.html (se incluye automáticamente al publicar).
import HTML from "./index.html";

// GET    /                     -> la página
// GET    /api/sesion           -> valida la clave y devuelve el rol
// GET    /api/registros        -> lista todos los registros (admin y transportista)
// PUT    /api/registros/:id    -> admin: crea/edita todo · transportista: solo el estado de la carga
// DELETE /api/registros/:id    -> solo admin
// GET    /api/responsables     -> lista de responsables · PUT (solo admin) la reemplaza
//
// Quien abre la página sin clave entra como TRANSPORTISTA (ver todo + marcar descarga).
// El administrador entra con usuario y contraseña (definidos abajo).

// ---------- Acceso del administrador ----------
// La contraseña NO se guarda en texto: solo su huella SHA-256.
// Para cambiarla, pide la nueva huella o calcula: SHA-256 de "control-retiros:" + contraseña.
const ADMIN_USUARIO = "Torre2026";
const ADMIN_HASH = "26247fb9aee567ff3cac049b0fee2a5e8df1dc8d3c15e5078c665193ace7b4cb";

const CAMPOS_TEXTO = ["embarque", "referencia", "almacenadora", "bodega", "responsable", "fechaDocs", "fechaRetiro", "fechaDescarga", "fechaEstado", "creado", "actualizado"];
const ESTADOS = ["pendiente", "retirada", "inconveniente"];
const RESPONSABLES_INICIALES = ["Joel Cruz", "Pablo Escobar"];

// Tabla de ajustes (lista de responsables). Se crea sola la primera vez.
let ajustesListo = false;
async function asegurarAjustes(env) {
  if (ajustesListo) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)").run();
  ajustesListo = true;
}

// Valida y aplica el estado de la carga (pendiente / retirada / inconveniente) sobre un registro
function aplicarEstado(destino, body) {
  const estado = ESTADOS.includes(body.estado) ? body.estado : (body.descargado === true ? "retirada" : "pendiente");
  const obs = typeof body.observacion === "string" ? body.observacion.trim().slice(0, 500) : "";
  if (estado === "inconveniente" && !obs) return "Describe el inconveniente en la observación";
  const fecha = typeof body.fechaEstado === "string" && FECHA.test(body.fechaEstado) ? body.fechaEstado
    : (typeof body.fechaDescarga === "string" && FECHA.test(body.fechaDescarga) ? body.fechaDescarga : new Date().toISOString().slice(0, 10));
  destino.estado = estado;
  destino.observacion = obs;
  destino.fechaEstado = estado === "pendiente" ? "" : fecha;
  destino.descargado = estado === "retirada";          // compatibilidad con registros anteriores
  destino.fechaDescarga = destino.descargado ? destino.fechaEstado : "";
  return null;
}

// Registros antiguos (solo "descargado") se muestran con el nuevo estado
function normalizar(reg) {
  if (!ESTADOS.includes(reg.estado)) {
    reg.estado = reg.descargado ? "retirada" : "pendiente";
    reg.fechaEstado = reg.descargado ? (reg.fechaDescarga || "") : "";
    reg.observacion = reg.observacion || "";
  }
  return reg;
}
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

async function huella(texto) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("control-retiros:" + texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rolDe(request) {
  const clave = request.headers.get("X-Clave") || "";
  if (!clave) return "transportista";           // sin contraseña: transportista
  let usuario = request.headers.get("X-Usuario") || "";
  try { usuario = decodeURIComponent(usuario).trim(); } catch { usuario = ""; }
  const okUsuario = iguales(usuario.toLowerCase(), ADMIN_USUARIO.toLowerCase());
  const okClave = iguales(await huella(clave), ADMIN_HASH);
  return okUsuario && okClave ? "admin" : null; // datos enviados pero incorrectos
}

function usuarioDe(rol) {
  return rol === "admin" ? ADMIN_USUARIO + " (admin)" : "Transportista";
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
  const peso = Number(body.peso), vol = Number(body.volumen);
  out.peso = Number.isFinite(peso) && peso > 0 && peso < 1000000 ? Math.round(peso * 100) / 100 : null;
  out.volumen = Number.isFinite(vol) && vol > 0 && vol < 100000 ? Math.round(vol * 1000) / 1000 : null;
  out.tipo = body.tipo === "camion" || body.tipo === "contenedor" ? body.tipo : null;
  // Referencia retirada en varios equipos (registro duplicado)
  if (typeof body.division === "string" && ID.test(body.division) && [1, 2].includes(Number(body.parte))) {
    out.division = body.division; out.parte = Number(body.parte); out.partes = 2;
  }
  const n = Number(body.unidad);
  out.unidad = out.tipo && Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
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

    const rol = await rolDe(request);
    if (!rol) return json({ error: "Usuario o contraseña incorrectos" }, 401);

    if (url.pathname === "/api/sesion" && request.method === "GET") {
      return json({ rol });
    }

    if (url.pathname === "/api/responsables") {
      try {
        await asegurarAjustes(env);
        if (request.method === "GET") {
          const fila = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'responsables'").first();
          let lista = RESPONSABLES_INICIALES;
          try { if (fila) lista = JSON.parse(fila.valor); } catch {}
          return json({ lista });
        }
        if (request.method === "PUT") {
          if (rol !== "admin") return json({ error: "Solo el administrador puede cambiar la lista" }, 403);
          let body;
          try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
          if (!body || !Array.isArray(body.lista)) return json({ error: "Lista inválida" }, 400);
          const vistos = new Set(), lista = [];
          for (const x of body.lista) {
            if (typeof x !== "string") continue;
            const n = x.replace(/\s+/g, " ").trim().slice(0, 60);
            if (!n || vistos.has(n.toLowerCase())) continue;
            vistos.add(n.toLowerCase()); lista.push(n);
            if (lista.length >= 50) break;
          }
          await env.DB.prepare(
            "INSERT INTO ajustes (clave, valor) VALUES ('responsables', ?1) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
          ).bind(JSON.stringify(lista)).run();
          return json({ ok: true, lista });
        }
        return json({ error: "Método no permitido" }, 405);
      } catch (e) {
        console.error(e);
        return json({ error: "Error del servidor" }, 500);
      }
    }

    if (!url.pathname.startsWith("/api/registros")) return json({ error: "No encontrado" }, 404);

    const partes = url.pathname.split("/").filter(Boolean); // ["api","registros",id?]
    let id = null;
    try { id = partes[2] ? decodeURIComponent(partes[2]) : null; } catch { return json({ error: "Identificador inválido" }, 400); }
    const usuario = usuarioDe(rol);

    try {
      if (request.method === "GET" && !id) {
        const { results } = await env.DB.prepare("SELECT id, data, modificado_por FROM registros").all();
        return json(results.map((r) => ({ id: r.id, ...normalizar(JSON.parse(r.data)), modificadoPor: r.modificado_por || "" })));
      }

      if (request.method === "PUT" && id) {
        if (!ID.test(id)) return json({ error: "Identificador inválido" }, 400);
        let body;
        try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
        if (!body || typeof body !== "object") return json({ error: "Cuerpo inválido" }, 400);

        if (rol === "transportista") {
          // El transportista solo puede cambiar el estado de la carga (y su observación) de un registro existente
          const fila = await env.DB.prepare("SELECT data FROM registros WHERE id = ?1").bind(id).first();
          if (!fila) return json({ error: "Solo el administrador puede crear registros" }, 403);
          const actual = JSON.parse(fila.data);
          const error = aplicarEstado(actual, body);
          if (error) return json({ error }, 400);
          actual.actualizado = new Date().toISOString();
          await guardar(env, id, actual, usuario);
          return json({ ok: true });
        }

        const reg = limpiar(body);
        if (!reg.referencia) return json({ error: "La referencia es obligatoria" }, 400);
        const errorEstado = aplicarEstado(reg, body);
        if (errorEstado) return json({ error: errorEstado }, 400);
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
