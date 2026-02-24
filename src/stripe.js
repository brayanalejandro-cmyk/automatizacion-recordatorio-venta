const Stripe = require('stripe');

let stripe;

function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

/**
 * Pre-carga todos los emails que hicieron compras exitosas en un rango.
 * Retorna un Set<string> con los emails en minúsculas.
 *
 * Recoge emails de:
 * - billing_details.email (presente en casi todos los cargos)
 * - metadata.email (presente en cargos via Teachable)
 * - customer.email (para cargos de suscripción sin billing_details.email)
 */
async function loadPurchasedEmails(sinceDate, untilDate) {
  const s = getStripe();
  const emails = new Set();
  const customerIdsToResolve = [];

  // Iterar todos los cargos exitosos en el período
  const params = {
    limit: 100,
    created: {
      gte: Math.floor(sinceDate.getTime() / 1000),
      lte: Math.floor(untilDate.getTime() / 1000),
    },
  };

  for await (const charge of s.charges.list(params)) {
    if (charge.status !== 'succeeded') continue;

    // billing_details.email
    if (charge.billing_details?.email) {
      emails.add(charge.billing_details.email.toLowerCase().trim());
    }

    // metadata.email (Teachable)
    if (charge.metadata?.email) {
      emails.add(charge.metadata.email.toLowerCase().trim());
    }

    // Si no tenemos email pero sí customer, guardar para resolver después
    if (!charge.billing_details?.email && !charge.metadata?.email && charge.customer) {
      customerIdsToResolve.push(charge.customer);
    }
  }

  // Resolver emails de customers que no tenían email directo
  const uniqueCustomerIds = [...new Set(customerIdsToResolve)];
  for (const custId of uniqueCustomerIds) {
    try {
      const customer = await s.customers.retrieve(custId);
      if (customer.email) {
        emails.add(customer.email.toLowerCase().trim());
      }
    } catch (err) {
      console.error(`  Error resolviendo customer ${custId}: ${err.message}`);
    }
  }

  return emails;
}

module.exports = { loadPurchasedEmails };
