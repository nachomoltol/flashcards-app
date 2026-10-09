'use client';

import { useState, useEffect } from 'react';
import { Ticket, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuthStore, useSettingsStore, useTutorialStore, DEFAULT_FSRS_SETTINGS } from '@/stores';
import { redeemPromoCodeAction } from '@/app/actions/redeemPromoCode';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const {
    settings,
    isLoading,
    isSaving,
    error,
    usernameError,
    successMessage,
    fetchSettings,
    updateSettings,
    resetToDefaults,
    clearErrors,
  } = useSettingsStore();
  const { openTutorial } = useTutorialStore();

  // Estado local del formulario
  const [retention, setRetention] = useState<number>(0.90);
  const [maxInterval, setMaxInterval] = useState<number>(365);
  const [fuzz, setFuzz] = useState<boolean>(true);
  const [fullName, setFullName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Estado para el canje de bonos promocionales
  const [promoCode, setPromoCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [promoResult, setPromoResult] = useState<{
    type: 'success' | 'error';
    message: string;
    tier?: string;
  } | null>(null);

  const handleRedeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoCode.trim().toUpperCase();
    if (!clean) return;

    setIsRedeeming(true);
    setPromoResult(null);

    try {
      const result = await redeemPromoCodeAction(clean, user?.id);
      if (result.success) {
        setPromoResult({
          type: 'success',
          message: result.message || '¡Código canjeado con éxito!',
          tier: result.tier,
        });
        setPromoCode('');
      } else {
        setPromoResult({
          type: 'error',
          message: result.message || 'Código no válido o inactivo.',
        });
      }
    } catch {
      setPromoResult({
        type: 'error',
        message: 'Ocurrió un error inesperado al canjear el código.',
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  // Cargar configuración desde Supabase
  useEffect(() => {
    fetchSettings().then((loaded) => {
      if (loaded) {
        setRetention(loaded.request_retention);
        setMaxInterval(loaded.maximum_interval);
        setFuzz(loaded.enable_fuzz);
        setFullName(loaded.full_name);
        setUsername(loaded.username);
      }
    });
  }, [fetchSettings]);

  // Actualizar estado local cuando cargue el store
  useEffect(() => {
    if (!isLoading) {
      setRetention(settings.request_retention);
      setMaxInterval(settings.maximum_interval);
      setFuzz(settings.enable_fuzz);
      setFullName(settings.full_name);
      setUsername(settings.username);
    }
  }, [settings, isLoading]);

  // Detección de cambios sin guardar
  useEffect(() => {
    const isDifferent =
      retention !== settings.request_retention ||
      maxInterval !== settings.maximum_interval ||
      fuzz !== settings.enable_fuzz ||
      fullName !== settings.full_name ||
      username !== settings.username;

    setHasChanges(isDifferent);
  }, [retention, maxInterval, fuzz, fullName, username, settings]);

  const hasUsernameConflict = Boolean(
    usernameError ||
    (error && (error.includes('nombre de usuario ya está en uso') || error.includes('profiles_username_key')))
  );

  // Scroll y foco automático en la sección Datos del Perfil al acceder con hash
  useEffect(() => {
    const handleHash = () => {
      if (typeof window !== 'undefined' && window.location.hash === '#profile-section') {
        const timer = setTimeout(() => {
          const el = document.getElementById('profile-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const input = document.getElementById('full-name-input') as HTMLInputElement | null;
            if (input) {
              input.focus();
            }
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasUsernameConflict) return;
    await updateSettings({
      request_retention: Number(retention),
      maximum_interval: Number(maxInterval),
      enable_fuzz: fuzz,
      full_name: fullName.trim(),
      username: username.trim(),
    });
  };

  const handleReset = async () => {
    if (confirm('¿Restablecer los parámetros FSRS a los valores recomendados por defecto (90% de retención, 365 días de intervalo máximo)?')) {
      await resetToDefaults();
      setRetention(DEFAULT_FSRS_SETTINGS.request_retention);
      setMaxInterval(DEFAULT_FSRS_SETTINGS.maximum_interval);
      setFuzz(DEFAULT_FSRS_SETTINGS.enable_fuzz);
    }
  };

  const retentionPercentage = Math.round(retention * 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-800/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Configuración y Preferencias FSRS</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono font-medium">
              Persistencia Supabase
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Personaliza el algoritmo de repetición espaciada y los parámetros de tu perfil de usuario.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving || isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white text-xs font-medium transition active:scale-95 shrink-0 disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Restablecer FSRS</span>
        </button>
      </div>

      {/* Notificaciones de Éxito / Error */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {error && !hasUsernameConflict && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Sección 1: Parámetros del Algoritmo FSRS */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-6">
          <div className="border-b border-neutral-800/80 pb-4">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Parámetros del Motor FSRS (Free Spaced Repetition Scheduler)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              FSRS modela la estabilidad y dificultad de cada tarjeta para programar intervalos óptimos según tus metas de retención.
            </p>
          </div>

          {/* Parámetro 1: Retención Deseada */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="retention-slider" className="block text-xs font-semibold uppercase tracking-wider text-neutral-200">
                  Retención Deseada (Request Retention)
                </label>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Probabilidad objetivo de recordar la tarjeta en el momento exacto del repaso.
                </p>
              </div>

              {/* Dynamic Badge */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                  retentionPercentage === 90
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : retentionPercentage > 90
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                }`}>
                  {retentionPercentage}% {retentionPercentage === 90 && '• Recomendado'}
                </span>
              </div>
            </div>

            {/* Slider */}
            <div className="pt-2">
              <input
                id="retention-slider"
                type="range"
                min="0.70"
                max="0.99"
                step="0.01"
                value={retention}
                onChange={(e) => setRetention(parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[11px] text-neutral-500 font-mono mt-1">
                <span>70% (Menos repasos)</span>
                <span className="text-emerald-400 font-bold">90% (Óptimo)</span>
                <span>99% (Máxima retención)</span>
              </div>
            </div>

            {/* Guía contextual */}
            <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs leading-relaxed text-neutral-400">
              {retentionPercentage < 85 && (
                <span className="text-amber-400">
                  ⚠️ <strong>Carga de estudio ligera:</strong> Ahorrarás tiempo diario de estudio, pero olvidarás aproximadamente entre un 15% y 30% de tus tarjetas.
                </span>
              )}
              {retentionPercentage >= 85 && retentionPercentage <= 92 && (
                <span className="text-emerald-400">
                  ✨ <strong>Equilibrio recomendado por FSRS:</strong> Maximiza la eficiencia cognitiva con una excelente tasa de retención a largo plazo sin sobrecarga de repasos.
                </span>
              )}
              {retentionPercentage > 92 && (
                <span className="text-indigo-400">
                  🔥 <strong>Alta exigencia:</strong> Ideal para exámenes de alta densidad o certificaciones inmediatas. El número de repasos diarios aumentará significativamente.
                </span>
              )}
            </div>
          </div>

          {/* Parámetro 2: Intervalo Máximo */}
          <div className="space-y-3 pt-3 border-t border-neutral-800/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <label htmlFor="max-interval" className="block text-xs font-semibold uppercase tracking-wider text-neutral-200">
                  Intervalo Máximo (Días)
                </label>
                <p className="text-xs text-neutral-400 mt-0.5">
                  El número máximo de días que FSRS puede espaciar una tarjeta hacia el futuro.
                </p>
              </div>

              {/* Input Numérico */}
              <div className="flex items-center gap-2">
                <input
                  id="max-interval"
                  type="number"
                  min="1"
                  max="36500"
                  value={maxInterval}
                  onChange={(e) => setMaxInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-28 text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-indigo-500 text-right"
                />
                <span className="text-xs text-neutral-400 font-mono">días</span>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { label: '6 meses (180d)', value: 180 },
                { label: '1 año (365d)', value: 365 },
                { label: '3 años (1095d)', value: 1095 },
                { label: '10 años (3650d)', value: 3650 },
                { label: 'Sin límite (36500d)', value: 36500 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setMaxInterval(preset.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                    maxInterval === preset.value
                      ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40'
                      : 'bg-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parámetro 3: Dispersión Anti-Clustering (Fuzz) */}
          <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between gap-4">
            <div>
              <label htmlFor="fuzz-toggle" className="block text-xs font-semibold uppercase tracking-wider text-neutral-200">
                Aleatoriedad Anti-Acumulación (FSRS Fuzz)
              </label>
              <p className="text-xs text-neutral-400 mt-0.5">
                Añade una pequeña variación aleatoria a los intervalos para evitar que cientos de tarjetas se acumulen en el mismo día.
              </p>
            </div>

            <button
              id="fuzz-toggle"
              type="button"
              onClick={() => setFuzz(!fuzz)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out shrink-0 ${
                fuzz ? 'bg-indigo-600' : 'bg-neutral-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  fuzz ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Sección 2: Perfil del Usuario en Supabase */}
        <div id="profile-section" className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-5 scroll-mt-6 transition-all">
          <div className="border-b border-neutral-800/80 pb-4">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Datos del Perfil</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Vinculados a tu identificador único de usuario en Supabase con políticas RLS de seguridad.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="full-name-input" className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                Nombre Completo
              </label>
              <input
                id="full-name-input"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre y apellido..."
                className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label htmlFor="username-input" className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5 flex items-center justify-between">
                <span>Nombre de Usuario</span>
                {hasUsernameConflict && (
                  <span className="text-[10px] text-rose-400 font-medium lowercase">No disponible</span>
                )}
              </label>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (hasUsernameConflict) clearErrors();
                }}
                placeholder="usuario123"
                className={`w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950 border text-white placeholder-neutral-500 focus:outline-none transition ${
                  hasUsernameConflict
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 bg-rose-950/20 shadow-sm shadow-rose-950/30'
                    : 'border-neutral-800 focus:border-indigo-500'
                }`}
                aria-invalid={hasUsernameConflict}
                aria-describedby={hasUsernameConflict ? "username-error-msg" : undefined}
              />
              {hasUsernameConflict && (
                <p id="username-error-msg" className="text-xs text-rose-400 mt-1.5 flex items-center gap-1.5 font-medium animate-in fade-in">
                  <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Este nombre de usuario ya está en uso. Por favor, elige otro.</span>
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Correo Electrónico (Auth)
              </label>
              <input
                type="email"
                disabled
                value={user?.email || 'usuario@supabase.com'}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60 text-neutral-500 cursor-not-allowed font-mono"
              />
            </div>
          </div>
        </div>

        {/* Sección: Suscripción y Bonos Promocionales (VIP / PRO) */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-purple-500/25 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Ticket className="w-4 h-4 text-purple-400" />
                <span>Suscripción y Bonos Promocionales</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  PRO & VIP
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Canjea un código promocional o bono VIP (ej. <span className="text-purple-300 font-mono font-semibold">NACHOVIP</span>) para desbloquear generaciones ilimitadas sin restricciones.
              </p>
            </div>
          </div>

          <div className="pt-2 max-w-xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase());
                  if (promoResult) setPromoResult(null);
                }}
                placeholder="EJ: NACHOVIP"
                className="flex-1 bg-neutral-950/80 border border-neutral-700 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none uppercase tracking-wider font-mono transition"
                disabled={isRedeeming}
              />
              <button
                type="button"
                onClick={handleRedeemPromo}
                disabled={isRedeeming || !promoCode.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-md shadow-purple-600/30"
              >
                {isRedeeming ? (
                  <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Canjear Bono</span>
                )}
              </button>
            </div>

            {promoResult && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in ${
                  promoResult.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                    : 'bg-red-500/15 border border-red-500/30 text-red-200'
                }`}
              >
                {promoResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{promoResult.message}</p>
                  {promoResult.tier && (
                    <p className="text-[11px] opacity-90 mt-0.5">
                      Nivel activo: <span className="uppercase font-bold tracking-wider">{promoResult.tier}</span> (Generaciones ilimitadas)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sección 3: Tutorial y Guía de Bienvenida */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>Tutorial y Guía de Bienvenida</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                ¿Quieres repasar el flujo de carpetas, generación de tarjetas con IA y el algoritmo de repaso espaciado?
              </p>
            </div>

            <button
              type="button"
              onClick={() => openTutorial(0)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-600 text-neutral-200 hover:text-white text-xs sm:text-sm font-medium transition active:scale-95 shrink-0 cursor-pointer shadow-sm group"
            >
              <svg className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Volver a ver el tutorial de bienvenida</span>
            </button>
          </div>
        </div>

        {/* Barra de Acciones */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-neutral-400">
            {hasChanges ? (
              <span className="text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Tienes cambios sin guardar
              </span>
            ) : (
              <span className="text-neutral-500">Ajustes sincronizados con Supabase</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving || !hasChanges || hasUsernameConflict}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-indigo-600/25 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                <span>Guardando cambios...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
