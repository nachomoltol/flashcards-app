'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, useProfileStore, useLanguageStore, useThemeStore, useStreakStore } from '@/stores';
import { supabase } from '@/lib/supabase';
import {
  User as UserIcon,
  Moon,
  Sun,
  Sparkles,
  LifeBuoy,
  LogOut,
  ChevronsUpDown,
  ChevronRight,
  ShieldCheck,
  Trash2,
  Layers,
  BarChart2,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  X as XIcon,
} from 'lucide-react';
import { WelcomeTutorial } from '@/components/onboarding/WelcomeTutorial';
import { ProModal } from '@/components/subscription/ProModal';
import { DeleteAccountModal } from '@/components/auth/DeleteAccountModal';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { NewMenuDropdown } from '@/components/ui/NewMenuDropdown';
import { useProModalStore } from '@/stores/useProModalStore';
import { useFeedbackModalStore } from '@/stores/useFeedbackModalStore';

interface NavItem {
  name: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

const navItems: NavItem[] = [
  {
    name: 'Mazos',
    href: '/',
    icon: ({ className }) => <Layers className={className} />,
  },
  {
    name: 'Estadísticas',
    href: '/stats',
    icon: ({ className }) => <BarChart2 className={className} />,
  },
  {
    name: 'Configuración',
    href: '/settings',
    icon: ({ className }) => <SettingsIcon className={className} />,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { openProModal } = useProModalStore();
  const openFeedback = useFeedbackModalStore((state) => state.openModal);
  const [isMounted, setIsMounted] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);
  const { user, initialize, signOut, isLoading } = useAuthStore();
  const { profile, fetchProfile } = useProfileStore();
  const { t } = useLanguageStore();
  const { theme, toggleTheme, initTheme } = useThemeStore();
  const [avatarError, setAvatarError] = useState(false);

  const getNavLabel = (item: NavItem) => {
    if (item.href === '/') return t('nav.decks', 'Mazos');
    if (item.href === '/stats') return t('nav.stats', 'Estadísticas');
    if (item.href === '/settings') return t('nav.settings', 'Configuración');
    return item.name;
  };

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    setAvatarError(false);
  }, [profile.avatar_url]);

  useEffect(() => {
    setIsMounted(true);
    initialize();
  }, [initialize]);

  // Sincronizar perfil global al detectar usuario autenticado
  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  // Sincronizar racha diaria (al autenticar y al volver a la app, p. ej. tras medianoche)
  const fetchStreak = useStreakStore((s) => s.fetchStreak);
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    fetchStreak(userId);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStreak(userId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, fetchStreak]);

  // Si finalizó de verificar la autenticación y no hay sesión activa, redirigir a /login
  useEffect(() => {
    if (isMounted && !isLoading && !user) {
      router.push('/login');
    }
  }, [isMounted, isLoading, user, router]);

  // Cerrar menús al hacer clic fuera o presionar Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
      if (mobileUserMenuRef.current && !mobileUserMenuRef.current.contains(target)) {
        setIsMobileUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsMobileUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };

    if (isUserMenuOpen || isMobileUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen, isMobileUserMenuOpen]);

  const handleSignOut = async () => {
    setIsUserMenuOpen(false);
    setIsMobileUserMenuOpen(false);
    setMobileMenuOpen(false);
    try {
      await signOut();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      router.push('/login');
    }
  };

  const handleNavigateToProfile = () => {
    setIsUserMenuOpen(false);
    setIsMobileUserMenuOpen(false);
    setMobileMenuOpen(false);

    if (pathname === '/settings') {
      const el = document.getElementById('profile-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const input = document.getElementById('full-name-input') as HTMLInputElement | null;
        if (input) {
          input.focus();
        }
      }
    } else {
      router.push('/settings#profile-section');
    }
  };

  const displayName = isMounted
    ? profile.full_name?.trim() ||
      profile.username?.trim() ||
      user?.user_metadata?.full_name ||
      user?.email ||
      'Usuario'
    : 'Usuario';

  const userInitial = isMounted
    ? (profile.full_name?.trim()?.charAt(0) ||
       profile.username?.trim()?.charAt(0) ||
       user?.email?.charAt(0) ||
       'U').toUpperCase()
    : 'U';

  const userEmail = isMounted && user?.email ? user.email : '';
  const hasAvatar = Boolean(isMounted && profile.avatar_url && !avatarError);
  const isStudyPage = Boolean(pathname?.startsWith('/study'));
  const isExamPage = Boolean(pathname?.startsWith('/exam'));
  const isFullscreen = isStudyPage || isExamPage;

  return (
    <div
      className={
        isStudyPage
          ? "h-[100dvh] md:min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col md:flex-row overflow-hidden transition-colors duration-150"
          : isExamPage
          ? "min-h-screen w-full bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col md:flex-row overflow-y-auto transition-colors duration-150"
          : "min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col md:flex-row transition-colors duration-150"
      }
    >
      {/* Mobile Top Bar (Oculto en Modo Estudio y Examen para permitir pantalla completa real) */}
      {!isFullscreen && (
        <header className="md:hidden flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/80 backdrop-blur sticky top-0 z-40">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-contain shadow-sm shrink-0"
            />
            <span className="font-semibold text-neutral-900 dark:text-white tracking-tight text-base hidden sm:inline-block">Flashmente</span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <LanguageSelector className="shrink-0" />
            <StreakBadge className="shrink-0" />

            {/* Mobile User Profile Avatar & Dropdown */}
            <div className="relative shrink-0" ref={mobileUserMenuRef}>
            <button
              onClick={() => {
                setIsMobileUserMenuOpen((prev) => !prev);
                setMobileMenuOpen(false);
              }}
              aria-label="Abrir menú de usuario"
              aria-expanded={isMobileUserMenuOpen}
              aria-haspopup="true"
              className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:border-indigo-400/60 hover:bg-indigo-500/30 flex items-center justify-center font-medium text-xs transition cursor-pointer overflow-hidden"
            >
              {hasAvatar ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="w-full h-full object-cover rounded-full"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                userInitial
              )}
            </button>

            {/* Mobile Dropdown Popover (Drops Downwards) */}
            {isMobileUserMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-64 z-50 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800/90 shadow-2xl shadow-neutral-950/10 dark:shadow-black/80 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-150"
                role="menu"
                aria-orientation="vertical"
              >
                {/* Header Info */}
                <div className="px-2.5 py-2 mb-1 border-b border-neutral-200 dark:border-neutral-800/80 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-medium text-[11px] shrink-0 overflow-hidden">
                    {hasAvatar ? (
                      <img
                        src={profile.avatar_url}
                        alt={displayName}
                        className="w-full h-full object-cover rounded-full"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      userInitial
                    )}
                  </div>
                  <div className="min-w-0 truncate">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{userEmail}</p>
                  </div>
                </div>

                {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
                <button
                  type="button"
                  onClick={handleNavigateToProfile}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                    <span>{t('nav.my_profile', 'Mi Perfil')}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                </button>

                {/* 2. Apariencia */}
                <button
                  type="button"
                  onClick={() => toggleTheme()}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleTheme();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer select-none group text-left"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'dark' ? (
                      <Moon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-500 group-hover:text-amber-600 transition-colors" />
                    )}
                    <span>{t('nav.appearance', 'Apariencia')}</span>
                  </span>
                  <span className="text-[10px] text-neutral-600 dark:text-neutral-300 bg-neutral-200/80 dark:bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium capitalize">
                    {theme === 'dark' ? t('nav.dark_mode', 'Oscuro') : t('nav.light_mode', 'Claro')}
                  </span>
                </button>

                {/* 3. Suscripción (PRO) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileUserMenuOpen(false);
                    openProModal();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-gradient-to-r dark:from-purple-500/15 dark:via-violet-500/10 dark:to-transparent border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-200 hover:border-purple-300 dark:hover:border-purple-400/50 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                    <span className="font-semibold text-purple-700 dark:text-purple-200 group-hover:text-purple-900 dark:group-hover:text-white transition-colors">{t('nav.subscription', 'Suscripción')}</span>
                  </span>
                  <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm">
                    PRO
                  </span>
                </button>

                {/* 4. Soporte y Feedback */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    openFeedback();
                    setIsMobileUserMenuOpen(false);
                  }}
                  onSelect={(e) => {
                    e.preventDefault();
                    openFeedback();
                    setIsMobileUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer pointer-events-auto group text-left active:scale-[0.99]"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <LifeBuoy className="w-4 h-4 text-purple-500 dark:text-purple-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                    <span>{t('nav.support_feedback', 'Soporte y Feedback')}</span>
                  </span>
                </button>

                {/* 5. Política de Privacidad */}
                <Link
                  href="/privacidad"
                  onClick={() => setIsMobileUserMenuOpen(false)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors group text-left"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
                    <span>{t('nav.privacy', 'Política de Privacidad')}</span>
                  </span>
                </Link>

                {/* Separador */}
                <div className="my-1 border-t border-neutral-200 dark:border-neutral-800/80" />

                {/* 5. Cerrar Sesión (Activo) */}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
                  <span className="font-medium">{t('nav.logout', 'Cerrar Sesión')}</span>
                </button>

                {/* 6. Eliminar Cuenta */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileUserMenuOpen(false);
                    setIsDeleteModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                  role="menuitem"
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-500 group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors" />
                  <span className="font-medium">{t('nav.delete_account', 'Eliminar Cuenta')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger Button */}
          <button
            onClick={() => {
              setMobileMenuOpen(!mobileMenuOpen);
              setIsMobileUserMenuOpen(false);
            }}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition cursor-pointer shrink-0"
          >
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </header>
      )}

      {/* Mobile Menu Drawer */}
      {!isFullscreen && mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur px-4 py-3 space-y-3 z-30">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/' || pathname === '/decks'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {getNavLabel(item)}
                </Link>
              );
            })}
          </div>

          {/* User profile & full options in mobile drawer */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800/80 space-y-1">
            <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-medium text-xs shrink-0 overflow-hidden">
                {hasAvatar ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover rounded-full"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  userInitial
                )}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-neutral-900 dark:text-neutral-200 truncate">{displayName}</p>
                <p className="text-[10px] text-neutral-500 truncate">
                  {profile.username ? `@${profile.username}` : (userEmail || 'Estudiante')}
                </p>
              </div>
            </div>

            {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
            <button
              type="button"
              onClick={handleNavigateToProfile}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                <span>Mi Perfil</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
            </button>

            {/* 2. Apariencia */}
            <button
              type="button"
              onClick={() => toggleTheme()}
              onSelect={(e) => {
                e.preventDefault();
                toggleTheme();
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer select-none group text-left"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500 group-hover:text-amber-600 transition-colors" />
                )}
                <span>{t('nav.appearance', 'Apariencia')}</span>
              </span>
              <span className="text-[10px] text-neutral-600 dark:text-neutral-300 bg-neutral-200/80 dark:bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium capitalize">
                {theme === 'dark' ? t('nav.dark_mode', 'Oscuro') : t('nav.light_mode', 'Claro')}
              </span>
            </button>

            {/* 3. Suscripción (PRO) */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                openProModal();
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-gradient-to-r dark:from-purple-500/15 dark:via-violet-500/10 dark:to-transparent border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-200 hover:border-purple-300 dark:hover:border-purple-400/50 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                <span className="font-semibold text-purple-700 dark:text-purple-200 group-hover:text-purple-900 dark:group-hover:text-white transition-colors">{t('nav.subscription', 'Suscripción')}</span>
              </span>
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm">
                PRO
              </span>
            </button>

            {/* 4. Soporte y Feedback */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                openFeedback();
                setMobileMenuOpen(false);
              }}
              onSelect={(e) => {
                e.preventDefault();
                openFeedback();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer pointer-events-auto group text-left active:scale-[0.99]"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                <LifeBuoy className="w-4 h-4 text-purple-500 dark:text-purple-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                <span>{t('nav.support_feedback', 'Soporte y Feedback')}</span>
              </span>
            </button>

            {/* Política de Privacidad */}
            <Link
              href="/privacidad"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors text-left"
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                <span>{t('nav.privacy', 'Política de Privacidad')}</span>
              </span>
            </Link>

            {/* Separador */}
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-800/80" />

            {/* 5. Cerrar Sesión */}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="font-medium">{t('nav.logout', 'Cerrar Sesión')}</span>
            </button>

            {/* 6. Eliminar Cuenta */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsDeleteModalOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-500" />
              <span className="font-medium">{t('nav.delete_account', 'Eliminar Cuenta')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (Oculto en Modo Estudio y Examen para inmersión total) */}
      <aside className={isFullscreen ? "hidden" : "hidden md:flex flex-col w-64 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0 p-4 justify-between h-screen sticky top-0"}>
        <div className="space-y-6">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center gap-3 px-2 py-2 group">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-10 h-10 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform duration-200"
            />
            <div>
              <span className="font-semibold text-neutral-900 dark:text-white tracking-tight block text-base">
                Flashmente
              </span>
              <span className="text-[11px] text-amber-500 dark:text-amber-400 font-mono tracking-wider uppercase block">
                FSRS Spaced Rep
              </span>
            </div>
          </Link>

          {/* Botón Principal "+ Nuevo" (Visible SOLO en PC/Tablet) */}
          <div className="pt-1 hidden md:flex">
            <NewMenuDropdown
              className="w-full"
              buttonClassName="w-full inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs sm:text-sm transition-all duration-150 shadow-md shadow-indigo-600/20 active:scale-95 border border-indigo-400/20 cursor-pointer"
            />
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/' || pathname === '/decks'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'}`} />
                  {getNavLabel(item)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Profile Dropdown */}
        <div className="relative pt-4 border-t border-neutral-200 dark:border-neutral-800" ref={userMenuRef}>
          {/* Popover Dropdown (Opens Upwards) */}
          {isUserMenuOpen && (
            <div
              className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-2xl bg-white dark:bg-neutral-900 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800/90 shadow-2xl shadow-neutral-950/10 dark:shadow-black/80 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
              role="menu"
              aria-orientation="vertical"
            >
              {/* Header Info */}
              <div className="px-2.5 py-2 mb-1 border-b border-neutral-200 dark:border-neutral-800/80 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-medium text-[11px] shrink-0 overflow-hidden">
                  {hasAvatar ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="w-full h-full object-cover rounded-full"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    userInitial
                  )}
                </div>
                <div className="min-w-0 truncate">
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{userEmail}</p>
                </div>
              </div>

              {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
              <button
                type="button"
                onClick={handleNavigateToProfile}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                  <span>{t('nav.my_profile', 'Mi Perfil')}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
              </button>

              {/* 2. Apariencia */}
              <button
                type="button"
                onClick={() => toggleTheme()}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleTheme();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer select-none group text-left"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <Moon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-500 group-hover:text-amber-600 transition-colors" />
                  )}
                  <span>{t('nav.appearance', 'Apariencia')}</span>
                </span>
                <span className="text-[10px] text-neutral-600 dark:text-neutral-300 bg-neutral-200/80 dark:bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium capitalize">
                  {theme === 'dark' ? t('nav.dark_mode', 'Oscuro') : t('nav.light_mode', 'Claro')}
                </span>
              </button>

              {/* 3. Suscripción (PRO) */}
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  openProModal();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-purple-50 hover:bg-purple-100/80 dark:bg-gradient-to-r dark:from-purple-500/15 dark:via-violet-500/10 dark:to-transparent border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-200 hover:border-purple-300 dark:hover:border-purple-400/50 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                  <span className="font-semibold text-purple-700 dark:text-purple-200 group-hover:text-purple-900 dark:group-hover:text-white transition-colors">{t('nav.subscription', 'Suscripción')}</span>
                </span>
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/25 border border-purple-300 dark:border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm">
                  PRO
                </span>
              </button>

              {/* 4. Soporte y Feedback */}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  openFeedback();
                  setIsUserMenuOpen(false);
                }}
                onSelect={(e) => {
                  e.preventDefault();
                  openFeedback();
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-700 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer pointer-events-auto group text-left active:scale-[0.99]"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <LifeBuoy className="w-4 h-4 text-purple-500 dark:text-purple-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors shrink-0" />
                  <span>{t('nav.support_feedback', 'Soporte y Feedback')}</span>
                </span>
              </button>

              {/* 5. Política de Privacidad */}
              <Link
                href="/privacidad"
                onClick={() => setIsUserMenuOpen(false)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors group text-left"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
                  <span>{t('nav.privacy', 'Política de Privacidad')}</span>
                </span>
              </Link>

              {/* Línea divisoria / Separador */}
              <div className="my-1 border-t border-neutral-200 dark:border-neutral-800/80" />

              {/* 5. Cerrar Sesión (Activo, tono rojo suave) */}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                role="menuitem"
              >
                <LogOut className="w-4 h-4 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
                <span className="font-medium">{t('nav.logout', 'Cerrar Sesión')}</span>
              </button>

              {/* 6. Eliminar Cuenta */}
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsDeleteModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                role="menuitem"
              >
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-500 group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors" />
                <span className="font-medium">{t('nav.delete_account', 'Eliminar Cuenta')}</span>
              </button>
            </div>
          )}

          {/* Interactive User Box Button */}
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
            className="w-full flex items-center justify-between p-2 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 hover:bg-neutral-100 dark:hover:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700/80 transition-all duration-150 text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-medium text-xs shrink-0 group-hover:border-indigo-400/50 transition-colors overflow-hidden">
                {hasAvatar ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover rounded-full"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  userInitial
                )}
              </div>
              <div className="truncate min-w-0">
                <p className="text-xs font-medium text-neutral-900 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                  {displayName}
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  {profile.username ? `@${profile.username}` : (userEmail || 'Estudiante')}
                </p>
              </div>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors shrink-0 ml-1" />
          </button>

          {/* Enlace discreto a Política de Privacidad */}
          <div className="pt-2 text-center">
            <Link
              href="/privacidad"
              className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 transition-colors inline-block"
            >
              {t('nav.privacy', 'Política de Privacidad')}
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={
          isStudyPage
            ? "flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden"
            : isExamPage
            ? "flex-1 flex flex-col min-w-0 min-h-screen w-full overflow-y-auto"
            : "flex-1 flex flex-col min-w-0"
        }
      >
        {!isFullscreen && (
          <header className="hidden md:flex items-center justify-end px-8 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <LanguageSelector />
              <StreakBadge />
            </div>
          </header>
        )}
        <main
          className={
            isStudyPage
              ? "flex-1 w-full mx-auto h-full flex flex-col p-2 sm:p-4 max-w-4xl overflow-hidden"
              : isExamPage
              ? "flex-1 w-full mx-auto min-h-screen flex flex-col p-2 sm:p-4 max-w-5xl overflow-y-auto"
              : "flex-1 p-4 sm:p-8 md:p-10 max-w-6xl w-full mx-auto"
          }
        >
          {children}
        </main>
      </div>

      {/* Modal de Bienvenida Onboarding */}
      <WelcomeTutorial />

      {/* Modal de Suscripción PRO */}
      <ProModal />

      {/* Modal de Confirmación de Eliminación de Cuenta */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />

      {/* Modal de Soporte y Feedback con Resend */}
      <FeedbackModal />
    </div>
  );
}

