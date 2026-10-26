'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseExamTimerOptions {
  initialMinutes: number; // 0 significa sin límite (cronómetro ascendente)
  onTimeUp?: () => void;
  autoStart?: boolean;
}

export interface ExamTimer {
  seconds: number; // segundos restantes si hay límite, o transcurridos si es 0
  formattedTime: string; // "mm:ss" o "hh:mm:ss"
  isRunning: boolean;
  isUrgent: boolean; // últimos 60 segundos con límite de tiempo
  hasTimeLimit: boolean;
  start: () => void;
  pause: () => void;
  reset: (newMinutes?: number) => void;
  elapsedSeconds: number;
}

export function formatSeconds(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function useExamTimer({
  initialMinutes,
  onTimeUp,
  autoStart = false,
}: UseExamTimerOptions): ExamTimer {
  const hasTimeLimit = initialMinutes > 0;
  const initialSeconds = hasTimeLimit ? initialMinutes * 60 : 0;

  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(autoStart);

  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  // Si cambia initialMinutes desde fuera y no está corriendo, sincronizar
  const initialMinutesRef = useRef(initialMinutes);
  useEffect(() => {
    if (initialMinutesRef.current !== initialMinutes) {
      initialMinutesRef.current = initialMinutes;
      const sec = initialMinutes > 0 ? initialMinutes * 60 : 0;
      setSeconds(sec);
      setElapsedSeconds(0);
    }
  }, [initialMinutes]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);

      if (hasTimeLimit) {
        setSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsRunning(false);
            if (onTimeUpRef.current) {
              onTimeUpRef.current();
            }
            return 0;
          }
          return prev - 1;
        });
      } else {
        // Sin límite: cuenta ascendente
        setSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, hasTimeLimit]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(
    (newMinutes?: number) => {
      setIsRunning(false);
      const targetMin = typeof newMinutes === 'number' ? newMinutes : initialMinutesRef.current;
      const targetSec = targetMin > 0 ? targetMin * 60 : 0;
      setSeconds(targetSec);
      setElapsedSeconds(0);
    },
    []
  );

  const isUrgent = hasTimeLimit && seconds <= 60 && seconds > 0;

  return {
    seconds,
    formattedTime: formatSeconds(seconds),
    isRunning,
    isUrgent,
    hasTimeLimit,
    start,
    pause,
    reset,
    elapsedSeconds,
  };
}
