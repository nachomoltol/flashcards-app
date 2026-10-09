'use client';

import React, { useState, useEffect } from 'react';
import { useDeckStore, useLanguageStore, type DeckWithStats } from '@/stores';
import type { DeckRow } from '@/stores/useDeckStore';

interface ShareDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckWithStats | DeckRow | null;
}

export function ShareDeckModal({ isOpen, onClose, deck }: ShareDeckModalProps) {
  const { shareDeck } = useDeckStore();
  const { t } = useLanguageStore();
  const [shareId, setShareId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !deck) {
      setShareId(null);
      setCopied(false);
      return;
    }

    const initShare = async () => {
      if (deck.share_id && deck.is_public) {
        setShareId(deck.share_id);
      } else {
        setIsGenerating(true);
        const generatedId = await shareDeck(deck.id);
        setShareId(generatedId);
        setIsGenerating(false);
      }
    };

    initShare();
  }, [isOpen, deck, shareDeck]);

  if (!isOpen || !deck) return null;

  const shareUrl = shareId ? `${origin}/shared/${shareId}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Error copiando al portapapeles:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg shadow-sm">
              🔗
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {t('share_modal.title')}
              </h3>
              <p className="text-xs text-neutral-400">
                {t('share_modal.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Deck Card Summary */}
        <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 flex items-center gap-3">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: deck.color || '#6366f1' }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              {deck.title}
            </p>
            <p className="text-xs text-neutral-400 truncate">
              {deck.description || t('share_modal.no_desc')}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {t('share_modal.public_badge')}
          </span>
        </div>

        {/* Share Link Area */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            {t('share_modal.link_label')}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                readOnly
                value={isGenerating ? t('share_modal.generating_link') : shareUrl}
                className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300 focus:outline-none focus:border-indigo-500 transition select-all pr-8"
              />
            </div>
            <button
              type="button"
              disabled={isGenerating || !shareUrl}
              onClick={handleCopy}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 shrink-0 shadow-md active:scale-95 ${
                copied
                  ? 'bg-emerald-600 text-white shadow-emerald-600/25'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25 disabled:opacity-50'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t('share_modal.copied')}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{t('share_modal.copy')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Informative Note */}
        <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-indigo-200/90 leading-relaxed flex items-start gap-2">
          <span className="text-base shrink-0">💡</span>
          <div>
            {t('share_modal.note')}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-neutral-800">
          {shareUrl ? (
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 transition hover:underline"
            >
              <span>{t('share_modal.view_public_page')}</span>
              <span>↗</span>
            </a>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-xl hover:bg-neutral-800 transition"
          >
            {t('share_modal.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
