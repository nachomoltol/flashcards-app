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
export async function deleteAccountAction(userId?: string): Promise<DeleteAccountResult> {
  try {
    let targetUserId = userId;

    // 1. Obtener el ID del usuario activo si no fue proporcionado explícitamente
    if (!targetUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      targetUserId = user?.id;
    }

    if (!targetUserId) {
      return {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Debes tener una sesión activa para solicitar la eliminación de tu cuenta.',
      };
    }

    // 2. Instanciar cliente administrativo con SUPABASE_SERVICE_ROLE_KEY
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

    // 3. Limpieza de datos asociados del usuario en la base de datos
    try {
      await supabaseAdmin.from('reviews').delete().eq('user_id', targetUserId);
      await supabaseAdmin.from('cards').delete().filter('deck_id', 'in', `(select id from decks where user_id = '${targetUserId}')`);
      await supabaseAdmin.from('decks').delete().eq('user_id', targetUserId);
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
