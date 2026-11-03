'use client';

import { useState, useRef, useEffect } from 'react';
import { Mail, Check } from 'lucide-react';

export function DeleteAccountRequestButton() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    const targetEmail = 'nachomoltol@gmail.com';
    const mailtoUrl =
      'mailto:nachomoltol@gmail.com?subject=Eliminar%20cuenta&body=Hola,%20solicito%20la%20eliminaci%C3%B3n%20completa%20de%20mi%20cuenta%20de%20Flashmente%20y%20todos%20los%20datos%20asociados.';

    // a) Intento de apertura nativa del gestor de correo
    try {
      window.location.href = mailtoUrl;
    } catch (e) {
      console.warn('No se pudo abrir el cliente de correo automáticamente:', e);
    }

    // b) Copiado al portapapeles de forma resiliente
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetEmail);
      }
    } catch (err) {
      console.warn('Error al copiar correo al portapapeles:', err);
    }

    // c) Cambio visual de estado durante 3 segundos
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
    }, 3000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-live="polite"
      className={`inline-flex items-center gap-2 px-4 py-2 text-white font-medium text-xs rounded-lg transition-all duration-200 cursor-pointer shadow-xs active:scale-95 ${
        copied
          ? 'bg-emerald-600 hover:bg-emerald-700'
          : 'bg-slate-900 hover:bg-slate-800'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-white animate-in zoom-in-50 duration-200" />
          <span>¡Correo copiado! Abriendo gestor...</span>
        </>
      ) : (
        <>
          <Mail className="w-3.5 h-3.5" />
          <span>Enviar solicitud</span>
        </>
      )}
    </button>
  );
}

