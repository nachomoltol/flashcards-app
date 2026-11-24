'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface DeleteAccountResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Server Action segura que ejecuta el borrado definitivo de una cuenta de usuario
 * mediante el cliente administrativo de Supabase (SUPABASE_SERVICE_ROLE_KEY).
 * Cumple con las directivas de seguridad y eliminación de datos de Google Play Store.
 */
export async function deleteAccountAction(accessToken?: string): Promise<DeleteAccountResult> {
  try {
    // 1. Instanciar cliente administrativo con SUPABASE_SERVICE_ROLE_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Error de configuración: SUPABASE_SERVICE_ROLE_KEY no está definida en las variables de entorno.');
      return {
        success: false,
        error: 'CONFIG_ERROR',
        message: 'Error de configuración en el servidor: SUPABASE_SERVICE_ROLE_KEY no está configurada.',
      };
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 2. Obtener y verificar el ID del usuario activo mediante accessToken JWT (Capacitor / cliente) o sesión del servidor
    let targetUserId: string | undefined;

    if (accessToken && accessToken.trim()) {
      try {
        const {
          data: { user: tokenUser },
          error: tokenErr,
        } = await supabaseAdmin.auth.getUser(accessToken.trim());
        if (!tokenErr && tokenUser?.id) {
          targetUserId = tokenUser.id;
        }
      } catch (tokenCheckErr) {
        console.warn('[deleteAccountAction] Error al validar accessToken:', tokenCheckErr);
      }
    }

    if (!targetUserId) {
      const {
        data: { user: cookieUser },
      } = await supabase.auth.getUser();
      if (cookieUser?.id) {
        targetUserId = cookieUser.id;
      }
    }

    if (!targetUserId) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Debes tener una sesión activa para solicitar la eliminación de tu cuenta.',
      };
    }

    // 3. Limpieza de datos asociados del usuario en la base de datos
    try {
      await supabaseAdmin.from('reviews').delete().eq('user_id', targetUserId);
      await supabaseAdmin.from('deck_summaries').delete().filter('deck_id', 'in', `(select id from decks where user_id = '${targetUserId}')`);
      await supabaseAdmin.from('cards').delete().filter('deck_id', 'in', `(select id from decks where user_id = '${targetUserId}')`);
      await supabaseAdmin.from('decks').delete().eq('user_id', targetUserId);
      await supabaseAdmin.from('user_streaks').delete().eq('user_id', targetUserId);
      await supabaseAdmin.from('profiles').delete().eq('id', targetUserId);
      await supabaseAdmin.from('api_limits').delete().eq('user_id', targetUserId);
    } catch (dbErr) {
      console.warn('Aviso durante la eliminación previa de registros asociados:', dbErr);
    }

    // 4. Eliminar el usuario de Supabase Auth Admin
    const { error: adminError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (adminError) {
      console.error('Error al invocar supabase.auth.admin.deleteUser:', adminError);
      return {
        success: false,
        error: adminError.message,
        message: adminError.message || 'Error al eliminar el usuario en Supabase Auth Admin.',
      };
    }

    return {
      success: true,
      message: 'Cuenta y datos asociados eliminados definitivamente.',
    };
  } catch (err: unknown) {
    console.error('Error inesperado en deleteAccountAction:', err);
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: err instanceof Error ? err.message : 'Error inesperado al eliminar la cuenta.',
    };
  }
}
