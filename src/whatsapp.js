/**
 * Envía un mensaje WhatsApp via UltraMsg.
 * Retorna { sent: true/false, error?: string }
 */
async function sendWhatsApp(phone, message) {
  const instance = process.env.ULTRAMSG_INSTANCE;
  const token = process.env.ULTRAMSG_TOKEN;

  try {
    const res = await fetch(
      `https://api.ultramsg.com/${instance}/messages/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, to: phone, body: message }),
      }
    );

    const data = await res.json();

    // UltraMsg retorna { sent: "true" } en éxito, o error
    if (data.sent === 'true' || data.sent === true) {
      return { sent: true };
    }

    // Manejar número inválido u otros errores
    const errorMsg = data.error || data.message || JSON.stringify(data);
    return { sent: false, error: errorMsg };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = { sendWhatsApp };
