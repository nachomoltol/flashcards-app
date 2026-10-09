import Stripe from 'stripe';

// Fallback seguro para permitir la evaluación de módulos y recolección de rutas estáticas de Next.js durante build
const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_build';

export const stripe = new Stripe(stripeSecretKey, {
  appInfo: {
    name: 'Flashcards SaaS App',
    version: '1.0.0',
  },
});
