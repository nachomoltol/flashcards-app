import { Resend } from 'resend';

// Instanciar cliente oficial de Resend con la variable de entorno RESEND_API_KEY
// Fallback para evitar errores durante compilación estática o recolección de rutas de Next.js
export const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_for_build');

// Remitente del sistema verificado (nunca usar el email del usuario para evitar bloqueos anti-spoofing)
export const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// Destinatario oficial del equipo de soporte
export const ADMIN_FEEDBACK_EMAIL =
  process.env.ADMIN_FEEDBACK_EMAIL || 'migarecetasredes@gmail.com';

// Alias para mantener compatibilidad con imports existentes
export const DEFAULT_FROM_EMAIL = RESEND_FROM_EMAIL;
