import { supabase } from '@/lib/supabase';

/**
 * Función ultra-robusta de eliminación de documentos temporales:
 * Utiliza múltiples capas de red para garantizar la entrega incluso durante
 * el cierre de pestaña, navegación o desmontaje abrupto de componentes:
 * 1. fetch con { keepalive: true } hacia el endpoint /api/storage/cleanup.
 * 2. navigator.sendBeacon como respaldo en navegadores antiguos / móviles.
 * 3. supabase.storage.remove local si el contexto de React sigue vivo.
 */
export async function cleanupUploadedDocument(storagePath?: string | null): Promise<boolean> {
  if (!storagePath || typeof storagePath !== 'string') return false;

  const cleanPath = storagePath.trim().replace(/^user-documents\//, '');
  if (!cleanPath) return false;

  const payload = JSON.stringify({ storagePath: cleanPath });
  let dispatched = false;

  // 1. Intentar fetch con keepalive (estándar moderno de la W3C para llamadas persistentes post-unmount)
  try {
    if (typeof fetch === 'function') {
      fetch('/api/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Ignorar errores silenciosos en red de fondo
      });
      dispatched = true;
    }
  } catch {
    // Si falla fetch keepalive, pasar a sendBeacon
  }

  // 2. Respaldo adicional con navigator.sendBeacon si está disponible
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/storage/cleanup', blob);
      dispatched = true;
    }
  } catch {
    // Silencioso
  }

  // 3. Limpieza inmediata local vía Supabase Client (si el cliente sigue interactivo)
  try {
    await supabase.storage
      .from('user-documents')
      .remove([cleanPath])
      .catch(() => {});
  } catch {
    // Silencioso
  }

  return dispatched;
}

