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

        let currentPeriodEnd: string | null = null;
        let subscriptionStatus = 'active';

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            subscriptionStatus = sub.status || 'active';
            const rawSub = sub as unknown as { current_period_end?: number };
            if (rawSub.current_period_end) {
              currentPeriodEnd = new Date(rawSub.current_period_end * 1000).toISOString();
            }
          } catch (fetchErr) {
            console.warn('Advertencia al consultar suscripción en checkout.session.completed:', fetchErr);
          }
        }

        if (userId) {
          const { error } = await supabase.rpc('set_user_tier', {
            p_user_id: userId,
            p_tier: 'pro',
            p_customer_id: customerId || null,
            p_subscription_id: subscriptionId || null,
            p_current_period_end: currentPeriodEnd,
            p_subscription_status: subscriptionStatus,
          });

          if (error) {
            console.error('Error al actualizar tier a "pro" en checkout.session.completed:', error);
          }

          // Persistir columnas de vigencia y estado en api_limits
          await supabase
            .from('api_limits')
            .update({
              tier: 'pro',
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || null,
              current_period_end: currentPeriodEnd,
              subscription_status: subscriptionStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          console.log(`✅ Usuario ${userId} ascendido a nivel PRO tras checkout exitoso (Vence: ${currentPeriodEnd || 'N/A'}).`);
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

        let currentPeriodEnd: string | null = null;
        let subscriptionStatus = 'active';

        // Consultar la suscripción en Stripe para obtener vigencia y usuario si falta
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            if (!userId) {
              userId = sub.metadata?.userId;
            }
            subscriptionStatus = sub.status || 'active';
            const rawSub = sub as unknown as { current_period_end?: number };
            if (rawSub.current_period_end) {
              currentPeriodEnd = new Date(rawSub.current_period_end * 1000).toISOString();
            }
          } catch (fetchErr) {
            console.warn('No se pudo recuperar metadata/periodo de la suscripción:', fetchErr);
          }
        }

        if (userId) {
          const { error } = await supabase.rpc('set_user_tier', {
            p_user_id: userId,
            p_tier: 'pro',
            p_customer_id: customerId || null,
            p_subscription_id: subscriptionId || null,
            p_current_period_end: currentPeriodEnd,
            p_subscription_status: subscriptionStatus,
          });

          if (error) {
            console.error('Error al actualizar tier a "pro" en invoice.paid:', error);
          }

          // Persistir current_period_end y subscription_status de forma garantizada
          await supabase
            .from('api_limits')
            .update({
              tier: 'pro',
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || null,
              current_period_end: currentPeriodEnd,
              subscription_status: subscriptionStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          console.log(`✅ Usuario ${userId} confirmado como PRO tras invoice.paid (Vence: ${currentPeriodEnd || 'N/A'}).`);
        } else if (subscriptionId || customerId) {
          // Fallback: actualizar por ID de suscripción o cliente en api_limits
          const filter = subscriptionId
            ? `stripe_subscription_id.eq.${subscriptionId}`
            : `stripe_customer_id.eq.${customerId}`;

          const { error } = await supabase
            .from('api_limits')
            .update({
              tier: 'pro',
              current_period_end: currentPeriodEnd,
              subscription_status: subscriptionStatus,
              updated_at: new Date().toISOString(),
            })
            .or(filter);

          if (error) {
            console.error('Error al actualizar por fallback en invoice.paid:', error);
          }
        }
        break;
      }

      // 3. Fallo en el cobro de factura (tarjeta rechazada o sin fondos)
      case 'invoice.payment_failed': {
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

        let subStatus = 'past_due';
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            if (!userId) {
              userId = sub.metadata?.userId;
            }
            if (sub.status) {
              subStatus = sub.status;
            }
          } catch (fetchErr) {
            console.warn('No se pudo recuperar suscripción en invoice.payment_failed:', fetchErr);
          }
        }

        // Si Stripe ya no reintentará el cobro (next_payment_attempt null) o está cancelada/impagada, degradar a free
        const isExhausted =
          invoice.next_payment_attempt === null ||
          subStatus === 'canceled' ||
          subStatus === 'unpaid' ||
          subStatus === 'incomplete_expired';

        const targetTier = isExhausted ? 'free' : 'pro';
        const finalStatus = isExhausted ? (subStatus === 'active' ? 'unpaid' : subStatus) : 'past_due';

        if (userId) {
          await supabase
            .from('api_limits')
            .update({
              tier: targetTier,
              subscription_status: finalStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          console.log(`⚠️ invoice.payment_failed procesado para usuario ${userId}: status=${finalStatus}, tier=${targetTier}`);
        } else if (subscriptionId || customerId) {
          const filter = subscriptionId
            ? `stripe_subscription_id.eq.${subscriptionId}`
            : `stripe_customer_id.eq.${customerId}`;

          await supabase
            .from('api_limits')
            .update({
              tier: targetTier,
              subscription_status: finalStatus,
              updated_at: new Date().toISOString(),
            })
            .or(filter);
        }
        break;
      }

      // 4. Actualización de estado de suscripción (cancelación al término, cambio de plan o terminación)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id;
        const userId = subscription.metadata?.userId;

        const status = subscription.status; // active, past_due, unpaid, canceled, incomplete_expired, trialing
        const rawSub = subscription as unknown as { current_period_end?: number };
        const currentPeriodEnd = rawSub.current_period_end
          ? new Date(rawSub.current_period_end * 1000).toISOString()
          : null;

        const isTerminated =
          status === 'canceled' ||
          status === 'unpaid' ||
          status === 'incomplete_expired';

        const tier = isTerminated ? 'free' : 'pro';

        if (userId) {
          await supabase
            .from('api_limits')
            .update({
              tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          console.log(`ℹ️ customer.subscription.updated para usuario ${userId}: status=${status}, tier=${tier}`);
        } else if (subId || customerId) {
          const filter = subId
            ? `stripe_subscription_id.eq.${subId}`
            : `stripe_customer_id.eq.${customerId}`;

          await supabase
            .from('api_limits')
            .update({
              tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .or(filter);
        }
        break;
      }

      // 5. Suscripción cancelada o eliminada definitivamente (revertir a tier free)
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
            p_subscription_status: 'canceled',
          });

          if (error) {
            console.error('Error al revertir tier a "free" para usuario:', error);
          }

          await supabase
            .from('api_limits')
            .update({
              tier: 'free',
              subscription_status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          console.log(`ℹ️ Usuario ${userId} revertido a tier FREE por cancelación definitiva de suscripción.`);
        } else {
          // Revertir buscando por ID de suscripción o cliente
          const { error } = await supabase.rpc('downgrade_user_by_stripe', {
            p_subscription_id: subId,
            p_customer_id: customerId || null,
            p_subscription_status: 'canceled',
          });

          if (error) {
            console.error('Error en downgrade_user_by_stripe:', error);
          }

          const filter = subId
            ? `stripe_subscription_id.eq.${subId}`
            : `stripe_customer_id.eq.${customerId}`;

          await supabase
            .from('api_limits')
            .update({
              tier: 'free',
              subscription_status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .or(filter);

          console.log(`ℹ️ Suscripción ${subId} revertida a nivel FREE en Supabase.`);
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
