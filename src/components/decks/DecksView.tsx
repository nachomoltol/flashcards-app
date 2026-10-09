'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDeckStore, useAuthStore, useStreakStore, type DeckWithStats } from '@/stores';
import { ShareDeckModal } from './ShareDeckModal';

const COLOR_PALETTE = [
  { name: 'Índigo', hex: '#6366f1' },
  { name: 'Violeta', hex: '#8b5cf6' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Esmeralda', hex: '#10b981' },
  { name: 'Ámbar', hex: '#f59e0b' },
  { name: 'Cian', hex: '#06b6d4' },
];

export function DecksSkeleton() {
  return (
    <div className="space-y-7 animate-pulse">
      {/* Top Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-800/80">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-neutral-800 rounded-xl" />
          <div className="h-4 w-80 bg-neutral-800/60 rounded-lg" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-32 bg-neutral-800 rounded-xl" />
          <div className="h-10 w-32 bg-neutral-800 rounded-xl" />
        </div>
      </div>

      {/* Breadcrumbs Skeleton */}
      <div className="h-9 w-52 bg-neutral-900 rounded-xl border border-neutral-800/60" />

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 bg-neutral-800 rounded" />
              <div className="h-8 w-8 bg-neutral-800 rounded-lg" />
            </div>
            <div className="h-8 w-16 bg-neutral-800 rounded-lg" />
            <div className="h-3 w-32 bg-neutral-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Controls Bar Skeleton */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="h-10 w-72 bg-neutral-900 rounded-xl border border-neutral-800" />
        <div className="h-10 w-64 bg-neutral-900 rounded-xl border border-neutral-800" />
      </div>

      {/* Grid Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4"
          >
            <div className="flex justify-between items-center">
              <div className="h-6 w-20 bg-neutral-800 rounded-full" />
              <div className="h-6 w-12 bg-neutral-800 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-neutral-800 rounded" />
              <div className="h-3 w-full bg-neutral-800/60 rounded" />
            </div>
            <div className="pt-3 border-t border-neutral-800/60 flex justify-between items-center">
              <div className="h-4 w-24 bg-neutral-800/60 rounded" />
              <div className="h-4 w-16 bg-neutral-800/60 rounded" />
            </div>
            <div className="pt-3 border-t border-neutral-800/80 flex justify-between items-center">
              <div className="h-8 w-28 bg-neutral-800 rounded-xl" />
              <div className="h-6 w-16 bg-neutral-800/60 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecksViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const { decks, isLoading, error, fetchDecks, createDeck, deleteDeck, updateDeck, moveDeck } = useDeckStore();
  const { streak, fetchStreak } = useStreakStore();

  // Navegación jerárquica por carpetas (Adjacency List)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    return searchParams.get('folder') || null;
  });

  // Modales y Menús
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'deck' | 'folder'>('folder');
  const [isNewDropdownOpen, setIsNewDropdownOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<DeckWithStats | null>(null);

  // Reubicación (Mover elemento a otra carpeta o raíz)
  const [movingDeck, setMovingDeck] = useState<DeckWithStats | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);

  // Compartir Mazo
  const [sharingDeck, setSharingDeck] = useState<DeckWithStats | null>(null);

  // Formulario Crear
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState('#f59e0b');
  const [isCreating, setIsCreating] = useState(false);

  // Formulario Editar
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [isUpdating, setIsUpdating] = useState(false);

  // Confirmación Eliminar
  const [deletingDeck, setDeletingDeck] = useState<DeckWithStats | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Búsqueda y Filtro
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'due' | 'empty' | 'folders'>('all');

  useEffect(() => {
    setCurrentFolderId(searchParams.get('folder') || null);
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading) {
      fetchDecks();
      if (user?.id) {
        fetchStreak(user.id);
      }
    }
  }, [authLoading, user?.id, fetchDecks, fetchStreak]);

  // Menú contextual de opciones por tarjeta (⋮)
  const [activeDropdownDeckId, setActiveDropdownDeckId] = useState<string | null>(null);

  // Cerrar menú desplegable al hacer clic fuera
  useEffect(() => {
    if (!isNewDropdownOpen && !activeDropdownDeckId) return;
    const handleClose = () => {
      setIsNewDropdownOpen(false);
      setActiveDropdownDeckId(null);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [isNewDropdownOpen, activeDropdownDeckId]);

  // Sincronizar hacia atrás/adelante en el historial del navegador
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setCurrentFolderId(params.get('folder'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Resolver carpeta activa actual (priorizando estado y con fallback en searchParams)
  const activeFolderId = currentFolderId ?? searchParams.get('folder');

  // Función para navegar entre carpetas actualizando la URL de forma suave y mediante router
  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearchQuery('');
    setFilterMode('all');
    const targetUrl = folderId ? `/decks?folder=${folderId}` : '/decks';
    router.push(targetUrl);
    window.history.pushState(null, '', targetUrl);
  };

  // Carpeta activa actual
  const currentFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return decks.find((d) => d.id === activeFolderId) || null;
  }, [decks, activeFolderId]);

  // Construcción dinámica de la cadena de Migas de Pan (Breadcrumbs)
  const breadcrumbs = useMemo(() => {
    const trail: { id: string | null; title: string }[] = [];
    let currId: string | null = activeFolderId;
    const visited = new Set<string>();

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const found = decks.find((d) => d.id === currId);
      if (!found) break;
      trail.unshift({ id: found.id, title: found.title });
      currId = found.parent_id || null;
    }

    trail.unshift({ id: null, title: 'Inicio' });
    return trail;
  }, [decks, activeFolderId]);

  // Elementos pertenecientes al nivel actual
  const currentLevelDecks = useMemo(() => {
    return decks.filter((deck) => {
      if (!activeFolderId) {
        return !deck.parent_id;
      }
      return deck.parent_id === activeFolderId;
    });
  }, [decks, activeFolderId]);

  // Carpetas disponibles en la base de datos para reubicar elementos
  const availableFoldersForMove = useMemo(() => {
    let result: DeckWithStats[] = [];
    if (!movingDeck) return [];
    if (movingDeck.is_folder) {
      // Evitar ciclos: una carpeta no puede moverse dentro de sí misma ni de sus descendientes
      const descendantIds = new Set<string>([movingDeck.id]);
      let added = true;
      while (added) {
        added = false;
        for (const d of decks) {
          if (d.parent_id && descendantIds.has(d.parent_id) && !descendantIds.has(d.id)) {
            descendantIds.add(d.id);
            added = true;
          }
        }
      }
      result = decks.filter((d) => Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder) && !descendantIds.has(d.id));
    } else {
      result = decks.filter((d) => Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder));
    }
    return [...result].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  }, [decks, movingDeck]);

  // Obtener ruta legible de una carpeta (ej: "Asignatura / Tema 1")
  const getFolderPath = (folderId: string): string => {
    const parts: string[] = [];
    let curr: DeckWithStats | undefined = decks.find((d) => d.id === folderId);
    const visited = new Set<string>();
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      parts.unshift(curr.title);
      curr = curr.parent_id ? decks.find((d) => d.id === curr!.parent_id) : undefined;
    }
    return parts.join(' / ');
  };

  // Totales globales y de nivel
  const dueCardsTotal = useMemo(
    () => decks.filter((d) => !Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).reduce((acc, d) => acc + d.dueCount, 0),
    [decks]
  );
  const totalCards = useMemo(
    () => decks.filter((d) => !Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).reduce((acc, d) => acc + d.cardsCount, 0),
    [decks]
  );
  const totalFolders = useMemo(() => decks.filter((d) => Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).length, [decks]);
  const totalStudyDecks = useMemo(() => decks.filter((d) => !Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).length, [decks]);

  const foldersInLevel = useMemo(
    () => currentLevelDecks.filter((d) => Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).length,
    [currentLevelDecks]
  );
  const decksInLevel = useMemo(
    () => currentLevelDecks.filter((d) => !Boolean(d.is_folder || (d as unknown as Record<string, unknown>).isFolder)).length,
    [currentLevelDecks]
  );

  // Elementos filtrados y ordenados en el nivel actual:
  // 1. Mostrar siempre primero las Carpetas y después los Mazos.
  // 2. Ordenación alfanumérica por título con localeCompare(..., { numeric: true }) para que "Tema 2" preceda a "Tema 10".
  const filteredDecks = useMemo(() => {
    const list = currentLevelDecks.filter((deck) => {
      const isFolder = Boolean(deck.is_folder || (deck as unknown as Record<string, unknown>).isFolder);
      const matchesSearch =
        deck.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (deck.description && deck.description.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterMode === 'due') return !isFolder && deck.dueCount > 0;
      if (filterMode === 'empty') return !isFolder && deck.cardsCount === 0;
      if (filterMode === 'folders') return isFolder;
      return true;
    });

    return [...list].sort((a, b) => {
      const aIsFolder = Boolean(a.is_folder || (a as unknown as Record<string, unknown>).isFolder);
      const bIsFolder = Boolean(b.is_folder || (b as unknown as Record<string, unknown>).isFolder);

      // Mostrar siempre primero las Carpetas y después los Mazos
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      // Ordenación alfanumérica natural por título ("Tema 2" antes que "Tema 10")
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [currentLevelDecks, searchQuery, filterMode]);

  // Manejar Crear Mazo o Carpeta con herencia contextual de parent_id
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Determinar explícitamente si es carpeta basado en createType
    const isFolder = createType === 'folder';

    // Log interceptor explícito requerido
    console.log("🛠️ FRONTEND ENVÍA:", { createType, isFolder });

    if (!newTitle.trim()) return;

    setIsCreating(true);

    // 2. Determinar el parent_id activo (usando estado o fallback de searchParams)
    const activeParentId = currentFolderId || searchParams.get('folder') || null;

    const created = await createDeck({
      title: newTitle.trim(),
      description: isFolder ? '' : newDescription.trim(),
      color: newColor,
      isFolder: isFolder,
      is_folder: isFolder,
      parentId: activeParentId,
      parent_id: activeParentId,
    });
    setIsCreating(false);

    if (created) {
      setNewTitle('');
      setNewDescription('');
      setNewColor(isFolder ? '#f59e0b' : '#6366f1');
      setIsCreateModalOpen(false);
      setIsNewDropdownOpen(false);
      // Re-consultar los mazos inmediatamente para garantizar reflejo en UI
      await fetchDecks();
    }
  };

  // Abrir Modal de Edición
  const handleOpenEdit = (e: React.MouseEvent, deck: DeckWithStats) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingDeck(deck);
    setEditTitle(deck.title);
    setEditDescription(deck.description || '');
    setEditColor(deck.color || '#6366f1');
  };

  // Guardar Cambios de Edición
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeck || !editTitle.trim()) return;

    setIsUpdating(true);
    const success = await updateDeck(editingDeck.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      color: editColor,
    });
    setIsUpdating(false);

    if (success) {
      setEditingDeck(null);
    }
  };

  // Confirmar Eliminación (en cascada para carpetas)
  const handleConfirmDelete = async () => {
    if (!deletingDeck) return;
    setIsDeleting(true);
    await deleteDeck(deletingDeck.id);
    setIsDeleting(false);
    setDeletingDeck(null);
  };

  // Abrir Modal de Reubicación (Mover a...)
  const handleOpenMove = (deck: DeckWithStats) => {
    setMovingDeck(deck);
    setTargetFolderId(deck.parent_id || '');
  };

  // Abrir Modal de Compartir Mazo
  const handleOpenShare = (deck: DeckWithStats) => {
    setSharingDeck(deck);
  };

  // Confirmar Reubicación (Mover elemento)
  const handleConfirmMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDeck) return;

    setIsMoving(true);
    const newParentId = targetFolderId.trim() ? targetFolderId.trim() : null;
    const success = await moveDeck(movingDeck.id, newParentId);
    setIsMoving(false);

    if (success) {
      setMovingDeck(null);
      // Recargar la vista para que el elemento desaparezca del nivel actual y se refleje en su nuevo destino
      await fetchDecks();
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Welcome & Actions Header */}
      <div className="order-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-800/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              {currentFolder ? (
                <>
                  <span className="text-amber-400">📁</span>
                  <span>{currentFolder.title}</span>
                </>
              ) : (
                <>
                  <span>Tus Mazos y Carpetas</span>
                </>
              )}
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono font-medium">
              FSRS v5
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            {currentFolder
              ? `Explorando carpeta actual • ${foldersInLevel} subcarpetas y ${decksInLevel} mazos contenidos.`
              : 'Estructura tu temario en Asignaturas > Temas > Mazos y repasa con repetición espaciada.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap relative">
          {currentFolderId && (
            <button
              onClick={() => {
                const parentId = currentFolder?.parent_id || null;
                navigateToFolder(parentId);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-medium transition active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Subir nivel</span>
            </button>
          )}

          {/* Botón Principal "+ Nuevo" con Menú Desplegable */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsNewDropdownOpen(!isNewDropdownOpen);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-indigo-600/25 active:scale-95 border border-indigo-400/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Nuevo</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isNewDropdownOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Menú Desplegable (Dropdown) */}
            {isNewDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-1.5 z-40 animate-in fade-in slide-in-from-top-2 duration-150 divide-y divide-neutral-800/60"
              >
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateType('folder');
                      setNewColor('#f59e0b');
                      setNewTitle('');
                      setNewDescription('');
                      setIsNewDropdownOpen(false);
                      setIsCreateModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-800 transition flex items-start gap-3 group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                      📁
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-amber-300 transition">
                        Nueva Carpeta
                      </div>
                      <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                        Agrupa asignaturas o temas
                      </div>
                    </div>
                  </button>
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateType('deck');
                      setNewColor('#6366f1');
                      setNewTitle('');
                      setNewDescription('');
                      setIsNewDropdownOpen(false);
                      setIsCreateModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-800 transition flex items-start gap-3 group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                      🃏
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                        Nuevo Mazo de Estudio
                      </div>
                      <div className="text-[11px] text-neutral-400 leading-tight mt-0.5">
                        Crea tarjetas con repaso FSRS
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="order-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between animate-in fade-in">
          <span>{error}</span>
          <button onClick={() => fetchDecks()} className="underline hover:text-rose-300 font-medium ml-2">
            Reintentar
          </button>
        </div>
      )}

      {/* Migas de pan (Breadcrumbs) Dinámicas y Discretas */}
      <nav
        aria-label="Migas de pan"
        className="order-2 flex items-center gap-1 p-1.5 px-3 rounded-xl bg-neutral-900/70 border border-neutral-800/90 text-xs overflow-x-auto shadow-sm"
      >
        <span className="text-neutral-500 font-mono text-[11px] uppercase mr-1.5 flex items-center gap-1 shrink-0">
          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Ubicación:
        </span>

        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <div key={crumb.id ?? 'root'} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <span className="text-neutral-600 font-bold px-0.5">›</span>}
              <button
                type="button"
                onClick={() => navigateToFolder(crumb.id)}
                disabled={isLast}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                  isLast
                    ? 'bg-neutral-800 text-white font-semibold cursor-default border border-neutral-700/60 shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/80 active:scale-95'
                }`}
              >
                {crumb.id === null ? (
                  <>
                    <span>🏠</span>
                    <span>Inicio</span>
                  </>
                ) : (
                  <>
                    <span>📁</span>
                    <span className="max-w-[170px] truncate">{crumb.title}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Metrics Row: 4 Metric Cards (Solo visible en la raíz, al final en móvil y arriba en escritorio) */}
      {!currentFolder && (
        <div className="order-5 md:order-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Tarjetas a Repasar Hoy */}
          <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Repasos para Hoy
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{dueCardsTotal}</span>
              <span className="text-xs text-neutral-500">tarjetas debidas</span>
            </div>
            <div className="mt-2 text-xs text-neutral-400 font-medium">
              {dueCardsTotal > 0 ? (
                <span className="text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Pendientes de estudio
                </span>
              ) : (
                <span className="text-emerald-400">Todo al día</span>
              )}
            </div>
          </div>

          {/* Stat 2: Total de Tarjetas Registradas */}
          <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Total Tarjetas
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{totalCards}</span>
              <span className="text-xs text-neutral-500">en mazos de estudio</span>
            </div>
            <div className="mt-2 text-xs text-neutral-400 font-medium">
              Almacenadas en PostgreSQL
            </div>
          </div>

          {/* Stat 3: Organización Actual */}
          <div className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-neutral-700/80 transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                {currentFolder ? 'En esta Carpeta' : 'Estructura Global'}
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                {currentFolder ? currentLevelDecks.length : decks.length}
              </span>
              <span className="text-xs text-neutral-500">
                {currentFolder ? 'elementos aquí' : 'elementos en total'}
              </span>
            </div>
            <div className="mt-2 text-xs text-amber-400 font-medium">
              {currentFolder
                ? `${foldersInLevel} carpetas • ${decksInLevel} mazos`
                : `${totalFolders} carpetas • ${totalStudyDecks} mazos`}
            </div>
          </div>

          {/* Stat 4: 🔥 Racha Activa */}
          <Link
            href="/stats"
            className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition-all duration-200 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider group-hover:text-amber-300 transition flex items-center gap-1.5">
                <span>🔥</span>
                <span>Racha Activa</span>
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white group-hover:text-amber-400 transition">
                {streak.current}
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                {streak.current === 1 ? 'día' : 'días'} consecutivos
              </span>
            </div>
            <div className="mt-2 text-xs font-medium flex items-center justify-between">
              <span className={streak.studiedToday ? 'text-amber-400 font-medium' : 'text-neutral-400'}>
                {streak.studiedToday
                  ? '🔥 Racha activa hoy'
                  : streak.current > 0
                  ? '⚡ Estudia hoy para mantenerla'
                  : '¡Repasa hoy para encenderla!'}
              </span>
              {streak.max > 0 && (
                <span className="text-[11px] font-mono text-neutral-500">
                  Récord: {streak.max}d
                </span>
              )}
            </div>
          </Link>
        </div>
      )}

      {/* Controls Bar: Search & Filters */}
      <div className="order-3 md:order-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              currentFolder
                ? `Buscar en "${currentFolder.title}"...`
                : 'Buscar por título o descripción...'
            }
            className="w-full text-xs font-medium pl-9 pr-4 py-2.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <svg className="w-4 h-4 text-neutral-500 absolute left-3 top-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-white p-0.5 rounded transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs flex-wrap">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterMode === 'all'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Todos ({currentLevelDecks.length})
          </button>
          <button
            onClick={() => setFilterMode('folders')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              filterMode === 'folders'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>📁 Carpetas ({foldersInLevel})</span>
          </button>
          <button
            onClick={() => setFilterMode('due')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              filterMode === 'due'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Pendientes ({currentLevelDecks.filter((d) => !d.is_folder && d.dueCount > 0).length})
          </button>
          <button
            onClick={() => setFilterMode('empty')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterMode === 'empty'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Vacíos ({currentLevelDecks.filter((d) => !d.is_folder && d.cardsCount === 0).length})
          </button>
        </div>
      </div>

      {/* Grid de Elementos (Carpetas y Mazos) */}
      <section className="order-4 md:order-5 space-y-4">
        {isLoading && decks.length === 0 ? (
          <div className="p-16 text-center text-neutral-400 text-sm">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Cargando tus elementos desde Supabase...
          </div>
        ) : filteredDecks.length === 0 ? (
          /* Empty State */
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 shadow-inner text-2xl">
              {currentFolder ? '📁' : '🗂️'}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {searchQuery || filterMode !== 'all'
                  ? 'No se encontraron elementos con los filtros actuales'
                  : currentFolder
                  ? `La carpeta "${currentFolder.title}" está vacía`
                  : 'No tienes elementos creados en el nivel raíz'}
              </h3>
              <p className="mt-1 text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                {searchQuery || filterMode !== 'all'
                  ? 'Prueba a cambiar tu búsqueda o selecciona otro filtro.'
                  : currentFolder
                  ? 'Organiza esta sección añadiendo subcarpetas (ej. temas) o mazos de estudio con tarjetas.'
                  : 'Crea tu primera asignatura o mazo de estudio para comenzar.'}
              </p>
            </div>

            {!searchQuery && filterMode === 'all' && (
              <div className="flex items-center gap-3 pt-2 flex-wrap justify-center">
                <button
                  onClick={() => {
                    setCreateType('folder');
                    setNewColor('#f59e0b');
                    setNewTitle('');
                    setNewDescription('');
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-medium text-xs transition active:scale-95 border border-neutral-700/80 shadow-sm"
                >
                  <span>📁</span>
                  <span>{currentFolder ? 'Crear Subcarpeta' : 'Crear Carpeta'}</span>
                </button>
                <button
                  onClick={() => {
                    setCreateType('deck');
                    setNewColor('#6366f1');
                    setNewTitle('');
                    setNewDescription('');
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition active:scale-95"
                >
                  <span>🃏</span>
                  <span>{currentFolder ? 'Crear Mazo aquí' : 'Crear Mazo de Estudio'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Cuadrícula de Carpetas y Mazos */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDecks.map((deck) => {
              const isFolder = Boolean(deck.is_folder || (deck as unknown as Record<string, unknown>).isFolder);
              const accentColor = deck.color || (isFolder ? '#f59e0b' : '#6366f1');
              const hasDue = deck.dueCount > 0;
              const hasCards = deck.cardsCount > 0;

              // Renderizado para CARPETA
              if (isFolder) {
                return (
                  <div
                    key={deck.id}
                    onClick={() => navigateToFolder(deck.id)}
                    className="group rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 hover:border-amber-500/50 hover:bg-neutral-900/90 transition-all duration-200 flex flex-col justify-between relative shadow-sm hover:shadow-xl hover:shadow-black/50 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div>
                      {/* Top Bar: Icono de Carpeta, Badge de Carpeta y Menú Desplegable (⋮) */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm border"
                            style={{
                              backgroundColor: `${accentColor}18`,
                              borderColor: `${accentColor}40`,
                              color: accentColor,
                            }}
                          >
                            📁
                          </div>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono font-medium border border-amber-500/25">
                            Carpeta
                          </span>
                        </div>

                        {/* Menú Desplegable de Tres Puntos (⋮) */}
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveDropdownDeckId(activeDropdownDeckId === deck.id ? null : deck.id);
                            }}
                            title="Opciones de la carpeta"
                            className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition flex items-center justify-center font-bold text-sm tracking-wider"
                          >
                            ⋮
                          </button>

                          {activeDropdownDeckId === deck.id && (
                            <div
                              className="absolute right-0 top-8 w-44 rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl p-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveDropdownDeckId(null);
                                  handleOpenMove(deck);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2 transition"
                              >
                                <span className="text-sm">📁</span>
                                <span>Mover a...</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveDropdownDeckId(null);
                                  handleOpenEdit(e, deck);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2 transition"
                              >
                                <span className="text-sm">✏️</span>
                                <span>Editar nombre</span>
                              </button>
                              <div className="my-1 border-t border-neutral-800/80" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveDropdownDeckId(null);
                                  setDeletingDeck(deck);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition"
                              >
                                <span className="text-sm">🗑️</span>
                                <span>Eliminar carpeta</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Folder Title & Description */}
                      <h3 className="text-base font-bold text-white tracking-tight line-clamp-1 group-hover:text-amber-300 transition flex items-center gap-1.5">
                        <span>{deck.title}</span>
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed min-h-[2rem]">
                        {deck.description || 'Carpeta organizadora de temas y mazos.'}
                      </p>

                      {/* Recuento de Elementos Contenidos */}
                      <div className="mt-3.5 pt-3 border-t border-neutral-800/60">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400 font-medium">Contenido:</span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 font-medium text-xs border border-neutral-700/50">
                            <span>📁</span>
                            <span>
                              {deck.childrenCount ?? 0} {deck.childrenCount === 1 ? 'elemento' : 'elementos'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pie de la Carpeta: Únicamente Abrir Carpeta y Gestionar */}
                    <div className="mt-5 pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigateToFolder(deck.id)}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all duration-150 active:scale-95"
                      >
                        <span>Abrir Carpeta</span>
                        <span>→</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(e, deck)}
                        className="text-xs font-medium text-neutral-400 hover:text-white px-3 py-2 rounded-xl hover:bg-neutral-800 transition flex items-center gap-1"
                      >
                        <span>Gestionar</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // Renderizado para MAZO DE ESTUDIO
              return (
                <div
                  key={deck.id}
                  className="group rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 hover:border-neutral-700/80 transition-all duration-200 flex flex-col justify-between relative shadow-sm hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5"
                >
                  <div>
                    {/* Top Bar: Accent color, Total Cards badge, and Menú Desplegable (⋮) */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: accentColor }}
                        />
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800/80 text-neutral-300 font-mono font-medium border border-neutral-700/40">
                          {deck.cardsCount} {deck.cardsCount === 1 ? 'tarjeta' : 'tarjetas'}
                        </span>
                      </div>

                      {/* Menú Desplegable de Tres Puntos (⋮) con acciones secundarias */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveDropdownDeckId(activeDropdownDeckId === deck.id ? null : deck.id);
                          }}
                          title="Opciones del mazo"
                          className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition flex items-center justify-center font-bold text-sm tracking-wider"
                        >
                          ⋮
                        </button>

                        {activeDropdownDeckId === deck.id && (
                          <div
                            className="absolute right-0 top-8 w-44 rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl p-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveDropdownDeckId(null);
                                handleOpenShare(deck);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2 transition"
                            >
                              <span className="text-sm">🔗</span>
                              <span>Compartir Mazo</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveDropdownDeckId(null);
                                handleOpenMove(deck);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2 transition"
                            >
                              <span className="text-sm">📁</span>
                              <span>Mover a...</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveDropdownDeckId(null);
                                handleOpenEdit(e, deck);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2 transition"
                            >
                              <span className="text-sm">✏️</span>
                              <span>Editar Mazo</span>
                            </button>
                            <div className="my-1 border-t border-neutral-800/80" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveDropdownDeckId(null);
                                setDeletingDeck(deck);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition"
                            >
                              <span className="text-sm">🗑️</span>
                              <span>Eliminar Mazo</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mazo Title & Description */}
                    <Link href={`/decks/${deck.id}`} className="block group-hover:text-indigo-400 transition">
                      <h3 className="text-base font-bold text-white tracking-tight line-clamp-1 group-hover:text-indigo-300 transition">
                        {deck.title}
                      </h3>
                    </Link>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed min-h-[2rem]">
                      {deck.description || 'Sin descripción añadida.'}
                    </p>

                    {/* Indicador Numérico de Tarjetas a Repasar Hoy (FSRS due_date) */}
                    <div className="mt-3.5 pt-3 border-t border-neutral-800/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400 font-medium">Repaso FSRS:</span>
                        {hasDue ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold text-xs animate-in fade-in">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                            {deck.dueCount} para repasar hoy
                          </span>
                        ) : hasCards ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium text-xs">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Al día (0 pendientes)
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-xs font-mono">
                            Mazo sin tarjetas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pie del Mazo: Únicamente "Estudiar" y "Gestionar" */}
                  <div className="mt-5 pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3">
                    <Link
                      href={`/study/${deck.id}`}
                      className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-150 ${
                        !hasCards
                          ? 'bg-neutral-800/50 text-neutral-500 pointer-events-none'
                          : hasDue
                          ? 'bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white shadow-md shadow-rose-900/30 active:scale-95'
                          : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Estudiar {hasDue ? `(${deck.dueCount})` : ''}</span>
                    </Link>

                    <Link
                      href={`/decks/${deck.id}`}
                      className="text-xs font-medium text-neutral-400 hover:text-white px-3 py-2 rounded-xl hover:bg-neutral-800 transition flex items-center gap-1 shrink-0"
                    >
                      <span>Gestionar</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Creación Contextual Inteligente (Carpeta vs Mazo) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>{createType === 'folder' ? '📁 Crear Nueva Carpeta' : '🃏 Crear Mazo de Estudio'}</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Entradas ocultas de respaldo para garantizar sincronización de datos */}
              <input type="hidden" name="isFolder" value={createType === 'folder' ? 'true' : 'false'} />
              <input type="hidden" name="parentId" value={activeFolderId || ''} />

              {/* Selector Visual de Tipo (Tabs / Radio Cards Prominentes) */}
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de elemento">
                <button
                  type="button"
                  role="radio"
                  aria-checked={createType === 'folder'}
                  onClick={() => {
                    setCreateType('folder');
                    setNewColor('#f59e0b');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between relative ${
                    createType === 'folder'
                      ? 'border-amber-500 bg-amber-500/15 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30'
                      : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">📁</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                        createType === 'folder'
                          ? 'border-amber-400 bg-amber-400'
                          : 'border-neutral-600'
                      }`}
                    >
                      {createType === 'folder' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />
                      )}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">📁 Crear Carpeta</div>
                  <div className="text-[11px] text-neutral-400 mt-1 leading-snug">
                    Organiza asignaturas o temas
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={createType === 'deck'}
                  onClick={() => {
                    setCreateType('deck');
                    setNewColor('#6366f1');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between relative ${
                    createType === 'deck'
                      ? 'border-indigo-500 bg-indigo-500/15 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/30'
                      : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🃏</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                        createType === 'deck'
                          ? 'border-indigo-400 bg-indigo-400'
                          : 'border-neutral-600'
                      }`}
                    >
                      {createType === 'deck' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />
                      )}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">🃏 Crear Mazo</div>
                  <div className="text-[11px] text-neutral-400 mt-1 leading-snug">
                    Tarjetas con repasos FSRS
                  </div>
                </button>
              </div>

              {/* Banner de Ubicación Contextual */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs">
                <span className="text-neutral-400">📍 Ubicación de destino:</span>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  {currentFolder ? (
                    <>
                      <span className="text-amber-400">📁</span>
                      <span className="truncate max-w-[200px]">{currentFolder.title}</span>
                    </>
                  ) : (
                    <>
                      <span>🏠</span>
                      <span>Nivel raíz (Inicio)</span>
                    </>
                  )}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  {createType === 'folder'
                    ? 'Nombre de la Carpeta o Asignatura'
                    : 'Título del Mazo'}{' '}
                  <span className={createType === 'folder' ? 'text-amber-400' : 'text-indigo-400'}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    createType === 'folder'
                      ? 'ej. Biología, Derecho Constitucional, Tema 1...'
                      : 'ej. Mitosis y Meiosis, Artículos 1 al 10...'
                  }
                  className={`w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none transition ${
                    createType === 'folder'
                      ? 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                      : 'focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                  }`}
                />
              </div>

              {/* Si es carpeta, ocultamos la descripción para mantener el formulario limpio */}
              {createType === 'deck' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                    Descripción del Mazo (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Objetivos o temario de este mazo..."
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                  />
                </div>
              )}

              {/* Selector de Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
                  Color Distintivo
                </label>
                <div className="flex items-center gap-3">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewColor(c.hex)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        newColor === c.hex
                          ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                          : 'hover:scale-110 opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newTitle.trim()}
                  className={`px-5 py-2.5 text-xs font-medium text-white disabled:opacity-50 rounded-xl transition shadow-lg active:scale-95 ${
                    createType === 'folder'
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/25'
                      : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25'
                  }`}
                >
                  {isCreating
                    ? 'Creando...'
                    : createType === 'folder'
                    ? '📁 Crear Carpeta'
                    : '🃏 Crear Mazo de Estudio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Mazo o Carpeta */}
      {editingDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>{editingDeck.is_folder ? 'Editar Carpeta' : 'Editar Mazo'}</span>
              </h3>
              <button
                onClick={() => setEditingDeck(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  {editingDeck.is_folder ? 'Nombre de la Carpeta' : 'Título del Mazo'}{' '}
                  <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Detalles sobre este elemento..."
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                />
              </div>

              {/* Selector de Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
                  Color Distintivo
                </label>
                <div className="flex items-center gap-3">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setEditColor(c.hex)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        editColor === c.hex
                          ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                          : 'hover:scale-110 opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingDeck(null)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdating || !editTitle.trim()}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition shadow-lg shadow-indigo-600/25 active:scale-95"
                >
                  {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación (con soporte de cascada) */}
      {deletingDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto text-xl">
              {deletingDeck.is_folder ? '📁' : '🗑️'}
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">
                ¿Eliminar {deletingDeck.is_folder ? 'carpeta' : 'mazo'} &ldquo;{deletingDeck.title}&rdquo;?
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {deletingDeck.is_folder
                  ? `Esta carpeta contiene ${deletingDeck.childrenCount || 0} elemento(s). Si la eliminas, todos sus mazos, subcarpetas y tarjetas asociadas se eliminarán permanentemente en Supabase (borrado en cascada).`
                  : `Esta acción eliminará el mazo permanentemente junto con sus ${deletingDeck.cardsCount} tarjetas en Supabase.`}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingDeck(null)}
                className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white rounded-xl hover:bg-neutral-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl transition shadow-lg shadow-rose-600/25 active:scale-95"
              >
                {isDeleting
                  ? 'Eliminando...'
                  : deletingDeck.is_folder
                  ? 'Sí, eliminar carpeta'
                  : 'Sí, eliminar mazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reubicar Elemento (Mover a...) */}
      {movingDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm">
                  📁
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Mover a...
                  </h3>
                  <p className="text-xs text-neutral-400 line-clamp-1">
                    {movingDeck.is_folder ? 'Carpeta:' : 'Mazo:'} &ldquo;{movingDeck.title}&rdquo;
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMovingDeck(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleConfirmMove} className="space-y-4">
              <div>
                <label
                  htmlFor="target-folder-select"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2"
                >
                  Seleccionar Carpeta de Destino
                </label>
                <div className="relative">
                  <select
                    id="target-folder-select"
                    value={targetFolderId}
                    onChange={(e) => setTargetFolderId(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition appearance-none cursor-pointer pr-10"
                  >
                    <option value="">🏠 Nivel Raíz (Inicio)</option>
                    {availableFoldersForMove.map((folder) => {
                      const path = getFolderPath(folder.id);
                      return (
                        <option key={folder.id} value={folder.id}>
                          📁 {path || folder.title}
                        </option>
                      );
                    })}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  {movingDeck.is_folder
                    ? 'La carpeta y todos sus contenidos se trasladarán a la ubicación seleccionada.'
                    : 'El mazo se reubicará inmediatamente en la carpeta seleccionada.'}
                </p>
              </div>

              {/* Botones Cancelar y Confirmar Mover */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMovingDeck(null)}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isMoving}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl transition shadow-lg shadow-amber-600/25 active:scale-95"
                >
                  {isMoving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Moviendo...</span>
                    </>
                  ) : (
                    <>
                      <span>📁</span>
                      <span>Mover a este destino</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Compartir Mazo */}
      <ShareDeckModal
        isOpen={sharingDeck !== null}
        onClose={() => setSharingDeck(null)}
        deck={sharingDeck}
      />
    </div>
  );
}

export default function DecksView() {
  return <DecksViewContent />;
}

export { DecksView };
