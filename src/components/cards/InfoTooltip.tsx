'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface InfoTooltipProps {
  content: React.ReactNode;
  title?: string;
  placement?: 'top' | 'bottom';
}

export function InfoTooltip({ content, title }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const modalNode = isOpen && mounted && typeof document !== 'undefined' ? (
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'info-modal-title' : undefined}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => setIsOpen(false)}
      >
        <div
          className="w-[90vw] max-w-md mx-auto p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
            <h3 id="info-modal-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>💡</span>
              <span>{title || 'Información de Ayuda'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              aria-label="Cerrar diálogo de ayuda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Cuerpo */}
          <div className="max-h-[65vh] overflow-y-auto pr-1 text-xs sm:text-sm text-slate-700 dark:text-neutral-300 leading-relaxed space-y-3">
            {content}
          </div>

          {/* Pie */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm transition shadow-md shadow-violet-600/20 active:scale-95 cursor-pointer text-center"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <span className="inline-flex items-center align-middle">
      <button
        type="button"
        aria-label="Más información"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="w-4 h-4 rounded-full bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center text-[10px] font-bold font-mono transition-colors cursor-pointer ml-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        ?
      </button>

      {modalNode}
    </span>
  );
}

