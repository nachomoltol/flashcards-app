'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTutorialStore } from '@/stores/useTutorialStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  ChevronRight,
  ChevronLeft,
  X,
  Rocket,
  Sparkles,
} from 'lucide-react';

export const TUTORIAL_STORAGE_KEY = 'flashcards_welcome_tutorial_seen';

interface SlideData {
  step: string;
  badge: string;
  title: string;
  description: string;
  image: string;
  gradient: string;
}

const slides: SlideData[] = [
  {
    step: 'Paso 1 de 12',
    badge: 'Inicio',
    title: 'Crea tu espacio de estudio',
    description:
      'Desde la pantalla principal de tu panel, pulsa el botón destacado + Nuevo para desplegar todas las opciones de creación disponibles.',
    image: '/tutorial/paso-1.jpeg',
    gradient: 'from-blue-600/20 via-indigo-600/10 to-transparent',
  },
  {
    step: 'Paso 2 de 12',
    badge: 'Creación',
    title: 'Personaliza tu temario',
    description:
      'Selecciona Crear Mazo de Estudio, asígnale un nombre descriptivo, elige su color identificativo y pulsa en Crear Mazo de Estudio para guardarlo. (También puedes crear carpetas para organizar o un Atlas Visual para memorizar diagramas).',
    image: '/tutorial/paso-2.jpeg',
    gradient: 'from-purple-600/20 via-indigo-600/10 to-transparent',
  },
  {
    step: 'Paso 3 de 12',
    badge: 'Biblioteca',
    title: 'Gestiona y añade contenido',
    description:
      'Tu mazo recién creado ya aparece en la biblioteca principal. Haz clic sobre su tarjeta o en el icono de engranaje (⚙️) para acceder a su panel de gestión.',
    image: '/tutorial/paso-3.jpeg',
    gradient: 'from-indigo-600/20 via-sky-600/10 to-transparent',
  },
  {
    step: 'Paso 4 de 12',
    badge: 'Generación IA',
    title: 'Generación inteligente o manual',
    description:
      'Dentro del mazo, pulsa el botón principal ✨ Generar preguntas con IA para transformar tus apuntes automáticamente, o utiliza + Añadir tarjeta si prefieres escribirlas tú mismo.',
    image: '/tutorial/paso-4.jpeg',
    gradient: 'from-amber-600/20 via-purple-600/10 to-transparent',
  },
  {
    step: 'Paso 5 de 12',
    badge: 'Formatos',
    title: 'Multi-formato a tu alcance',
    description:
      'En la pestaña Subir Documento, arrastra o selecciona cualquier archivo de tu temario. Es compatible con archivos PDF, Word (.docx), notas de audio (.mp3) o texto plano (.txt).',
    image: '/tutorial/paso-5.jpeg',
    gradient: 'from-emerald-600/20 via-teal-600/10 to-transparent',
  },
  {
    step: 'Paso 6 de 12',
    badge: 'Documento',
    title: 'Archivo cargado y listo',
    description:
      'Comprueba que tu archivo se ha cargado correctamente en la lista y pulsa el botón Continuar al Paso 2 > para configurar las opciones de extracción.',
    image: '/tutorial/paso-6.jpeg',
    gradient: 'from-teal-600/20 via-blue-600/10 to-transparent',
  },
  {
    step: 'Paso 7 de 12',
    badge: 'Tipos de pregunta',
    title: 'Tipos de pregunta a tu medida',
    description:
      'Selecciona el formato que mejor encaje con tu método de estudio: Test (4 opciones), Básica (Pregunta y respuesta directa), Cloze (Rellenar huecos) o Verdadero/Falso.',
    image: '/tutorial/paso-7.jpeg',
    gradient: 'from-pink-600/20 via-purple-600/10 to-transparent',
  },
  {
    step: 'Paso 8 de 12',
    badge: 'Páginas y límites',
    title: 'Control preciso del temario',
    description:
      'Introduce el tramo exacto de páginas que deseas procesar (ej. de la 1 a la 10). En la cantidad de tarjetas, te recomendamos seleccionar siempre el máximo (30 tarjetas) para aprovechar al límite cada tanda.',
    image: '/tutorial/paso-8.jpeg',
    gradient: 'from-blue-600/20 via-violet-600/10 to-transparent',
  },
  {
    step: 'Paso 9 de 12',
    badge: 'Rigor y profundidad',
    title: 'Rigor y profundidad con IA',
    description:
      'Escoge entre enfoque de Estudio / Académico o Docente / Didáctico. Activa el Modo Exhaustivo si necesitas que la IA despiece cada dato, tabla o detalle sin dejar nada atrás. Cuando esté listo, pulsa Extraer tarjetas.',
    image: '/tutorial/paso-9.jpeg',
    gradient: 'from-violet-600/20 via-fuchsia-600/10 to-transparent',
  },
  {
    step: 'Paso 10 de 12',
    badge: 'Marcapáginas',
    title: 'Tu marcapáginas automático',
    description:
      'La IA generará y guardará tus tarjetas por bloques. Si el documento es extenso, utiliza el botón Continuar extrayendo para avanzar en las siguientes páginas desde el punto exacto donde se quedó el motor.',
    image: '/tutorial/paso-10.jpeg',
    gradient: 'from-amber-600/20 via-orange-600/10 to-transparent',
  },
  {
    step: 'Paso 11 de 12',
    badge: 'Tarjetas listas',
    title: 'Todas tus tarjetas listas',
    description:
      'Al cerrar el generador, verás el recuento de tarjetas en tu mazo. Pulsa en Estudiar Mazo para iniciar la sesión con repetición espaciada FSRS, o utiliza modalidades como Modo Pánico o Simulacro.',
    image: '/tutorial/paso-11.jpeg',
    gradient: 'from-emerald-600/20 via-green-600/10 to-transparent',
  },
  {
    step: 'Paso 12 de 12',
    badge: 'Algoritmo FSRS',
    title: 'Califica y fija en la memoria',
    description:
      'Lee la pregunta y pulsa para voltear y ver la solución fundamentada. Califica tu grado de recuerdo con los 4 botones inferiores (1. Fallé, 2. Hard, 3. Good, 4. Easy) para que el algoritmo programe el siguiente repaso en el momento óptimo.',
    image: '/tutorial/paso-12.jpeg',
    gradient: 'from-indigo-600/25 via-violet-600/15 to-transparent',
  },
];

