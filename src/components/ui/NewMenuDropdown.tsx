'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores';
import { Plus, ChevronDown, Folder, FileText, Map } from 'lucide-react';

interface NewMenuDropdownProps {
  className?: string;
  buttonClassName?: string;
  onSelectDeck?: () => void;
  onSelectFolder?: () => void;
}

export function NewMenuDropdown({
  className = '',
  buttonClassName,
  onSelectDeck,
  onSelectFolder,
}: NewMenuDropdownProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { t } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o presionar Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleDeckClick = () => {
    setIsOpen(false);
    if (onSelectDeck) {
      onSelectDeck();
    } else {
      const folderId = searchParams.get('folder');
      const basePath = pathname.startsWith('/decks') ? '/decks' : '/';
      const targetUrl = folderId
        ? `${basePath}?create=deck&folder=${encodeURIComponent(folderId)}`
        : `${basePath}?create=deck`;
      router.push(targetUrl);
    }
  };

  const handleFolderClick = () => {
    setIsOpen(false);
    if (onSelectFolder) {
      onSelectFolder();
    } else {
      const folderId = searchParams.get('folder');
      const basePath = pathname.startsWith('/decks') ? '/decks' : '/';
      const targetUrl = folderId
        ? `${basePath}?create=folder&folder=${encodeURIComponent(folderId)}`
        : `${basePath}?create=folder`;
      router.push(targetUrl);
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={
          buttonClassName ||
          'inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-indigo-600/25 active:scale-95 border border-indigo-400/20 shrink-0 cursor-pointer'
        }
      >
        <Plus className="w-4 h-4" />
        <span>{t('dashboard.new_button', '+ Nuevo')}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 w-64 z-50 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-neutral-950/10 dark:shadow-black/80 p-1.5 space-y-1 animate-in fade-in zoom-in-95"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Opción 1: Nuevo Mazo de Estudio */}
          <button
            type="button"
            onClick={handleDeckClick}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition cursor-pointer text-left group"
            role="menuitem"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-neutral-900 dark:text-white truncate">
                {t('dashboard.new_deck', 'Nuevo Mazo de Estudio')}
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                {t('dashboard.new_deck_desc', 'Tarjetas y repaso espaciado')}
              </div>
            </div>
          </button>

          {/* Opción 2: Nueva Carpeta */}
          <button
            type="button"
            onClick={handleFolderClick}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition cursor-pointer text-left group"
            role="menuitem"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Folder className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-neutral-900 dark:text-white truncate">
                {t('dashboard.new_folder', 'Nueva Carpeta')}
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                {t('dashboard.new_folder_desc', 'Agrupar asignaturas o temas')}
              </div>
            </div>
          </button>

          <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />

          {/* Opción 3: Nuevo Atlas Visual */}
          <Link
            href="/atlas/new"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition cursor-pointer text-left group"
            role="menuitem"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Map className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                {t('dashboard.new_visual_atlas', 'Nuevo Atlas Visual')}
              </div>
              <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 truncate">
                {t('dashboard.new_visual_atlas_desc', 'Oclusión de imágenes y diagramas')}
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
