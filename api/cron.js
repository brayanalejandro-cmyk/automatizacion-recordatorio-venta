const { getPending, updateStatus, countByStatus, alreadyExists, insertPending } = require('../src/tracker');
const { sendWhatsApp } = require('../src/whatsapp');
const { buildMessage } = require('../src/config');
const { fetchEvents, fetchInvitees, extractPhone } = require('../src/calendly');
const { loadPurchasedEmails } = require('../src/stripe');
const { matchEventType } = require('../src/config');

const BATCH_SIZE = 5;

function firstName(fullName) {
  return (fullName || '').split(' ')[0] || 'amigo/a';
}

function lastMonthRange() {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start: firstDayLastMonth, end: firstDayThisMonth };
}

/**
 * Sync automático: busca leads nuevos en Calendly/Stripe y los mete en Supabase.
 * Se ejecuta solo cuando no hay pendientes en la cola.
 */
async function autoSync() {
  const { start: eventsFrom, end: eventsUntil } = lastMonthRange();
  const purchasesUntil = new Date();

  const events = await fetchEvents(eventsFrom, eventsUntil);

  const relevantEvents = [];
  for (const event of events) {
    const courseName = matchEventType(event.name);
    if (courseName) relevantEvents.push({ event, courseName });
  }

  const leads = new Map();
  for (const { event, courseName } of relevantEvents) {
    const invitees = await fetchInvitees(event.uri);
    for (const inv of invitees) {
      if (inv.status === 'canceled') continue;
      const email = (inv.email || '').toLowerCase().trim();
      if (!email) continue;
      if (!leads.has(email) || new Date(event.start_time) > new Date(leads.get(email).eventDate)) {
        leads.set(email, {
          nombre: inv.name, phone: extractPhone(inv),
          courseName, eventDate: event.start_time, eventName: event.name,
        });
      }
    }
  }

  const purchasedEmails = await loadPurchasedEmails(eventsFrom, purchasesUntil);

  let inserted = 0;
  for (const [email, data] of leads) {
    if (purchasedEmails.has(email)) continue;
    const exists = await alreadyExists(email, data.courseName);
    if (exists) continue;
    const ok = await insertPending({
      email, phone: data.phone, nombre: data.nombre,
      curso: data.courseName, eventoCalendly: data.eventName, fechaEvento: data.eventDate,
    });
    if (ok) inserted++;
  }

  return inserted;
}

module.exports = async function handler(req, res) {
  try {
    // 1. Obtener leads pendientes
    let pending = await getPending(BATCH_SIZE);

    // 2. Si no hay pendientes, hacer sync automático y volver a intentar
    if (pending.length === 0) {
      const newLeads = await autoSync();
      if (newLeads === 0) {
        const counts = await countByStatus();
        return res.status(200).json({
          ok: true,
          message: 'No hay mensajes pendientes. Sync ejecutado, sin leads nuevos.',
          stats: counts,
        });
      }
      // Hay leads nuevos, obtenerlos
      pending = await getPending(BATCH_SIZE);
    }

    // 3. Enviar mensajes
    const results = [];

    for (const lead of pending) {
      const primerNombre = firstName(lead.nombre);
      const msg = buildMessage(primerNombre, lead.curso);

      const result = await sendWhatsApp(lead.phone, msg);

      if (result.sent) {
        await updateStatus(lead.id, 'enviado', null);
        results.push({ email: lead.email, phone: lead.phone, status: 'enviado' });
      } else {
        await updateStatus(lead.id, 'error', result.error);
        results.push({ email: lead.email, phone: lead.phone, status: 'error', error: result.error });
      }

      if (pending.indexOf(lead) < pending.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const counts = await countByStatus();

    return res.status(200).json({
      ok: true,
      sent: results.filter(r => r.status === 'enviado').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
      stats: counts,
    });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