export function WelcomeTutorial() {
  const { isOpen, initialSlide, closeTutorial, openTutorial } = useTutorialStore();
  const { user, isLoading } = useAuthStore();
  const [currentSlide, setCurrentSlide] = useState(0);

  // Verificación automática garantizada tras cargar la sesión del usuario
  useEffect(() => {
    if (isLoading) return;

    try {
      const hasSeen = localStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (!hasSeen) {
        const timer = setTimeout(() => {
          openTutorial(0);
        }, 350);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      console.warn('Error leyendo localStorage para el tutorial:', e);
    }
  }, [openTutorial, isLoading, user?.id]);

  // Sincronizar el slide inicial cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(initialSlide || 0);
    }
  }, [isOpen, initialSlide]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('Error guardando flag de tutorial:', e);
    }
    closeTutorial();
  }, [closeTutorial]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  // Soporte de navegación por teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      } else if (e.key === 'ArrowRight') {
        if (currentSlide < slides.length - 1) {
          setCurrentSlide((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentSlide > 0) {
          setCurrentSlide((prev) => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlide, handleDismiss]);

  if (!isOpen) return null;

  const current = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial paso a paso de Flashmente"
    >
      <div
        className="relative w-full max-w-md sm:max-w-lg rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-neutral-950/20 dark:shadow-black overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        style={{ maxHeight: '94vh' }}
      >
        {/* Glow de fondo dinámico según el slide */}
        <div
          className={`absolute top-0 inset-x-0 h-40 bg-gradient-to-b ${current.gradient} pointer-events-none transition-all duration-500`}
        />

        {/* Barra superior con badge de paso y botón cerrar */}
        <div className="relative flex items-center justify-between px-5 pt-4 pb-2 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700/60 text-purple-800 dark:text-purple-300 font-mono">
              {current.step}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              {current.badge}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 px-2 py-1 transition cursor-pointer"
            >
              Saltar
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              aria-label="Cerrar tutorial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido principal del slide con scroll si es necesario */}
        <div className="relative px-5 py-2 flex-1 overflow-y-auto space-y-3.5 z-10 text-center sm:text-left scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-800">
          {/* Título y Descripción */}
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-snug">
              {current.title}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Marco de Captura Visual Responsivo */}
          <div className="relative mx-auto w-full max-w-[270px] sm:max-w-[310px] aspect-[9/19.5] max-h-[46vh] sm:max-h-[50vh] rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800/90 shadow-xl bg-neutral-950 flex items-center justify-center">
            <Image
              src={current.image}
              alt={current.title}
              fill
              sizes="(max-width: 640px) 270px, 310px"
              className="object-contain object-top"
              priority={currentSlide === 0}
            />
          </div>
        </div>

        {/* Barra de control inferior: Progreso y botones de navegación */}
        <div className="relative px-5 py-3.5 bg-neutral-50 dark:bg-neutral-950/90 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 z-10 shrink-0">
          {/* Indicadores de diapositiva (Dots compactos) */}
          <div className="flex items-center gap-1 sm:gap-1.5" aria-label="Indicador de diapositiva">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Ir a la diapositiva ${idx + 1}`}
                className={`transition-all duration-300 rounded-full h-1.5 ${
                  idx === currentSlide
                    ? 'w-4 sm:w-5 bg-purple-600 dark:bg-purple-500 shadow-sm shadow-purple-500/50'
                    : 'w-1.5 bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600'
                }`}
              />
            ))}
          </div>

          {/* Botones de navegación */}
          <div className="flex items-center gap-2">
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white text-xs font-medium transition active:scale-95 cursor-pointer shadow-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Anterior</span>
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-purple-600/30 transition active:scale-95 cursor-pointer animate-pulse"
              >
                <span>¡A Estudiar!</span>
                <Rocket className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-purple-600/20 transition active:scale-95 cursor-pointer"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
