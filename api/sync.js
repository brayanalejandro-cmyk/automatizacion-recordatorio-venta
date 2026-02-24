const { fetchEvents, fetchInvitees, extractPhone } = require('../src/calendly');
const { loadPurchasedEmails } = require('../src/stripe');
const { alreadyExists, insertPending } = require('../src/tracker');
const { matchEventType } = require('../src/config');

/**
 * Calcula el rango del mes anterior.
 */
function lastMonthRange() {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start: firstDayLastMonth, end: firstDayThisMonth };
}

module.exports = async function handler(req, res) {
  // Verificar autorización
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { start: eventsFrom, end: eventsUntil } = lastMonthRange();
    const purchasesUntil = new Date();

    // 1. Obtener eventos de Calendly
    const events = await fetchEvents(eventsFrom, eventsUntil);

    // 2. Filtrar por tipo relevante
    const relevantEvents = [];
    for (const event of events) {
      const courseName = matchEventType(event.name);
      if (courseName) relevantEvents.push({ event, courseName });
    }

    // 3. Obtener invitados, deduplicar por email
    const leads = new Map();
    for (const { event, courseName } of relevantEvents) {
      const invitees = await fetchInvitees(event.uri);
      for (const inv of invitees) {
        if (inv.status === 'canceled') continue;
        const email = (inv.email || '').toLowerCase().trim();
        if (!email) continue;

        if (!leads.has(email) || new Date(event.start_time) > new Date(leads.get(email).eventDate)) {
          leads.set(email, {
            nombre: inv.name,
            phone: extractPhone(inv),
            courseName,
            eventDate: event.start_time,
            eventName: event.name,
          });
        }
      }
    }

    // 4. Cargar emails que ya compraron en Stripe
    const purchasedEmails = await loadPurchasedEmails(eventsFrom, purchasesUntil);

    // 5. Insertar leads fríos como "pendiente" en Supabase
    let inserted = 0, skippedPurchased = 0, skippedExists = 0, noPhone = 0;

    for (const [email, data] of leads) {
      if (purchasedEmails.has(email)) {
        skippedPurchased++;
        continue;
      }

      const exists = await alreadyExists(email, data.courseName);
      if (exists) {
        skippedExists++;
        continue;
      }

      const ok = await insertPending({
        email,
        phone: data.phone,
        nombre: data.nombre,
        curso: data.courseName,
        eventoCalendly: data.eventName,
        fechaEvento: data.eventDate,
      });

      if (ok) {
        if (data.phone) inserted++;
        else noPhone++;
      }
    }

    const summary = {
      totalEvents: events.length,
      relevantEvents: relevantEvents.length,
      uniqueLeads: leads.size,
      purchasedEmails: purchasedEmails.size,
      skippedPurchased,
      skippedExists,
      inserted,
      noPhone,
    };

    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: err.message });
  }
};
