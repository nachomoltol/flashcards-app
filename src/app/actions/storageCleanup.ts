'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

function getStorageAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://placeholder.supabase.co';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    console.warn(
      '[storageCleanup] Advertencia: SUPABASE_SERVICE_ROLE_KEY no está configurada.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Elimina un archivo específico del bucket 'user-documents' desde el backend
 * garantizando que la operación no dependa del ciclo de vida del cliente.
 */
export async function deleteDocumentAction(storagePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!storagePath || typeof storagePath !== 'string') {
      return { success: false, error: 'storagePath inválido' };
    }

    // Limpieza de ruta por si viene con prefijos o URLs completas
    let cleanPath = storagePath.trim();
    if (cleanPath.startsWith('user-documents/')) {
      cleanPath = cleanPath.replace(/^user-documents\//, '');
    }

    // Blindaje IDOR: Verificar que el archivo pertenezca al usuario autenticado
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && !cleanPath.startsWith(`${user.id}/`)) {
      console.warn(`[storageCleanup] Intento no autorizado de eliminar archivo ajeno: ${cleanPath} por usuario: ${user.id}`);
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const admin = getStorageAdminClient();
    const { error } = await admin.storage.from('user-documents').remove([cleanPath]);

    if (error) {
      console.error('[storageCleanup.deleteDocumentAction] Error eliminando archivo:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[storageCleanup.deleteDocumentAction] Excepción:', message);
    return { success: false, error: message };
  }
}

/**
 * Rutina periódica de purga automática:
 * Inspecciona todos los archivos del bucket 'user-documents' y elimina
 * aquellos cuya antigüedad supere el umbral especificado (por defecto 2 horas).
 */
export async function purgeExpiredDocumentsAction(
  hoursThreshold = 2
): Promise<{ success: boolean; purgedCount: number; purgedFiles: string[]; error?: string }> {
  try {
    const admin = getStorageAdminClient();
    const bucket = 'user-documents';
    const now = Date.now();
    const maxAgeMs = hoursThreshold * 60 * 60 * 1000;

    // 1. Listar todas las carpetas raíz (representan user_ids)
    const { data: rootItems, error: listError } = await admin.storage.from(bucket).list('', {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (listError) {
      console.error('[storageCleanup.purgeExpiredDocumentsAction] Error listando raíz:', listError);
      return { success: false, purgedCount: 0, purgedFiles: [], error: listError.message };
    }

    const filesToDelete: string[] = [];

    // 2. Iterar sobre cada carpeta de usuario
    if (rootItems && rootItems.length > 0) {
      for (const item of rootItems) {
        // En Supabase Storage, las carpetas no tienen id ni metadata
        if (!item.id) {
          const folderName = item.name;
          const { data: filesInFolder, error: folderErr } = await admin.storage
            .from(bucket)
            .list(folderName, { limit: 1000 });

          if (!folderErr && filesInFolder) {
            for (const file of filesInFolder) {
              if (file.created_at) {
                const createdAtMs = new Date(file.created_at).getTime();
                if (now - createdAtMs > maxAgeMs) {
                  filesToDelete.push(`${folderName}/${file.name}`);
                }
              }
            }
          }
        } else {
          // Archivo directo en la raíz (si existiese)
          if (item.created_at) {
            const createdAtMs = new Date(item.created_at).getTime();
            if (now - createdAtMs > maxAgeMs) {
              filesToDelete.push(item.name);
            }
          }
        }
      }
    }

    // 3. Eliminar en lote los archivos que superen las 2 horas
    if (filesToDelete.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(filesToDelete);
      if (removeError) {
        console.error('[storageCleanup.purgeExpiredDocumentsAction] Error al purgar lote:', removeError);
        return { success: false, purgedCount: 0, purgedFiles: [], error: removeError.message };
      }

      console.info(
        `[storageCleanup.purgeExpiredDocumentsAction] Purgados exitosamente ${filesToDelete.length} archivos expirados (> ${hoursThreshold}h).`
      );
    }

    return {
      success: true,
      purgedCount: filesToDelete.length,
      purgedFiles: filesToDelete,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[storageCleanup.purgeExpiredDocumentsAction] Excepción:', message);
    return { success: false, purgedCount: 0, purgedFiles: [], error: message };
  }
}

