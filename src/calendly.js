const CALENDLY_API = 'https://api.calendly.com';

function headers() {
  return {
    Authorization: `Bearer ${process.env.CALENDLY_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Obtiene todos los eventos agendados en un rango de fechas.
 * Maneja paginación automáticamente.
 */
async function fetchEvents(minDate, maxDate) {
  const allEvents = [];

  // Primera URL
  const params = new URLSearchParams({
    user: process.env.CALENDLY_USER,
    organization: process.env.CALENDLY_ORG,
    min_start_time: minDate.toISOString(),
    max_start_time: maxDate.toISOString(),
    status: 'active',
    count: '100',
  });
  let nextUrl = `${CALENDLY_API}/scheduled_events?${params}`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: headers() });

    if (!res.ok) {
      const text = await res.text();
      if (allEvents.length > 0) {
        console.warn(`  ⚠️ Paginación falló (${res.status}), retornando ${allEvents.length} eventos obtenidos.`);
        break;
      }
      throw new Error(`Calendly events error ${res.status}: ${text}`);
    }

    const data = await res.json();
    allEvents.push(...(data.collection || []));

    // Usar la URL completa de next_page en vez del token
    nextUrl = data.pagination?.next_page || null;
  }

  return allEvents;
}

/**
 * Obtiene los invitados de un evento específico.
 */
async function fetchInvitees(eventUri) {
  const res = await fetch(`${eventUri}/invitees`, { headers: headers() });

  if (!res.ok) {
    console.error(`  Error obteniendo invitees de ${eventUri}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.collection || [];
}

/**
 * Extrae el teléfono de las preguntas del invitado.
 */
function extractPhone(invitee) {
  const phoneKeywords = [
    'teléfono', 'telefono', 'phone', 'whatsapp',
    'móvil', 'movil', 'celular', 'numero', 'número',
  ];

  for (const qa of invitee.questions_and_answers || []) {
    const q = (qa.question || '').toLowerCase();
    const a = (qa.answer || '').trim();
    if (phoneKeywords.some(kw => q.includes(kw)) && a) {
      let phone = a.replace(/[^0-9+]/g, '');
      if (phone && !phone.startsWith('+')) {
        phone = phone.length <= 9 ? `+34${phone}` : `+${phone}`;
      }
      return phone || null;
    }
  }
  return null;
}

/**
 * Extrae el primer nombre del nombre completo.
 */
function firstName(fullName) {
  return (fullName || '').split(' ')[0] || 'amigo/a';
}

module.exports = { fetchEvents, fetchInvitees, extractPhone, firstName };
