const SUPABASE_TABLE = 'mensajes_recordatorio_1m_venta';

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function supabaseUrl(path) {
  return `${process.env.SUPABASE_URL}/rest/v1/${path}`;
}

/**
 * Verifica si un email+curso ya existe en la tabla (cualquier estado).
 */
async function alreadyExists(email, curso) {
  const params = new URLSearchParams({
    email: `eq.${email.toLowerCase()}`,
    curso: `eq.${curso}`,
    select: 'id',
    limit: '1',
  });

  const res = await fetch(supabaseUrl(`${SUPABASE_TABLE}?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!res.ok) return false;
  const data = await res.json();
  return data.length > 0;
}

/**
 * Inserta un lead como "pendiente" en la cola de envío.
 * Retorna true si se insertó, false si ya existía.
 */
async function insertPending({ email, phone, nombre, curso, eventoCalendly, fechaEvento }) {
  const body = {
    email: email.toLowerCase(),
    phone: phone || null,
    nombre,
    curso,
    evento_calendly: eventoCalendly,
    fecha_evento: fechaEvento,
    estado: phone ? 'pendiente' : 'sin_telefono',
    error_detalle: phone ? null : 'No se encontró teléfono en Calendly',
  };

  const res = await fetch(supabaseUrl(SUPABASE_TABLE), {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (text.includes('duplicate') || text.includes('unique') || text.includes('23505')) {
      return false; // Ya existe
    }
    console.error(`Supabase insert error: ${res.status} ${text}`);
    return false;
  }
  return true;
}

/**
 * Obtiene N leads pendientes, ordenados por fecha de evento (más antiguos primero).
 */
async function getPending(limit) {
  const params = new URLSearchParams({
    estado: 'eq.pendiente',
    select: '*',
    order: 'fecha_evento.asc',
    limit: String(limit),
  });

  const res = await fetch(supabaseUrl(`${SUPABASE_TABLE}?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!res.ok) {
    console.error(`Supabase getPending error: ${res.status}`);
    return [];
  }
  return res.json();
}

/**
 * Actualiza el estado de un lead después de intentar enviar.
 */
async function updateStatus(id, estado, errorDetalle) {
  const body = { estado, fecha_envio: new Date().toISOString() };
  if (errorDetalle) body.error_detalle = errorDetalle;

  const res = await fetch(supabaseUrl(`${SUPABASE_TABLE}?id=eq.${id}`), {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Supabase update error: ${res.status}`);
  }
}

/**
 * Cuenta leads por estado.
 */
async function countByStatus() {
  const res = await fetch(
    supabaseUrl(`${SUPABASE_TABLE}?select=estado`),
    { headers: supabaseHeaders() }
  );

  if (!res.ok) return {};
  const data = await res.json();
  const counts = {};
  for (const row of data) {
    counts[row.estado] = (counts[row.estado] || 0) + 1;
  }
  return counts;
}

module.exports = { alreadyExists, insertPending, getPending, updateStatus, countByStatus };
