'use client';

import { useState, useRef, useEffect } from 'react';
import { Mail, Check, CreditCard, Sparkles } from 'lucide-react';
import { usePlatform } from '@/lib/platform';

export function PrivacyProExemptionText() {
  const platform = usePlatform();
  if (platform.isNativeIOS) return null;
  return (
    <>
      Los usuarios suscritos al plan <strong>Flashmente PRO</strong> están exentos de
      publicidad dentro de la aplicación.{' '}
    </>
  );
}

export function PrivacyStripeProviderBlock() {
  const platform = usePlatform();
  if (platform.isNativeIOS) return null;
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
      <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
        <CreditCard className="w-4 h-4 text-indigo-600" />
        <span>Stripe / Pasarelas Oficiales</span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">
        Para el procesamiento seguro de pagos del plan PRO sin almacenar datos bancarios en
        nuestros servidores.
      </p>
    </div>
  );
}

export function PrivacyTermsModelProSection() {
  const platform = usePlatform();
  if (platform.isNativeIOS) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
        <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span>7.2. Modalidad de acceso y generaciones en iOS</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
          Flashmente para iOS ofrece una experiencia de estudio completa sustentada por anuncios bonificados. El usuario dispone de una cuota mensual gratuita de generación con IA y consulta al tutor socrático, ampliable sin coste alguno mediante la visualización voluntaria de anuncios recompensados de Google AdMob.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
      <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
        <Sparkles className="w-4 h-4 text-amber-600" />
        <span>7.2. Plan Gratuito y Suscripción Flashmente PRO</span>
      </div>
      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
        Flashmente ofrece una <strong>modalidad gratuita</strong> con funciones completas
        de repaso y cuota mensual de generación con IA (ampliable mediante anuncios
        recompensados de Google AdMob), así como una{' '}
        <strong>modalidad de pago (Flashmente PRO)</strong> que elimina la publicidad y
        desbloquea límites ampliados de generación con IA y modos avanzados de estudio. Los
        precios, impuestos incluidos, condiciones de renovación y métodos de cancelación se
        muestran de forma clara y transparente antes de completar cualquier compra. El
        usuario puede gestionar o cancelar su suscripción PRO en cualquier momento sin
        penalización, manteniendo los beneficios contratados hasta el final del periodo de
        facturación en curso.
      </p>
    </div>
  );
}

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

