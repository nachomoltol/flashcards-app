'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from 'react';

interface SplashIntroProps {
  onFinish?: () => void;
  duration?: number; // en ms, default 3000ms
}

export function SplashIntro({ onFinish, duration = 3000 }: SplashIntroProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hasStartedShimmer, setHasStartedShimmer] = useState(false);
  const finishedRef = useRef(false);

  // Trigger para terminar limpiamente
  const handleComplete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish?.();
  }, [onFinish]);

  // Sintetizador Web Audio API ultraligero y cinemático (estilo intro de streaming)
  const playIntroAudio = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Acorde armónico de bienvenida: D4 (293.7 Hz), A4 (440 Hz), D5 (587.3 Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(293.66, now);
      osc1.frequency.exponentialRampToValueAtTime(329.63, now + 1.2);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(587.33, now + 1.2);

      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(587.33, now);
      osc3.frequency.exponentialRampToValueAtTime(880, now + 1.5);

      // Envolvente de volumen suave y progresiva
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.25);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 1.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      osc3.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);

      osc1.stop(now + 1.9);
      osc2.stop(now + 1.9);
      osc3.stop(now + 1.9);
    } catch {
      // Fallback silencioso y no bloqueante para WebViews móviles y políticas restrictivas de autoplay
    }
  }, []);

  useEffect(() => {
    // 1. Tono sonoro a los 0.2s
    const audioTimer = setTimeout(() => {
      playIntroAudio();
    }, 200);

    // 2. Destello de luz (shimmer) diagonal cruzando a los 0.8s
    const shimmerTimer = setTimeout(() => {
      setHasStartedShimmer(true);
    }, 800);

    // 3. Inicio del fade-out de salida (300ms antes de terminar)
    const fadeOutDelay = Math.max(duration - 300, 2500);
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, fadeOutDelay);

    // 4. Finalización total a los 3 segundos
    const finishTimer = setTimeout(() => {
      handleComplete();
    }, duration);

    return () => {
      clearTimeout(audioTimer);
      clearTimeout(shimmerTimer);
      clearTimeout(fadeOutTimer);
      clearTimeout(finishTimer);
    };
  }, [duration, handleComplete, playIntroAudio]);

  // Permitir saltar la intro de inmediato al hacer click/tap
  const handleSkip = () => {
    handleComplete();
  };

  return (
    <div
      onClick={handleSkip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          handleSkip();
        }
      }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-neutral-950 text-white select-none cursor-pointer overflow-hidden transition-opacity duration-300 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Animación de bienvenida de Flashmente. Pulsa para omitir."
    >
      {/* Halo ambiental cinematográfico en el fondo */}
      <div className="absolute w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] rounded-full bg-gradient-to-tr from-indigo-600/30 via-violet-600/25 to-cyan-500/20 blur-3xl pointer-events-none animate-pulse duration-1000" />

      {/* Contenedor central del logo con animación de escala acelerada por GPU */}
      <div className="relative z-10 flex flex-col items-center transform transition-transform duration-1000 ease-out will-change-transform scale-100 animate-in fade-in zoom-in-95">
        {/* Contenedor del Isotipo con haz de luz shimmer */}
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl p-1 bg-gradient-to-br from-indigo-500/40 via-violet-500/20 to-transparent shadow-2xl shadow-indigo-500/30 overflow-hidden flex items-center justify-center">
          {/* Logo SVG / Isotipo de Flashmente */}
          <div className="w-full h-full rounded-[22px] bg-neutral-900/90 backdrop-blur-md flex items-center justify-center relative overflow-hidden border border-indigo-500/30">
            {/* Destello Shimmer diagonal deslizante */}
            <div
              className={`absolute inset-0 pointer-events-none transition-transform duration-1000 ease-in-out z-20 ${
                hasStartedShimmer
                  ? 'translate-x-[250%] opacity-100'
                  : '-translate-x-[150%] opacity-0'
              }`}
              style={{
                background:
                  'linear-gradient(115deg, transparent 0%, rgba(255, 255, 255, 0.05) 30%, rgba(255, 255, 255, 0.6) 50%, rgba(129, 140, 248, 0.8) 55%, transparent 75%)',
                width: '100%',
                height: '100%',
              }}
            />

            {/* Icono oficial de la app Flashmente */}
            <img
              src="/icons/android-chrome-512x512.png"
              alt="Flashmente Logo"
              className="w-full h-full p-2 object-contain rounded-2xl drop-shadow-[0_0_20px_rgba(99,102,241,0.65)] select-none pointer-events-none z-10"
            />
          </div>
        </div>

        {/* Nombre de marca con tipografía cinemática */}
        <div className="mt-5 sm:mt-6 text-center space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent drop-shadow-sm font-sans">
            Flashmente
          </h1>
          <p className="text-[11px] sm:text-xs font-medium tracking-widest uppercase text-indigo-300/70">
            Memorización Inteligente FSRS
          </p>
        </div>
      </div>

      {/* Indicador sutil e interactivo para omitir al hacer tap */}
      <div className="absolute bottom-8 text-[11px] text-neutral-500 font-mono tracking-wider opacity-60 hover:opacity-100 transition-opacity">
        Toca en cualquier lugar para omitir
      </div>
    </div>
  );
}

