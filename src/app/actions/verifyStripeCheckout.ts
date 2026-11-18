'use server';

import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (url && serviceKey) {
    return createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

export interface VerifyStripeSessionResult {
  success: boolean;
  tier?: 'pro' | 'free';
  status?: string;
  error?: string;
}

/**
 * Server Action para verificación síncrona post-checkout de Stripe.
 * Permite que al retornar a la web con `?stripe_status=success&session_id=cs_...`,
 * el estado PRO se active inmediatamente en la base de datos sin depender de la
 * latencia del webhook asíncrono (SUB-03).
 */
export async function verifyStripeCheckoutSessionAction(
  sessionId?: string | null,
  accessToken?: string
): Promise<VerifyStripeSessionResult> {
  const cleanSessionId = sessionId?.trim();
  if (!cleanSessionId || !cleanSessionId.startsWith('cs_')) {
    return { success: false, error: 'INVALID_SESSION_ID' };
  }

  try {
    // 1. Obtener usuario autenticado de forma estricta
    let authenticatedUserId: string | null = null;
    if (accessToken && accessToken.trim()) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser(accessToken.trim());
        if (user?.id) authenticatedUserId = user.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) authenticatedUserId = user.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId) {
      return { success: false, error: 'AUTH_REQUIRED' };
    }

    // 2. Consultar directamente a la API de Stripe
    const session = await stripe.checkout.sessions.retrieve(cleanSessionId, {
      expand: ['subscription'],
    });

    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    const sessionUserId = session.client_reference_id || session.metadata?.userId;

    // Verificar que la sesión corresponda al usuario autenticado (anti-suplantación)
    if (!sessionUserId || sessionUserId !== authenticatedUserId) {
      console.warn('[verifyStripeCheckoutSessionAction] Discrepancia en sesión de Stripe:', {
        sessionUserId,
        authenticatedUserId,
      });
      return { success: false, error: 'SESSION_MISMATCH' };
    }

    if (!isPaid) {
      return { success: false, status: session.status || 'unpaid', error: 'NOT_PAID' };
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscription =
      typeof session.subscription === 'object' && session.subscription
        ? session.subscription
        : null;
    const subscriptionId =
      subscription?.id || (typeof session.subscription === 'string' ? session.subscription : null);

    let currentPeriodEnd: string | null = null;
    let subscriptionStatus = 'active';

    if (subscription) {
      subscriptionStatus = subscription.status || 'active';
      const rawSub = subscription as unknown as { current_period_end?: number };
      if (rawSub.current_period_end) {
        currentPeriodEnd = new Date(rawSub.current_period_end * 1000).toISOString();
      }
    }

    // 3. Actualizar inmediatamente en base de datos con privilegios service_role
    const db = getServerSupabaseClient();

    await db.rpc('set_user_tier', {
      p_user_id: authenticatedUserId,
      p_tier: 'pro',
      p_customer_id: customerId || null,
      p_subscription_id: subscriptionId || null,
      p_current_period_end: currentPeriodEnd,
      p_subscription_status: subscriptionStatus,
    });

    await db
      .from('api_limits')
      .update({
        tier: 'pro',
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        current_period_end: currentPeriodEnd,
        subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', authenticatedUserId);

    console.log(
      `[verifyStripeCheckoutSessionAction] ✅ Usuario ${authenticatedUserId} verificado y ascendido a PRO síncronamente.`
    );

    return {
      success: true,
      tier: 'pro',
      status: subscriptionStatus,
    };
  } catch (err) {
    console.error('[verifyStripeCheckoutSessionAction] Error:', err);
    return { success: false, error: 'VERIFY_ERROR' };
  }
}
