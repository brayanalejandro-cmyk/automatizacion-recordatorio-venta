require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { fetchEvents, fetchInvitees, extractPhone, firstName } = require('./calendly');
const { loadPurchasedEmails } = require('./stripe');
const { sendWhatsApp } = require('./whatsapp');
const { alreadyExists, insertPending, getPending, updateStatus, countByStatus } = require('./tracker');
const { matchEventType, buildMessage } = require('./config');

function lastMonthRange() {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start: firstDayLastMonth, end: firstDayThisMonth };
}

/**
 * Fase 1: Sincronizar leads de Calendly/Stripe → Supabase
 */
async function sync() {
  console.log('\n=== SYNC: Calendly + Stripe → Supabase ===\n');

  const { start: eventsFrom, end: eventsUntil } = lastMonthRange();
  const purchasesUntil = new Date();
  console.log(`Eventos: ${eventsFrom.toLocaleDateString('es')} - ${eventsUntil.toLocaleDateString('es')}`);

  const events = await fetchEvents(eventsFrom, eventsUntil);
  console.log(`Total eventos: ${events.length}`);

  const relevantEvents = [];
  for (const event of events) {
    const courseName = matchEventType(event.name);
    if (courseName) relevantEvents.push({ event, courseName });
  }
  console.log(`Eventos relevantes: ${relevantEvents.length}`);

  console.log('Obteniendo invitados...');
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
  console.log(`Leads únicos: ${leads.size}`);

  console.log('Cargando compras de Stripe...');
  const purchasedEmails = await loadPurchasedEmails(eventsFrom, purchasesUntil);
  console.log(`Emails con compras: ${purchasedEmails.size}`);

  let inserted = 0, skippedPurchased = 0, skippedExists = 0, noPhone = 0;
  for (const [email, data] of leads) {
    if (purchasedEmails.has(email)) { skippedPurchased++; continue; }
    const exists = await alreadyExists(email, data.courseName);
    if (exists) { skippedExists++; continue; }
    const ok = await insertPending({
      email, phone: data.phone, nombre: data.nombre,
      curso: data.courseName, eventoCalendly: data.eventName, fechaEvento: data.eventDate,
    });
    if (ok) { if (data.phone) inserted++; else noPhone++; }
  }

  console.log(`\nResultado sync:`);
  console.log(`  Insertados (pendientes): ${inserted}`);
  console.log(`  Sin teléfono:            ${noPhone}`);
  console.log(`  Ya compraron:            ${skippedPurchased}`);
  console.log(`  Ya existían en tabla:    ${skippedExists}`);
}

/**
 * Fase 2: Enviar N mensajes pendientes
 */
async function send(limit = 5) {
  console.log(`\n=== SEND: Enviando ${limit} mensajes pendientes ===\n`);

  const pending = await getPending(limit);
  if (pending.length === 0) {
    console.log('No hay mensajes pendientes.');
    const counts = await countByStatus();
    console.log('Estado actual:', counts);
    return;
  }

  console.log(`${pending.length} leads pendientes encontrados.\n`);
  let sent = 0, errors = 0;

  for (const lead of pending) {
    const msg = buildMessage(firstName(lead.nombre), lead.curso);
    console.log(`Enviando a ${lead.phone} (${lead.nombre} - ${lead.email})...`);
    const result = await sendWhatsApp(lead.phone, msg);

    if (result.sent) {
      sent++;
      await updateStatus(lead.id, 'enviado', null);
      console.log(`  ✅ Enviado`);
    } else {
      errors++;
      await updateStatus(lead.id, 'error', result.error);
      console.log(`  ❌ Error: ${result.error}`);
    }

    if (pending.indexOf(lead) < pending.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nResultado: ${sent} enviados, ${errors} errores`);
  const counts = await countByStatus();
  console.log('Estado actual:', counts);
}

// CLI
const cmd = process.argv[2];
if (cmd === 'sync') {
  sync().catch(err => { console.error('Error:', err); process.exit(1); });
} else if (cmd === 'send') {
  const limit = parseInt(process.argv[3]) || 5;
  send(limit).catch(err => { console.error('Error:', err); process.exit(1); });
} else {
  console.log('Uso:');
  console.log('  node src/index.js sync       # Sincronizar leads');
  console.log('  node src/index.js send [N]   # Enviar N mensajes (default: 5)');
}
