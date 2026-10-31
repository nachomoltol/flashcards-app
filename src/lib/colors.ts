import React from 'react';

export interface ColorOption {
  name: string;
  hex: string;
}

/**
 * Paleta de colores distintivos moderna para carpetas y mazos de estudio.
 * Diseñada para mantener excelente contraste y armonía visual tanto en temas claros como oscuros.
 */
export const COLOR_PALETTE: ColorOption[] = [
  { name: 'Pizarra', hex: '#64748b' },
  { name: 'Rojo', hex: '#ef4444' },
  { name: 'Naranja', hex: '#f97316' },
  { name: 'Ámbar', hex: '#f59e0b' },
  { name: 'Lima', hex: '#84cc16' },
  { name: 'Esmeralda', hex: '#10b981' },
  { name: 'Verde Mar', hex: '#14b8a6' },
  { name: 'Cian', hex: '#06b6d4' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Índigo', hex: '#6366f1' },
  { name: 'Violeta', hex: '#8b5cf6' },
  { name: 'Fucsia', hex: '#d946ef' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Carmesí', hex: '#be123c' },
];

/**
 * Genera un conjunto de variables CSS basadas en el color distintivo del mazo o carpeta.
 * Permite usar clases utilitarias de Tailwind CSS v4 como `bg-[var(--deck-accent)]`
 * sin sufrir purgado de clases dinámicas ni requerir configuración estática de safelist.
 *
 * @param colorHex Color en formato hexadecimal (#rrggbb). Por defecto '#6366f1' (Índigo).
 * @returns Objeto compatible con React.CSSProperties para inyectar en `style`
 */
export function getDeckColorStyles(colorHex?: string | null): React.CSSProperties {
  // Normalizar valor base
  let base = (colorHex || '').trim();
  if (!base || !base.startsWith('#') || (base.length !== 7 && base.length !== 4)) {
    base = '#6366f1';
  }

  // Si viene en formato corto #rgb, expandir a #rrggbb
  if (base.length === 4) {
    base = `#${base[1]}${base[1]}${base[2]}${base[2]}${base[3]}${base[3]}`;
  }

  return {
    '--deck-accent': base,
    '--deck-accent-10': `${base}1a`, // ~10% de opacidad
    '--deck-accent-20': `${base}33`, // ~20% de opacidad
    '--deck-accent-40': `${base}66`, // ~40% de opacidad
  } as React.CSSProperties;
}
