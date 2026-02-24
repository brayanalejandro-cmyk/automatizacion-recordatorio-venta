/**
 * Reglas de matching para tipos de evento de Calendly.
 * Cada regla tiene un regex para el nombre del evento y el nombre
 * del curso/programa que se usará en el mensaje de WhatsApp.
 */
const EVENT_TYPE_RULES = [
  { match: /examen.*abogac[ií]a/i, courseName: 'Examen de Acceso a la Abogacía' },
  { match: /abogac[ií]a.*[eé]lite/i, courseName: 'Abogacía Élite' },
  { match: /entrevista.*abogac[ií]a/i, courseName: 'Abogacía Élite' },
  { match: /oposiciones.*justicia/i, courseName: 'Oposiciones de Justicia' },
  { match: /orientaci[oó]n.*justicia/i, courseName: 'Oposiciones de Justicia' },
  { match: /justicia.*express/i, courseName: 'Oposiciones de Justicia' },
  { match: /formaci[oó]n.*justicia/i, courseName: 'Oposiciones de Justicia' },
  { match: /legal\s*prime/i, courseName: 'Legal Prime' },
];

/**
 * Dado el nombre de un evento de Calendly, retorna el nombre del curso
 * para el mensaje, o null si no es un evento relevante.
 */
function matchEventType(eventName) {
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.match.test(eventName)) {
      return rule.courseName;
    }
  }
  return null;
}

/**
 * Construye el mensaje de WhatsApp.
 */
function buildMessage(primerNombre, courseName) {
  return (
    `Hola, ${primerNombre} 😊 ¿qué tal?\n\n` +
    `Soy Lucía, no sé si te acuerdas de mí, hablamos hace aproximadamente un mes cuando agendaste una llamada con nosotros.\n\n` +
    `Te escribo porque justo ahora se nos han quedado unas cuantas plazas libres en la formación de *${courseName}* y pensé directamente en ti.\n\n` +
    `Y precisamente por eso creo que ahora podría venirte perfecto, porque además esta semana tenemos disponible un descuento especial para nuevas incorporaciones.\n\n` +
    `Si te interesa, dímelo y te cuento todos los detalles encantada 😊.`
  );
}

module.exports = { EVENT_TYPE_RULES, matchEventType, buildMessage };
