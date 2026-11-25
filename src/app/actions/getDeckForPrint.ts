'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/config/whitelist';
import {
  mintPrintGrantToken,
  verifyPrintGrantToken,
  type PrintGrantMode,
} from '@/lib/printToken';
import {
  getOrGenerateDeckSummaryAction,
  type ExhaustiveDeckSummaryGuide,
} from '@/app/actions/generateDeckSummary';
import type { CardFormat, Database } from '@/types/database';

export interface PrintDeckData {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  cards: {
    id: string;
    front: string;
    back: string;
    card_format: CardFormat | string;
    card_type?: string;
    notes?: string | null;
  }[];
}

export interface PrintGuideData {
  deckId: string;
  deckTitle: string;
  guide: ExhaustiveDeckSummaryGuide;
}

function getServerDbClient(accessToken?: string) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return null;
  }

  if (serviceRoleKey) {
    return createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (accessToken && accessToken.trim() && anonKey) {
    return createClient<Database>(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient<Database>(supabaseUrl, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveAuthenticatedUser(accessToken?: string): Promise<{
  userId: string | null;
  email?: string;
}> {
  // 1. Sesión por cookies en servidor
  try {
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();
    if (cookieUser?.id) {
      return { userId: cookieUser.id, email: cookieUser.email };
    }
  } catch {
    // Siguiente vía
  }

  // 2. Token JWT explícito enviado desde cliente / WebView
  if (accessToken && accessToken.trim()) {
    try {
      const {
        data: { user: tokenUser },
        error: tokenErr,
      } = await supabase.auth.getUser(accessToken.trim());
      if (!tokenErr && tokenUser?.id) {
        return { userId: tokenUser.id, email: tokenUser.email };
      }
    } catch {
      // Sin sesión válida
    }
  }

  return { userId: null };
}

/**
 * Emite un token HMAC de corta duración (20 min) para que Capacitor (iOS / Android)
 * pueda abrir `/decks/[id]/print` en Safari / Chrome externo (`_system`) sin exponer el JWT
 * ni dejar el endpoint abierto sin autenticación.
 */
export async function createPrintGrantAction(
  deckId: string,
  mode: PrintGrantMode = 'exam',
  accessToken?: string
): Promise<{ token?: string; error?: string }> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { error: 'DECK_ID_REQUIRED' };
  }

  const client = getServerDbClient(accessToken);
  if (!client) {
    return { error: 'DB_UNAVAILABLE' };
  }

  const { userId, email } = await resolveAuthenticatedUser(accessToken);
  if (!userId) {
    return { error: 'AUTH_REQUIRED' };
  }

  const { data: deck, error: deckErr } = await client
    .from('decks')
    .select('id, user_id, is_public')
    .eq('id', cleanDeckId)
    .maybeSingle();

  if (deckErr || !deck) {
    return { error: 'DECK_NOT_FOUND' };
  }

  const isOwner = deck.user_id === userId;
  const isPublic = Boolean(deck.is_public);
  if (!isOwner && !isPublic) {
    return { error: 'FORBIDDEN' };
  }

  if (mode === 'guide') {
    let resolvedEmail = email;
    if (!resolvedEmail) {
      const { data: profile } = await client
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      resolvedEmail = profile?.email || undefined;
    }

    const isAdmin = isAdminEmail(resolvedEmail);
    if (!isAdmin) {
      const { data: limits } = await client
        .from('api_limits')
        .select('tier, current_period_end, guides_unlocked_this_month, guides_reset_at')
        .eq('user_id', userId)
        .maybeSingle();

      let tier = (limits?.tier as 'free' | 'pro' | 'vip') || 'free';
      if (
        tier === 'pro' &&
        limits?.current_period_end &&
        new Date(limits.current_period_end).getTime() < Date.now()
      ) {
        tier = 'free';
      }

      const isPro = tier === 'pro' || tier === 'vip';
      if (!isPro) {
        const now = new Date();
        const currentMonthStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
        );
        const resetAt = limits?.guides_reset_at
          ? new Date(limits.guides_reset_at)
          : new Date(0);
        const unlockedThisMonth =
          resetAt.getTime() >= currentMonthStart.getTime()
            ? Number(limits?.guides_unlocked_this_month || 0)
            : 0;

        if (!isOwner || unlockedThisMonth <= 0) {
          return { error: 'GUIDE_LOCKED' };
        }
      }
    }
  }

  return { token: mintPrintGrantToken(cleanDeckId, userId, mode) };
}

/**
 * Carga de forma segura los datos de un mazo para impresión de hoja de examen/estudio.
 * Exige que el mazo sea público (`is_public = true`) o pertenezca al usuario autenticado
 * (verificado por cookie, `accessToken` JWT o `printToken` efímero firmado).
 */
export async function getDeckForPrintAction(
  deckId: string,
  accessToken?: string,
  printToken?: string
): Promise<{
  data?: PrintDeckData;
  error?: string;
  code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVER_ERROR';
}> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { error: 'ID de mazo requerido', code: 'NOT_FOUND' };
  }

  const client = getServerDbClient(accessToken);
  if (!client) {
    return { error: 'Configuración de base de datos no disponible', code: 'SERVER_ERROR' };
  }

  try {
    const { data: deck, error: deckErr } = await client
      .from('decks')
      .select('id, user_id, is_public, title, description, color')
      .eq('id', cleanDeckId)
      .maybeSingle();

    if (deckErr || !deck) {
      return { error: 'Mazo no encontrado', code: 'NOT_FOUND' };
    }

    const { userId: authUserId } = await resolveAuthenticatedUser(accessToken);
    const grantCheck = verifyPrintGrantToken(printToken, cleanDeckId, 'exam');
    const verifiedUserId = authUserId || (grantCheck.valid ? grantCheck.userId || null : null);

    const isOwner = Boolean(verifiedUserId && deck.user_id === verifiedUserId);
    const isPublic = Boolean(deck.is_public);

    if (!isOwner && !isPublic) {
      if (!verifiedUserId) {
        return {
          error:
            'Acceso restringido: este mazo es privado. Inicia sesión con la cuenta propietaria para imprimirlo.',
          code: 'AUTH_REQUIRED',
        };
      }
      return {
        error: 'No tienes permiso para ver ni imprimir este mazo privado.',
        code: 'FORBIDDEN',
      };
    }

    const { data: cards, error: cardsErr } = await client
      .from('cards')
      .select('id, front, back, card_format, card_type, notes')
      .eq('deck_id', cleanDeckId)
      .order('created_at', { ascending: true });

    if (cardsErr) {
      return { error: 'Error al consultar las tarjetas del mazo', code: 'SERVER_ERROR' };
    }

    const safeCards = (cards || []).map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      card_format: c.card_format || 'basic',
      card_type: c.card_type,
      // No exponer notas privadas de estudio a terceros en mazos públicos
      notes: isOwner ? c.notes : null,
    }));

    return {
      data: {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        color: deck.color,
        cards: safeCards,
      },
    };
  } catch (err: unknown) {
    console.error('Error en getDeckForPrintAction:', err);
    return {
      error: err instanceof Error ? err.message : 'Error inesperado al cargar datos de impresión',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Carga de forma segura la Guía de Estudio Rápida completa (`deck_summaries`) para su
 * impresión / exportación PDF en móvil (Safari iOS / Chrome Android) o escritorio.
 * Exige autorización válida (propietario con guía desbloqueada por anuncio, o usuario PRO/VIP/Admin).
 */
export async function getGuideForPrintAction(
  deckId: string,
  locale: 'es' | 'en' = 'es',
  accessToken?: string,
  printToken?: string
): Promise<{
  data?: PrintGuideData;
  error?: string;
  code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVER_ERROR';
}> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { error: 'ID de mazo requerido', code: 'NOT_FOUND' };
  }

  const client = getServerDbClient(accessToken);
  if (!client) {
    return { error: 'Configuración de base de datos no disponible', code: 'SERVER_ERROR' };
  }

  try {
    const { data: deck, error: deckErr } = await client
      .from('decks')
      .select('id, user_id, is_public, title')
      .eq('id', cleanDeckId)
      .maybeSingle();

    if (deckErr || !deck) {
      return { error: 'Mazo no encontrado', code: 'NOT_FOUND' };
    }

    const { userId: authUserId, email: authEmail } = await resolveAuthenticatedUser(accessToken);
    const grantCheck = verifyPrintGrantToken(printToken, cleanDeckId, 'guide');
    const verifiedUserId = authUserId || (grantCheck.valid ? grantCheck.userId || null : null);

    if (!verifiedUserId) {
      return {
        error:
          locale === 'en'
            ? 'Restricted access: sign in and unlock the study guide to export it to PDF.'
            : 'Acceso restringido: inicia sesión y desbloquea la guía de estudio para imprimirla o guardarla en PDF.',
        code: 'AUTH_REQUIRED',
      };
    }

    const isOwner = deck.user_id === verifiedUserId;
    const isPublic = Boolean(deck.is_public);
    if (!isOwner && !isPublic) {
      return {
        error:
          locale === 'en'
            ? 'You do not have permission to print this private study guide.'
            : 'No tienes permiso para imprimir la guía de estudio de este mazo privado.',
        code: 'FORBIDDEN',
      };
    }

    // Si no viene avalado por un printToken de guía recién firmado, comprobar PRO/Admin o desbloqueo mensual
    if (!grantCheck.valid) {
      let resolvedEmail = authEmail;
      if (!resolvedEmail) {
        const { data: profile } = await client
          .from('profiles')
          .select('email')
          .eq('id', verifiedUserId)
          .maybeSingle();
        resolvedEmail = profile?.email || undefined;
      }

      const isAdmin = isAdminEmail(resolvedEmail);
      if (!isAdmin) {
        const { data: limits } = await client
          .from('api_limits')
          .select('tier, current_period_end, guides_unlocked_this_month, guides_reset_at')
          .eq('user_id', verifiedUserId)
          .maybeSingle();

        let tier = (limits?.tier as 'free' | 'pro' | 'vip') || 'free';
        if (
          tier === 'pro' &&
          limits?.current_period_end &&
          new Date(limits.current_period_end).getTime() < Date.now()
        ) {
          tier = 'free';
        }

        const isPro = tier === 'pro' || tier === 'vip';
        if (!isPro) {
          const now = new Date();
          const currentMonthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
          );
          const resetAt = limits?.guides_reset_at
            ? new Date(limits.guides_reset_at)
            : new Date(0);
          const unlockedThisMonth =
            resetAt.getTime() >= currentMonthStart.getTime()
              ? Number(limits?.guides_unlocked_this_month || 0)
              : 0;

          if (!isOwner || unlockedThisMonth <= 0) {
            return {
              error:
                locale === 'en'
                  ? 'Unlock the full study guide first to export or print it as PDF.'
                  : 'Debes desbloquear primero la guía completa para poder imprimirla o exportarla en PDF.',
              code: 'FORBIDDEN',
            };
          }
        }
      }
    }

    // Recuperar guía desde deck_summaries (o generarla si aún no existía)
    const { data: summaryRec } = await client
      .from('deck_summaries')
      .select('guide_data')
      .eq('deck_id', cleanDeckId)
      .maybeSingle();

    if (summaryRec?.guide_data) {
      const rawGuide = summaryRec.guide_data as unknown as ExhaustiveDeckSummaryGuide;
      return {
        data: {
          deckId: deck.id,
          deckTitle: deck.title,
          guide: {
            ...rawGuide,
            title: rawGuide.title || `Guía de Repaso: ${deck.title}`,
            deckTitle: rawGuide.deckTitle || deck.title,
          },
        },
      };
    }

    const genRes = await getOrGenerateDeckSummaryAction(
      cleanDeckId,
      verifiedUserId,
      locale,
      false,
      accessToken
    );
    if (genRes.summary) {
      return {
        data: {
          deckId: deck.id,
          deckTitle: deck.title,
          guide: genRes.summary,
        },
      };
    }

    return {
      error:
        locale === 'en'
          ? 'Study guide not found for this deck. Open the guide in the app first.'
          : 'Aún no se ha generado la guía de estudio para este mazo. Ábrela primero desde el mazo.',
      code: 'NOT_FOUND',
    };
  } catch (err: unknown) {
    console.error('Error en getGuideForPrintAction:', err);
    return {
      error: err instanceof Error ? err.message : 'Error inesperado al cargar la guía para impresión',
      code: 'SERVER_ERROR',
    };
  }
}
