import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, RESEND_FROM_EMAIL, ADMIN_FEEDBACK_EMAIL } from '@/lib/resend';

interface FeedbackRequestBody {
  subject?: string;
  category?: string; // Fallback para compatibilidad con selectores de categoría
  message?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSubjectBadgeColors(subject: string): { bg: string; text: string; border: string } {
  const s = subject.toLowerCase();
  if (s.includes('error') || s.includes('bug') || s.includes('fallo')) {
    return { bg: '#451a1a', text: '#fca5a5', border: '#ef4444' };
  }
  if (s.includes('mejora') || s.includes('sugerencia') || s.includes('idea')) {
    return { bg: '#2e1065', text: '#d8b4fe', border: '#a855f7' };
  }
  if (s.includes('duda') || s.includes('técnica') || s.includes('tecnica') || s.includes('pregunta')) {
    return { bg: '#172554', text: '#93c5fd', border: '#3b82f6' };
  }
  return { bg: '#27272a', text: '#e4e4e7', border: '#71717a' };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Parsear el cuerpo de la petición
    let body: FeedbackRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'BAD_REQUEST',
          message: 'El cuerpo de la solicitud no contiene un JSON válido.',
        },
        { status: 400 }
      );
    }

    const subject = (body.subject || body.category || '').trim();
    const message = (body.message || '').trim();

    // 2. Validación estricta de parámetros
    if (!subject) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'El campo "subject" (asunto o tipo de consulta) es obligatorio.',
        },
        { status: 400 }
      );
    }

    if (!message || message.length < 5) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'El mensaje debe tener al menos 5 caracteres descriptivos.',
        },
        { status: 400 }
      );
    }

    if (message.length > 500) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'El mensaje excede el límite máximo de 500 caracteres.',
        },
        { status: 400 }
      );
    }

    // 3. Seguridad: Verificación de sesión con Supabase Server Client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'CONFIG_ERROR',
          message: 'Las variables de entorno de Supabase no están configuradas en el servidor.',
        },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    });

    const {
      data: { user: authUser },
      error: authError,
    } = token
      ? await supabaseServer.auth.getUser(token)
      : await supabaseServer.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'No autorizado. Se requiere una sesión válida de Supabase para enviar feedback.',
        },
        { status: 401 }
      );
    }

    const userId = authUser.id;
    const userEmail = authUser.email;

    if (!userEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_USER_DATA',
          message: 'El usuario autenticado en Supabase no posee una dirección de correo válida.',
        },
        { status: 400 }
      );
    }

    // Obtener nombre desde el perfil en Supabase o metadatos de usuario
    let userName: string =
      (authUser.user_metadata?.full_name as string) ||
      (authUser.user_metadata?.name as string) ||
      (authUser.user_metadata?.user_name as string) ||
      '';

    try {
      const { data: profile } = await supabaseServer
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.full_name) {
        userName = profile.full_name;
      } else if (!userName && profile?.username) {
        userName = profile.username;
      }
    } catch (profileErr) {
      console.warn('Advertencia no bloqueante al consultar perfil de usuario en Supabase:', profileErr);
    }

    if (!userName) {
      userName = userEmail.split('@')[0] || 'Usuario de Flashmente';
    }

    // 4. Verificación de configuración de Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey || resendApiKey.startsWith('re_placeholder') || resendApiKey.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'CONFIG_ERROR',
          message: 'La variable de entorno RESEND_API_KEY no está configurada en el servidor.',
        },
        { status: 500 }
      );
    }

    // 5. Configuración estricta de destinatario, remitente y cabeceras anti-spoofing
    // - to: Correo oficial del equipo de soporte de Flashmente
    // - from: Correo de sistema verificado (onboarding@resend.dev o dominio verificado configurado)
    // - reply_to: Correo del usuario logueado (userEmail) para respuesta directa en un clic
    const toEmail = process.env.ADMIN_FEEDBACK_EMAIL || ADMIN_FEEDBACK_EMAIL || 'support@flashmente.com';
    const fromEmail = process.env.RESEND_FROM_EMAIL || RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const replyToAddress = userEmail;

    // Asunto estandarizado de soporte Flashmente
    const emailSubject = `[Soporte Flashmente] - ${subject} - ${userEmail}`;

    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'Europe/Madrid',
    }).format(now);

    const badgeColors = getSubjectBadgeColors(subject);
    const sanitizedSubject = escapeHtml(subject);
    const sanitizedMessage = escapeHtml(message).replace(/\n/g, '<br/>');
    const sanitizedUserName = escapeHtml(userName);
    const sanitizedUserEmail = escapeHtml(userEmail);
    const sanitizedUserId = escapeHtml(userId);

    // 6. Diseño de Plantilla HTML "Dark Mode" Elegante con visualización clara de remitente, categoría y mensaje
    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Soporte Flashmente - Nuevo Ticket</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0c0a09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0a09; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal Dark Mode -->
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #171717; border-radius: 16px; border: 1px solid #262626; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);">
          
          <!-- Encabezado con degradado moderno de Flashmente -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 28px 32px; text-align: left;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #e9d5ff; display: inline-block; margin-bottom: 6px;">
                      FLASHMENTE • NUEVO TICKET DE SOPORTE
                    </span>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      ${sanitizedSubject}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Insignia de Categoría -->
          <tr>
            <td style="padding: 24px 32px 12px 32px;">
              <div style="display: inline-block; background-color: ${badgeColors.bg}; border: 1px solid ${badgeColors.border}; border-radius: 9999px; padding: 6px 16px;">
                <span style="color: ${badgeColors.text}; font-size: 13px; font-weight: 600; letter-spacing: 0.3px;">
                  📌 Categoría: ${sanitizedSubject}
                </span>
              </div>
            </td>
          </tr>

          <!-- Contenido del Mensaje del Usuario -->
          <tr>
            <td style="padding: 12px 32px 24px 32px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #a1a1aa;">
                Mensaje detallado:
              </p>
              <div style="background-color: #0f0f10; border: 1px solid #262626; border-left: 4px solid #7c3aed; border-radius: 12px; padding: 20px; line-height: 1.6; font-size: 15px; color: #f4f4f5;">
                <p style="margin: 0; white-space: pre-wrap; word-break: break-word;">${sanitizedMessage}</p>
              </div>
            </td>
          </tr>

          <!-- Divisor sutil -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="border-top: 1px solid #262626;"></div>
            </td>
          </tr>

          <!-- Información de Quién lo Envía (Usuario Autenticado) -->
          <tr>
            <td style="padding: 24px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #a1a1aa;">
                Datos de Quién lo Envía (Usuario Autenticado)
              </h2>
              
              <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 8px 0; color: #71717a; width: 140px; vertical-align: top;">Remitente:</td>
                  <td style="padding: 8px 0;">
                    <a href="mailto:${sanitizedUserEmail}" style="color: #c084fc; text-decoration: none; font-weight: 700;">
                      ${sanitizedUserEmail}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #71717a; vertical-align: top;">Nombre:</td>
                  <td style="padding: 8px 0; color: #ffffff; font-weight: 600;">${sanitizedUserName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #71717a; vertical-align: top;">User ID:</td>
                  <td style="padding: 8px 0; font-family: monospace; color: #a1a1aa; font-size: 12px;">${sanitizedUserId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #71717a; vertical-align: top;">Fecha y Hora:</td>
                  <td style="padding: 8px 0; color: #a1a1aa;">${formattedDate} (hora de Madrid)</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pie de correo con botón directo de respuesta -->
          <tr>
            <td style="background-color: #0a0a0a; border-top: 1px solid #262626; padding: 20px 32px; text-align: center;">
              <p style="margin: 0 0 12px 0; font-size: 12px; color: #71717a;">
                💡 Puedes responder directamente a este correo para escribir al usuario (<strong style="color: #d4d4d8;">${sanitizedUserEmail}</strong>).
              </p>
              <a href="mailto:${sanitizedUserEmail}?subject=Re:%20${encodeURIComponent(emailSubject)}" 
                 style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);">
                Responder al usuario (${sanitizedUserEmail})
              </a>
            </td>
          </tr>

        </table>

        <!-- Firma de pie -->
        <table role="presentation" width="100%" style="max-width: 600px; margin-top: 16px;">
          <tr>
            <td style="text-align: center; font-size: 11px; color: #52525b;">
              Flashmente • Módulo de Feedback y Soporte • Resend API
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    // Versión en texto plano para clientes de correo sin renderizado HTML
    const textEmail = `
[FLASHMENTE - SOPORTE Y FEEDBACK]
Asunto / Categoría: ${subject}
De: ${userEmail} (${userName})
Fecha: ${formattedDate}

MENSAJE DEL USUARIO:
----------------------------------------
${message}
----------------------------------------

DATOS IDENTIFICATIVOS:
Email: ${userEmail}
Nombre: ${userName}
User ID: ${userId}

(Al pulsar "Responder" en tu cliente de correo responderás directamente a ${userEmail}).
    `.trim();

    // 7. Envío del correo mediante Resend con cabeceras anti-spoofing verificadas
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: replyToAddress,
      subject: emailSubject,
      html: htmlEmail,
      text: textEmail,
    });

    if (resendError) {
      console.error('Error devuelto por la API de Resend:', resendError);
      return NextResponse.json(
        {
          success: false,
          error: 'RESEND_ERROR',
          message: resendError.message || 'Error al procesar el envío del correo en Resend.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Mensaje de soporte enviado exitosamente.',
        messageId: resendData?.id,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Excepción no controlada en /api/feedback:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Error interno al procesar el envío de feedback.';
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
