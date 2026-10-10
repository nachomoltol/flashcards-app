'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, useProfileStore, useLanguageStore } from '@/stores';
import { supabase } from '@/lib/supabase';
import {
  User as UserIcon,
  Moon,
  Sparkles,
  HelpCircle,
  LogOut,
  ChevronsUpDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { WelcomeTutorial } from '@/components/onboarding/WelcomeTutorial';
import { ProModal } from '@/components/subscription/ProModal';
import { useProModalStore } from '@/stores/useProModalStore';

interface NavItem {
  name: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

const navItems: NavItem[] = [
  {
    name: 'Mazos',
    href: '/',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    ),
  },
  {
    name: 'Estadísticas',
    href: '/stats',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    name: 'Configuración',
    href: '/settings',
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
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
  const { openProModal } = useProModalStore();
  const [isMounted, setIsMounted] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);
  const { user, initialize, signOut, isLoading } = useAuthStore();
  const { profile, fetchProfile } = useProfileStore();
  const { t } = useLanguageStore();
  const [avatarError, setAvatarError] = useState(false);

  const getNavLabel = (item: NavItem) => {
    if (item.href === '/') return t('nav.decks', 'Mazos');
    if (item.href === '/stats') return t('nav.stats', 'Estadísticas');
    if (item.href === '/settings') return t('nav.settings', 'Configuración');
    return item.name;
  };

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
  const isStudyPage = pathname?.startsWith('/study');

  return (
    <div className={isStudyPage ? "h-[100dvh] md:min-h-screen bg-neutral-950 text-neutral-100 flex flex-col md:flex-row overflow-hidden" : "min-h-screen bg-neutral-950 text-neutral-100 flex flex-col md:flex-row"}>
      {/* Mobile Top Bar (Oculto en Modo Estudio para permitir pantalla completa real) */}
      {!isStudyPage && (
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/50 backdrop-blur sticky top-0 z-40">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-10 h-10 rounded-lg object-contain shadow-sm"
            />
            <span className="font-semibold text-white tracking-tight text-base">Flashmente</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Mobile User Profile Avatar & Dropdown */}
          <div className="relative" ref={mobileUserMenuRef}>
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
                className="absolute right-0 top-full mt-2 w-64 z-50 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-neutral-800/90 shadow-2xl shadow-black/80 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-150"
                role="menu"
                aria-orientation="vertical"
              >
                {/* Header Info */}
                <div className="px-2.5 py-2 mb-1 border-b border-neutral-800/80 flex items-center gap-2.5">
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
                    <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{userEmail}</p>
                  </div>
                </div>

                {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
                <button
                  type="button"
                  onClick={handleNavigateToProfile}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                    <span>{t('nav.my_profile', 'Mi Perfil')}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                </button>

                {/* 2. Apariencia (Inactivo) */}
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors cursor-not-allowed select-none group text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Moon className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                    <span>{t('nav.appearance', 'Apariencia')}</span>
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium">
                    {t('nav.dark_mode', 'Oscuro')}
                  </span>
                </button>

                {/* 3. Suscripción (PRO) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileUserMenuOpen(false);
                    openProModal();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-purple-500/15 via-violet-500/10 to-transparent border border-purple-500/30 text-purple-100 hover:border-purple-400/50 hover:bg-purple-500/20 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors shrink-0" />
                    <span className="font-semibold text-purple-200 group-hover:text-white transition-colors">{t('nav.subscription', 'Suscripción')}</span>
                  </span>
                  <span className="text-[10px] font-bold text-purple-300 bg-purple-500/25 border border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm shadow-purple-500/20">
                    PRO
                  </span>
                </button>

                {/* 4. Soporte y Feedback (Inactivo) */}
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors cursor-not-allowed select-none group text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                    <span>{t('nav.support_feedback', 'Soporte y Feedback')}</span>
                  </span>
                </button>

                {/* 5. Política de Privacidad */}
                <Link
                  href="/privacidad"
                  onClick={() => setIsMobileUserMenuOpen(false)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-colors group text-left"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                    <span>{t('nav.privacy', 'Política de Privacidad')}</span>
                  </span>
                </Link>

                {/* Separador */}
                <div className="my-1 border-t border-neutral-800/80" />

                {/* 5. Cerrar Sesión (Activo) */}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-300 transition-colors" />
                  <span className="font-medium">{t('nav.logout', 'Cerrar Sesión')}</span>
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
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/60 transition cursor-pointer"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>
      )}

      {/* Mobile Menu Drawer */}
      {!isStudyPage && mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-800 bg-neutral-900/95 backdrop-blur px-4 py-3 space-y-3 z-30">
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
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {getNavLabel(item)}
                </Link>
              );
            })}
          </div>

          {/* User profile & full options in mobile drawer */}
          <div className="pt-3 border-t border-neutral-800/80 space-y-1">
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
                <p className="text-xs font-medium text-neutral-200 truncate">{displayName}</p>
                <p className="text-[10px] text-neutral-500 truncate">
                  {profile.username ? `@${profile.username}` : (userEmail || 'Estudiante')}
                </p>
              </div>
            </div>

            {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
            <button
              type="button"
              onClick={handleNavigateToProfile}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                <span>Mi Perfil</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
            </button>

            {/* 2. Apariencia (Inactivo) */}
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 cursor-not-allowed select-none text-left"
            >
              <span className="flex items-center gap-2.5">
                <Moon className="w-4 h-4 text-neutral-500" />
                <span>Apariencia</span>
              </span>
              <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium">
                Oscuro
              </span>
            </button>

            {/* 3. Suscripción (PRO) */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                openProModal();
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-purple-500/15 via-violet-500/10 to-transparent border border-purple-500/30 text-purple-100 hover:border-purple-400/50 hover:bg-purple-500/20 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
              role="menuitem"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors shrink-0" />
                <span className="font-semibold text-purple-200 group-hover:text-white transition-colors">Suscripción</span>
              </span>
              <span className="text-[10px] font-bold text-purple-300 bg-purple-500/25 border border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm shadow-purple-500/20">
                PRO
              </span>
            </button>

            {/* 4. Soporte y Feedback */}
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 cursor-not-allowed select-none text-left"
            >
              <span className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-neutral-500" />
                <span>Soporte y Feedback</span>
              </span>
            </button>

            {/* Política de Privacidad */}
            <Link
              href="/privacidad"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-colors text-left"
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-neutral-500" />
                <span>{t('nav.privacy', 'Política de Privacidad')}</span>
              </span>
            </Link>

            {/* Separador */}
            <div className="my-1 border-t border-neutral-800/80" />

            {/* 5. Cerrar Sesión */}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span className="font-medium">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (Oculto en Modo Estudio para inmersión total) */}
      <aside className={isStudyPage ? "hidden" : "hidden md:flex flex-col w-64 border-r border-neutral-800/70 bg-neutral-900/30 backdrop-blur-xl shrink-0 p-4 justify-between h-screen sticky top-0"}>
        <div className="space-y-6">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center gap-3 px-2 py-2 group">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-10 h-10 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform duration-200"
            />
            <div>
              <span className="font-semibold text-white tracking-tight block text-base">
                Flashmente
              </span>
              <span className="text-[11px] text-amber-400 font-mono tracking-wider uppercase block">
                FSRS Spaced Rep
              </span>
            </div>
          </Link>

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
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm shadow-indigo-900/20'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-neutral-400'}`} />
                  {getNavLabel(item)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Profile Dropdown */}
        <div className="relative pt-4 border-t border-neutral-800/80" ref={userMenuRef}>
          {/* Popover Dropdown (Opens Upwards) */}
          {isUserMenuOpen && (
            <div
              className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-neutral-800/90 shadow-2xl shadow-black/80 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
              role="menu"
              aria-orientation="vertical"
            >
              {/* Header Info */}
              <div className="px-2.5 py-2 mb-1 border-b border-neutral-800/80 flex items-center gap-2.5">
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
                  <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-neutral-400 truncate">{userEmail}</p>
                </div>
              </div>

              {/* 1. Mi Perfil (Habilitado -> redirige a /settings#profile-section) */}
              <button
                type="button"
                onClick={handleNavigateToProfile}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition-colors cursor-pointer group text-left"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <UserIcon className="w-4 h-4 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                  <span>{t('nav.my_profile', 'Mi Perfil')}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
              </button>

              {/* 2. Apariencia (Inactivo con icono de luna/sol) */}
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors cursor-not-allowed select-none group text-left"
              >
                <span className="flex items-center gap-2.5">
                  <Moon className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                  <span>{t('nav.appearance', 'Apariencia')}</span>
                </span>
                <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded font-medium">
                  {t('nav.dark_mode', 'Oscuro')}
                </span>
              </button>

              {/* 3. Suscripción (PRO) */}
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  openProModal();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-purple-500/15 via-violet-500/10 to-transparent border border-purple-500/30 text-purple-100 hover:border-purple-400/50 hover:bg-purple-500/20 transition-all cursor-pointer select-none group text-left active:scale-[0.98]"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors shrink-0" />
                  <span className="font-semibold text-purple-200 group-hover:text-white transition-colors">{t('nav.subscription', 'Suscripción')}</span>
                </span>
                <span className="text-[10px] font-bold text-purple-300 bg-purple-500/25 border border-purple-500/40 px-2 py-0.5 rounded-full shadow-sm shadow-purple-500/20">
                  PRO
                </span>
              </button>

              {/* 4. Soporte y Feedback (Inactivo) */}
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors cursor-not-allowed select-none group text-left"
              >
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-neutral-500 group-hover:text-neutral-400" />
                  <span>{t('nav.support_feedback', 'Soporte y Feedback')}</span>
                </span>
              </button>

              {/* 5. Política de Privacidad */}
              <Link
                href="/privacidad"
                onClick={() => setIsUserMenuOpen(false)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-colors group text-left"
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                  <span>{t('nav.privacy', 'Política de Privacidad')}</span>
                </span>
              </Link>

              {/* Línea divisoria / Separador */}
              <div className="my-1 border-t border-neutral-800/80" />

              {/* 5. Cerrar Sesión (Activo, tono rojo suave) */}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer group text-left"
                role="menuitem"
              >
                <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-300 transition-colors" />
                <span className="font-medium">{t('nav.logout', 'Cerrar Sesión')}</span>
              </button>
            </div>
          )}

          {/* Interactive User Box Button */}
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
            className="w-full flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/70 border border-neutral-800 hover:border-neutral-700/80 transition-all duration-150 text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
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
                <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white transition-colors">
                  {displayName}
                </p>
                <p className="text-[10px] text-neutral-500 truncate">
                  {profile.username ? `@${profile.username}` : (userEmail || 'Estudiante')}
                </p>
              </div>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors shrink-0 ml-1" />
          </button>

          {/* Enlace discreto a Política de Privacidad */}
          <div className="pt-2 text-center">
            <Link
              href="/privacidad"
              className="text-[11px] text-neutral-500 hover:text-neutral-400 transition-colors inline-block"
            >
              {t('nav.privacy', 'Política de Privacidad')}
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={isStudyPage ? "flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden" : "flex-1 flex flex-col min-w-0"}>
        <main
          className={
            isStudyPage
              ? "flex-1 w-full mx-auto h-full flex flex-col p-2 sm:p-4 max-w-4xl overflow-hidden"
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
    </div>
  );
}
