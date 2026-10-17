'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import {
  MessageSquare,
  Bug,
  Lightbulb,
  HelpCircle,
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore, useProfileStore, useLanguageStore, useFeedbackModalStore } from '@/stores';

export type FeedbackCategory =
  | 'Informar de un error'
  | 'Sugerencia de mejora'
  | 'Duda técnica'
  | 'Otro';

interface FeedbackOption {
  value: FeedbackCategory;
  labelKey: string;
  defaultLabel: string;
  icon: typeof Bug;
  colorClass: string;
}

const CATEGORY_OPTIONS: FeedbackOption[] = [
  {
    value: 'Informar de un error',
    labelKey: 'feedback_modal.category_bug',
    defaultLabel: 'Informar de un error',
    icon: Bug,
    colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  {
    value: 'Sugerencia de mejora',
    labelKey: 'feedback_modal.category_feature',
    defaultLabel: 'Sugerencia de mejora',
    icon: Lightbulb,
    colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    value: 'Duda técnica',
    labelKey: 'feedback_modal.category_question',
    defaultLabel: 'Duda técnica',
    icon: HelpCircle,
    colorClass: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  {
    value: 'Otro',
    labelKey: 'feedback_modal.category_other',
    defaultLabel: 'Otro',
    icon: MessageSquare,
    colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
];

interface FeedbackModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function FeedbackModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
}: FeedbackModalProps = {}) {
  const storeIsOpen = useFeedbackModalStore((state) => state.isOpen);
  const storeClose = useFeedbackModalStore((state) => state.closeModal);
  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;

  const { user, session } = useAuthStore();
  const { profile } = useProfileStore();
  const { t } = useLanguageStore();

  const [category, setCategory] = useState<FeedbackCategory>('Informar de un error');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const titleId = useId();
  const descId = useId();

  // Obtener datos automáticos del usuario autenticado en Supabase
  const userEmail = user?.email || profile.email || 'No disponible';
  const rawName =
    profile.full_name ||
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    userEmail.split('@')[0] ||
    'Usuario';
  const displayName = rawName.trim();
  const initial = (displayName.charAt(0) || userEmail.charAt(0) || 'U').toUpperCase();

  const handleClose = useCallback(() => {
    if (isSubmitting) return; // Evitar cierre accidental durante el proceso de envío
    if (propOnClose) {
      propOnClose();
    } else {
      storeClose();
    }
    setStatusMessage(null);
  }, [isSubmitting, propOnClose, storeClose]);

  // Manejo de la tecla Escape para accesibilidad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();

    if (!trimmedMessage || trimmedMessage.length < 5) {
      setStatusMessage({
        type: 'error',
        text: t('feedback_modal.error_empty', 'Por favor, describe tu consulta con al menos 5 caracteres.'),
      });
      return;
    }

    if (trimmedMessage.length > 500) {
      setStatusMessage({
        type: 'error',
        text: t('feedback_modal.error_too_long', 'El mensaje excede el límite máximo de 500 caracteres.'),
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          subject: category,
          message: trimmedMessage,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        const errorText =
          data.message ||
          t('feedback_modal.error_generic', 'No se pudo enviar el mensaje. Inténtalo de nuevo más tarde.');
        setStatusMessage({
          type: 'error',
          text: errorText,
        });
        setIsSubmitting(false);
        return;
      }

      // Al recibir HTTP 200: limpiar formulario, mostrar mensaje de éxito y cerrar en 2 segundos
      setMessage('');
      setCategory('Informar de un error');
      setStatusMessage({
        type: 'success',
        text: t(
          'feedback_modal.success_message',
          '¡Mensaje enviado con éxito! Te responderemos pronto por correo electrónico.'
        ),
      });
      setIsSubmitting(false);

      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: unknown) {
      console.error('Error al enviar formulario de feedback:', err);
      setStatusMessage({
        type: 'error',
        text: t('feedback_modal.error_connection', 'Error de conexión. Comprueba tu red e inténtalo de nuevo.'),
      });
      setIsSubmitting(false);
    }
  };

  const selectedOption =
    CATEGORY_OPTIONS.find((opt) => opt.value === category) || CATEGORY_OPTIONS[0];
  const CategoryIcon = selectedOption.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 sm:p-7 shadow-2xl shadow-neutral-950/20 dark:shadow-purple-950/20 text-left space-y-5 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 relative max-h-[92vh] sm:max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón Cerrar */}
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-700 dark:hover:text-white p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabecera del Modal */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-inner">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 id={titleId} className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {t('feedback_modal.title', 'Soporte y Feedback')}
            </h3>
            <p id={descId} className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
              {t(
                'feedback_modal.subtitle',
                '¿Tienes alguna duda, problema o sugerencia? Cuéntanoslo y te ayudaremos con rapidez.'
              )}
            </p>
          </div>
        </div>

        {/* Tarjeta de Identificación Automática del Usuario */}
        <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800/80 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-600/15 dark:bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-xs shrink-0">
              {initial}
            </div>
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                  {displayName}
                </p>
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verificado
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-mono">
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de "Tipo de Consulta" */}
          <div className="space-y-1.5">
            <label htmlFor="feedback-category-select" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>{t('feedback_modal.category_label', 'Tipo de Consulta')}</span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Campo obligatorio</span>
            </label>

            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600 dark:text-purple-400 flex items-center">
                <CategoryIcon className="w-4 h-4" />
              </div>
              <select
                id="feedback-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                disabled={isSubmitting}
                className="w-full appearance-none bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-300 dark:border-neutral-800 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 py-2"
                  >
                    {t(opt.labelKey, opt.defaultLabel)}
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Accesos rápidos interactivos (Pills) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
              {CATEGORY_OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                const isSelected = category === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    disabled={isSubmitting}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? `${opt.colorClass} ring-1 ring-purple-500/40 font-semibold shadow-sm`
                        : 'border-neutral-200 dark:border-neutral-800/80 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/40'
                    }`}
                  >
                    <OptIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t(opt.labelKey, opt.defaultLabel)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo Textarea para el Mensaje (máximo 500 caracteres) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="feedback-message" className="font-medium text-neutral-700 dark:text-neutral-300">
                {t('feedback_modal.message_label', 'Mensaje')}
              </label>
              <span
                className={`text-[10px] font-mono ${
                  message.length > 450
                    ? 'text-amber-500 dark:text-amber-400 font-bold'
                    : 'text-neutral-400 dark:text-neutral-500'
                }`}
              >
                {message.length} / 500 {message.length < 5 && '(mín. 5)'}
              </span>
            </div>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              maxLength={500}
              placeholder={t(
                'feedback_modal.message_placeholder',
                'Describe qué ha ocurrido, tu sugerencia o tu duda técnica (máximo 500 caracteres)...'
              )}
              className="w-full bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-colors resize-none min-h-[110px] max-h-[180px] disabled:opacity-50"
              required
            />
          </div>

          {/* Mensajes de Estado (Éxito / Error) */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
                statusMessage.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}
              role="alert"
            >
              {statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              <p className="flex-1 leading-relaxed font-medium">{statusMessage.text}</p>
            </div>
          )}

          {/* Botones de Acción */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('common.cancel', 'Cancelar')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || message.trim().length < 5}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-purple-600/25 hover:shadow-purple-600/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                  <span>{t('feedback_modal.btn_sending', 'Enviando mensaje...')}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{t('feedback_modal.btn_submit', 'Enviar Mensaje')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
