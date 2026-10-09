import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

interface CheckoutRequestBody {
  plan?: 'monthly' | 'annual';
  userId?: string;
  email?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error:
            'STRIPE_SECRET_KEY no está configurada en las variables de entorno del servidor.',
        },
        { status: 500 }
      );
    }

    const body: CheckoutRequestBody = await req.json();
    const plan = body.plan === 'monthly' ? 'monthly' : 'annual';
    const userId = body.userId?.trim();
    const email = body.email?.trim();

    const priceId =
      plan === 'annual'
        ? process.env.STRIPE_PRICE_ANNUAL
        : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      const missingVarName =
        plan === 'annual' ? 'STRIPE_PRICE_ANNUAL' : 'STRIPE_PRICE_MONTHLY';
      return NextResponse.json(
        {
          error: `La variable de entorno ${missingVarName} no está configurada con el ID del precio de Stripe (ej. price_...).`,
        },
        { status: 500 }
      );
    }

    // Resolver URL base para las redirecciones
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      client_reference_id: userId || undefined,
      metadata: {
        userId: userId || '',
        plan,
      },
      subscription_data: {
        metadata: {
          userId: userId || '',
          plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${origin}/?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?stripe_status=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'No se pudo generar la URL de la pasarela de Stripe.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error al crear la sesión de Stripe Checkout:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno al procesar el pago.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
