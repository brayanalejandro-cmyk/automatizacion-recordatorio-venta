const { getPending, updateStatus, countByStatus } = require('../src/tracker');
const { sendWhatsApp } = require('../src/whatsapp');
const { buildMessage } = require('../src/config');

const BATCH_SIZE = 5;

/**
 * Extrae el primer nombre del nombre completo.
 */
function firstName(fullName) {
  return (fullName || '').split(' ')[0] || 'amigo/a';
}

module.exports = async function handler(req, res) {
  // Verificar autorización
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Obtener leads pendientes
    const pending = await getPending(BATCH_SIZE);

    if (pending.length === 0) {
      const counts = await countByStatus();
      return res.status(200).json({
        ok: true,
        message: 'No hay mensajes pendientes',
        stats: counts,
      });
    }

    // 2. Enviar mensajes
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

      // Pausa de 2s entre mensajes para evitar rate limiting
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
