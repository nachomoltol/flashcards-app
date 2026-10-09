import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET no está configurada en las variables de entorno.');
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET no está configurada en el servidor.' },
      { status: 500 }
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Falta el encabezado stripe-signature.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al validar firma de webhook.';
    console.error(`Fallo en validación de webhook de Stripe: ${message}`);
    return NextResponse.json(
      { error: `Fallo en verificación de webhook: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      // 1. Sesión de Checkout completada con éxito
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (userId) {
          const { error } = await supabase.rpc('set_user_tier', {
            p_user_id: userId,
            p_tier: 'pro',
            p_customer_id: customerId || null,
            p_subscription_id: subscriptionId || null,
          });

          if (error) {
            console.error('Error al actualizar tier a "pro" en checkout.session.completed:', error);
          } else {
            console.log(`✅ Usuario ${userId} ascendido a nivel PRO tras checkout exitoso.`);
          }
        } else {
          console.warn('checkout.session.completed recibido sin userId o client_reference_id.');
        }
        break;
      }

      // 2. Factura de suscripción pagada (renovación periódica mensual/anual)
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;

        const rawInvoice = invoice as unknown as {
          subscription?: string | { id?: string };
          subscription_details?: { metadata?: Record<string, string> };
          metadata?: Record<string, string>;
        };

        const subscriptionId =
          typeof rawInvoice.subscription === 'string'
            ? rawInvoice.subscription
            : rawInvoice.subscription?.id;

        let userId =
          rawInvoice.subscription_details?.metadata?.userId ||
          rawInvoice.metadata?.userId;

        // Si no está en el invoice, consultar la suscripción en Stripe
        if (!userId && subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            userId = sub.metadata?.userId;
          } catch (fetchErr) {
            console.warn('No se pudo recuperar metadata de la suscripción:', fetchErr);
          }
        }

        if (userId) {
          const { error } = await supabase.rpc('set_user_tier', {
            p_user_id: userId,
            p_tier: 'pro',
            p_customer_id: customerId || null,
            p_subscription_id: subscriptionId || null,
          });

          if (error) {
            console.error('Error al actualizar tier a "pro" en invoice.paid:', error);
          } else {
            console.log(`✅ Usuario ${userId} confirmado como PRO tras invoice.paid.`);
          }
        } else if (subscriptionId || customerId) {
          // Fallback: actualizar por ID de suscripción o cliente en api_limits
          const { error } = await supabase
            .from('api_limits')
            .update({
              tier: 'pro',
              updated_at: new Date().toISOString(),
            })
            .or(
              `stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`
            );

          if (error) {
            console.error('Error al actualizar por fallback en invoice.paid:', error);
          }
        }
        break;
      }

      // 3. Suscripción cancelada o eliminada (revertir a tier free)
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;
        const userId = subscription.metadata?.userId;

        if (userId) {
          const { error } = await supabase.rpc('set_user_tier', {
            p_user_id: userId,
            p_tier: 'free',
            p_customer_id: customerId || null,
            p_subscription_id: subId || null,
          });

          if (error) {
            console.error('Error al revertir tier a "free" para usuario:', error);
          } else {
            console.log(`ℹ️ Usuario ${userId} revertido a tier FREE por cancelación de suscripción.`);
          }
        } else {
          // Revertir buscando por ID de suscripción o cliente
          const { error } = await supabase.rpc('downgrade_user_by_stripe', {
            p_subscription_id: subId,
            p_customer_id: customerId || null,
          });

          if (error) {
            console.error('Error en downgrade_user_by_stripe:', error);
          } else {
            console.log(`ℹ️ Suscripción ${subId} revertida a nivel FREE en Supabase.`);
          }
        }
        break;
      }

      default:
        // Otros eventos de Stripe se reconocen sin error
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (handlerErr: unknown) {
    console.error('Error procesando evento de webhook de Stripe:', handlerErr);
    const message =
      handlerErr instanceof Error ? handlerErr.message : 'Error interno procesando evento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
