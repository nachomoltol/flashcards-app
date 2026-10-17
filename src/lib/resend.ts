import { Resend } from 'resend';

// Instanciar cliente oficial de Resend con la variable de entorno RESEND_API_KEY
// Fallback para evitar errores durante compilación estática o recolección de rutas de Next.js
export const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_for_build');

// Remitente y destinatario configurados según la Ficha Técnica
export const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Flashmente <hola@flashmente.com>';

export const ADMIN_FEEDBACK_EMAIL =
  process.env.ADMIN_FEEDBACK_EMAIL || 'nachomoltol@gmail.com';

// Alias para mantener compatibilidad con imports existentes
export const DEFAULT_FROM_EMAIL = RESEND_FROM_EMAIL;
