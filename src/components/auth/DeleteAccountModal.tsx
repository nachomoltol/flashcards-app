'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores';
import { deleteAccountAction } from '@/app/actions/deleteAccount';
import { AlertTriangle, Trash2, X, Loader2, AlertCircle } from 'lucide-react';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await deleteAccountAction(user?.id);

      if (!res.success) {
        setErrorMessage(res.message || 'No se pudo eliminar la cuenta. Inténtalo más tarde.');
        setIsDeleting(false);
        return;
      }

      // 1. Limpieza de sesión en Supabase y Zustand
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Aviso en supabase.auth.signOut durante eliminación:', e);
      }

      try {
        await signOut();
      } catch (e) {
        console.warn('Aviso en store.signOut durante eliminación:', e);
      }

      // 2. Limpieza total de almacenamiento local
      if (typeof window !== 'undefined') {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // Ignorar restricciones de almacenamiento
        }
      }

      // 3. Cerrar modal y redirigir a la portada
      onClose();
      router.replace('/');
    } catch (err: unknown) {
      console.error('Error al procesar la eliminación de cuenta:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Error inesperado al intentar eliminar la cuenta.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 border border-red-500/30 p-6 sm:p-7 shadow-2xl shadow-red-950/40 text-left space-y-5 animate-in zoom-in-95 duration-150 relative"
      >
        {/* Botón cerrar */}
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="absolute right-4 top-4 text-neutral-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado con Icono de Advertencia */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 id="delete-account-title" className="text-lg font-bold text-white tracking-tight">
              ¿Eliminar cuenta permanentemente?
            </h3>
            <p className="text-xs text-red-300/90 font-medium mt-0.5">
              Esta acción es completamente irreversible.
            </p>
          </div>
        </div>

        {/* Mensaje de advertencia detallado */}
        <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2 text-xs text-neutral-300 leading-relaxed">
          <p>
            Al confirmar el borrado de tu cuenta de <strong>Flashmente</strong>:
          </p>
          <ul className="space-y-1.5 pl-4 list-disc text-neutral-400">
            <li>
              Se eliminarán de forma definitiva todos tus <strong>mazos, carpetas y flashcards</strong>.
            </li>
            <li>
              Se borrará todo tu <strong>historial de repasos y cálculos de memoria FSRS</strong>.
            </li>
            <li>
              Tu <strong>perfil, progreso y créditos</strong> se revocarán en nuestros servidores.
            </li>
            <li>
              No podrás recuperar tu información aunque vuelvas a registrarte con este correo.
            </li>
          </ul>
        </div>

        {/* Banner de Error (si ocurre alguno) */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-red-300 text-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700/80 text-neutral-300 hover:text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 text-center"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Eliminando...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Sí, eliminar mi cuenta definitivamente</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
