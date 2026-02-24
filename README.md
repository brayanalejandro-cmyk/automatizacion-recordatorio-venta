# Automatización: Recordatorio de Venta (1 mes)

Automatización que contacta por WhatsApp a personas que agendaron una llamada en Calendly hace ~1 mes pero no realizaron ninguna compra en Stripe.

## Flujo

1. **Sync** (`/api/sync`): Obtiene eventos del mes anterior de Calendly, filtra por tipo de reunión relevante (Abogacía, Justicia, etc.), cruza con Stripe para descartar quienes ya compraron, y guarda los leads "fríos" como pendientes en Supabase.

2. **Cron** (`/api/cron`): Toma 5 leads pendientes de Supabase y les envía un mensaje por WhatsApp vía UltraMsg. Se ejecuta cada 30 minutos mediante cron-job.org.

## Tipos de evento filtrados

| Evento en Calendly | Curso en el mensaje |
|---|---|
| Formación Examen de Acceso Abogacía | Examen de Acceso a la Abogacía |
| Abogacía Élite / Entrevista Abogacía | Abogacía Élite |
| Formación Oposiciones de Justicia | Oposiciones de Justicia |
| Orientación Justicia (Gratis) | Oposiciones de Justicia |
| Formación Justicia Express | Oposiciones de Justicia |

## Anti-spam

- Tabla `mensajes_recordatorio_1m_venta` en Supabase con constraint `UNIQUE(email, curso)`.
- Una vez contactado para un curso, no se le vuelve a escribir.
- Los leads sin teléfono se registran como `sin_telefono` y no se reintentan.

## Endpoints

| Endpoint | Descripción | Frecuencia |
|---|---|---|
| `GET /api/sync` | Sincroniza leads de Calendly/Stripe → Supabase | Manual o 1 vez al mes |
| `GET /api/cron` | Envía 5 mensajes pendientes | Cada 30 min (cron-job.org) |

## Variables de entorno (Vercel)

```
CALENDLY_TOKEN
CALENDLY_USER
CALENDLY_ORG
STRIPE_SECRET_KEY
ULTRAMSG_INSTANCE
ULTRAMSG_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

## Uso local

```bash
npm install

# Sincronizar leads
node src/index.js sync

# Enviar 5 mensajes
node src/index.js send 5
```

## Tabla Supabase

```sql
CREATE TABLE mensajes_recordatorio_1m_venta (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  nombre TEXT,
  curso TEXT,
  evento_calendly TEXT,
  fecha_evento TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ DEFAULT NOW(),
  estado TEXT DEFAULT 'enviado',
  error_detalle TEXT,
  UNIQUE(email, curso)
);
```
