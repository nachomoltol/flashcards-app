'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTutorialStore } from '@/stores/useTutorialStore';
import {
  FolderTree,
  Sparkles,
  Brain,
  Rocket,
  ChevronRight,
  ChevronLeft,
  X,
  FileText,
  FileCode,
  CheckCircle2,
  Clock,
  Layers,
  Settings,
} from 'lucide-react';

export const TUTORIAL_STORAGE_KEY = 'flashcards_welcome_tutorial_seen';

interface SlideData {
  step: string;
  badge: string;
  title: string;
  description: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
  renderIcon: () => React.ReactNode;
  renderIllustration: () => React.ReactNode;
}

const slides: SlideData[] = [
  // Slide 1
  {
    step: '1 de 5',
    badge: 'Organización',
    title: 'Crea tu primera Carpeta',
    description:
      'El primer paso es organizarte. Pulsa el botón principal \'+ Nuevo\' para crear una Carpeta para tu asignatura o tema. Dentro de ella, podrás crear subcarpetas y tus mazos de estudio.',
    gradient: 'from-blue-600/20 via-indigo-600/10 to-transparent',
    iconBg: 'bg-blue-500/15 border-blue-500/30',
    iconColor: 'text-blue-400',
    renderIcon: () => <FolderTree className="w-6 h-6" />,
    renderIllustration: () => (
      <div className="w-full bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800/60">
          <div className="flex items-center gap-2">
            <span className="text-sm">📁</span>
            <span className="text-xs font-semibold text-white">Biblioteca</span>
          </div>
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-bold shadow-sm">
            <span>+</span>
            <span>Nuevo</span>
          </div>
        </div>
        <div className="pl-3 sm:pl-4 space-y-2 border-l-2 border-amber-500/40">
          <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/80 border border-neutral-800 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm">📁</span>
              <span className="text-xs font-medium text-neutral-200">Carpeta: Asignatura</span>
            </div>
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-mono">
              Organizador
            </span>
          </div>
          <div className="pl-3 sm:pl-4 border-l border-neutral-800 space-y-1.5">
            <div className="flex items-center justify-between p-1.5 rounded-lg bg-neutral-900/50 border border-neutral-800/60 text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🃏</span>
                <span className="text-[11px] text-neutral-300">Mazo de Estudio</span>
              </div>
              <span className="text-[10px] text-indigo-400 font-mono">FSRS</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  // Slide 2
  {
    step: '2 de 5',
    badge: 'Inteligencia Artificial',
    title: 'Genera preguntas al instante',
    description:
      'Una vez creado un mazo, entra en él y pulsa \'Generar preguntas con IA\'. Sube tus apuntes en PDF, Word, un audio o pega un enlace de YouTube. Nosotros extraeremos las flashcards por ti.',
    gradient: 'from-purple-600/20 via-pink-600/10 to-transparent',
    iconBg: 'bg-purple-500/15 border-purple-500/30',
    iconColor: 'text-purple-400',
    renderIcon: () => <Sparkles className="w-6 h-6" />,
    renderIllustration: () => (
      <div className="w-full bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col items-center gap-1.5">
            <FileText className="w-4 h-4 text-rose-400" />
            <span className="text-[11px] font-medium text-neutral-300">PDFs</span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col items-center gap-1.5">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="text-[11px] font-medium text-neutral-300">Word .docx</span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col items-center gap-1.5">
            <svg className="w-4 h-4 text-red-500 fill-current" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="text-[11px] font-medium text-neutral-300">YouTube</span>
          </div>
          <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-medium text-neutral-300">Audios MP3</span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Extracción inteligente por bloques de hasta 30 tarjetas.</span>
        </div>
      </div>
    ),
  },

  // Slide 3
  {
    step: '3 de 5',
    badge: 'El arte del repaso',
    title: 'El arte del repaso',
    description:
      'Al estudiar, lee la pregunta y piensa la respuesta. Luego mira la respuesta y sé honesto: pulsa 1, 2, 3 o 4 según te haya costado recordarlo. El algoritmo calculará el día exacto para volvértela a mostrar.',
    gradient: 'from-emerald-600/20 via-teal-600/10 to-transparent',
    iconBg: 'bg-emerald-500/15 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    renderIcon: () => <Brain className="w-6 h-6" />,
    renderIllustration: () => (
      <div className="w-full bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          <div className="p-2 sm:p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
            <span className="block text-[11px] font-bold text-red-400">1. Again</span>
            <span className="text-[9px] text-neutral-400">Repetir</span>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
            <span className="block text-[11px] font-bold text-amber-400">2. Hard</span>
            <span className="text-[9px] text-neutral-400">Difícil</span>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
            <span className="block text-[11px] font-bold text-blue-400">3. Good</span>
            <span className="text-[9px] text-neutral-400">Bien</span>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
            <span className="block text-[11px] font-bold text-emerald-400">4. Easy</span>
            <span className="text-[9px] text-neutral-400">Fácil</span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Clock className="w-3.5 h-3.5" /> Algoritmo FSRS de Repetición Espaciada
          </span>
          <span className="font-mono text-neutral-300">Teclas 1, 2, 3, 4</span>
        </div>
      </div>
    ),
  },

  // Slide 4
  {
    step: '4 de 5',
    badge: 'Edición y Gestión',
    title: 'Edita y organiza a tu gusto',
    description:
      '¿Te has equivocado al crear algo? No pasa nada. Usa el botón del engranaje (⚙️) que verás junto a cualquier mazo o carpeta para cambiarle el nombre, el color o eliminarlo.',
    gradient: 'from-amber-600/20 via-orange-600/10 to-transparent',
    iconBg: 'bg-amber-500/15 border-amber-500/30',
    iconColor: 'text-amber-400',
    renderIcon: () => <Settings className="w-6 h-6" />,
    renderIllustration: () => (
      <div className="w-full bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
        {/* Mockup Card con Botón de Engranaje */}
        <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-indigo-500" />
            <div className="text-left">
              <span className="text-xs font-bold text-white block">Mazo de Estudio</span>
              <span className="text-[10px] text-neutral-400">20 tarjetas</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30">
              Estudiar
            </span>
            <div className="p-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center animate-pulse">
              <Settings className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Menú de Opciones */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-800/80 text-neutral-300 flex flex-col items-center gap-1">
            <span className="text-sm">✏️</span>
            <span>Editar nombre</span>
          </div>
          <div className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-800/80 text-neutral-300 flex flex-col items-center gap-1">
            <span className="text-sm">🎨</span>
            <span>Cambiar color</span>
          </div>
          <div className="p-2 rounded-xl bg-neutral-900/90 border border-rose-500/20 text-rose-300 flex flex-col items-center gap-1">
            <span className="text-sm">🗑️</span>
            <span>Eliminar</span>
          </div>
        </div>
      </div>
    ),
  },

  // Slide 5
  {
    step: '5 de 5',
    badge: 'Comienza ahora',
    title: 'Tu turno. ¡A jugar!',
    description:
      'Te hemos dejado un mazo llamado \'Guía Rápida\' en tu panel. Ábrelo ahora mismo y dale a \'Estudiar\' para hacer tu primera sesión de prueba y entender la dinámica.',
    gradient: 'from-indigo-600/25 via-violet-600/15 to-transparent',
    iconBg: 'bg-indigo-500/20 border-indigo-500/40',
    iconColor: 'text-indigo-400',
    renderIcon: () => <Rocket className="w-6 h-6" />,
    renderIllustration: () => (
      <div className="w-full bg-neutral-950/70 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-indigo-950/50 to-neutral-900 border border-indigo-500/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Layers className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h4 className="text-xs sm:text-sm font-bold text-white">Guía Rápida</h4>
              <p className="text-[11px] text-indigo-300">5 tarjetas interactivas de prueba</p>
            </div>
          </div>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-sm">
            Listo para estudiar
          </span>
        </div>
        <p className="text-[11px] text-neutral-400 text-left">
          💡 Puedes voltear tarjetas haciendo clic o con la tecla <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono text-[10px]">Espacio</kbd>.
        </p>
      </div>
    ),
  },
];

export function WelcomeTutorial() {
  const { isOpen, initialSlide, closeTutorial, openTutorial } = useTutorialStore();
  const [currentSlide, setCurrentSlide] = useState(0);

  // Verificación automática en el primer acceso
  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (!hasSeen) {
        openTutorial(0);
      }
    } catch (e) {
      console.warn('Error leyendo localStorage para el tutorial:', e);
    }
  }, [openTutorial]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial de bienvenida"
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-neutral-900 border border-neutral-800/90 shadow-2xl shadow-black overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        style={{ maxHeight: '92vh' }}
      >
        {/* Glow de fondo dinámico según el slide */}
        <div
          className={`absolute top-0 inset-x-0 h-44 bg-gradient-to-b ${current.gradient} pointer-events-none transition-all duration-500`}
        />

        {/* Barra superior con navegación y botón cerrar */}
        <div className="relative flex items-center justify-between px-6 pt-5 pb-2 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-neutral-800 border border-neutral-700/80 text-neutral-300 font-mono">
              {current.step}
            </span>
            <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
              {current.badge}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition cursor-pointer"
            aria-label="Cerrar tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido principal del slide */}
        <div className="relative px-6 py-4 flex-1 overflow-y-auto space-y-5 text-center sm:text-left z-10">
          {/* Cabecera con Icono y Título */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-lg shrink-0 ${current.iconBg} ${current.iconColor}`}
            >
              {current.renderIcon()}
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {current.title}
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300 mt-1 leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          {/* Ilustración interactiva / visual específica del slide */}
          <div className="pt-1">
            {current.renderIllustration()}
          </div>
        </div>

        {/* Barra de control inferior: Dots y botones de navegación */}
        <div className="relative px-6 py-4 bg-neutral-950/80 border-t border-neutral-800/80 flex items-center justify-between gap-3 z-10">
          {/* Indicadores de diapositiva (Dots) */}
          <div className="flex items-center gap-1.5" aria-label="Indicador de diapositiva">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Ir a la diapositiva ${idx + 1}`}
                className={`transition-all duration-300 rounded-full h-2 ${
                  idx === currentSlide
                    ? 'w-6 bg-indigo-500 shadow-sm shadow-indigo-500/50'
                    : 'w-2 bg-neutral-700 hover:bg-neutral-600'
                }`}
              />
            ))}
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2">
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition active:scale-95 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer animate-pulse"
              >
                <span>¡A jugar!</span>
                <Rocket className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium shadow-md shadow-indigo-600/20 transition active:scale-95 cursor-pointer"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
