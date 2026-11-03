import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, RESEND_FROM_EMAIL } from '@/lib/resend';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function getEmailTemplate(otpCode: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Verificación - Flashmente</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0a0a0a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" max-width="520" style="max-width: 520px; background-color: #121215; border: 1px solid #26262a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);" cellspacing="0" cellpadding="0" border="0">
          
          <!-- Header Banner -->
          <tr>
            <td align="center" style="padding: 36px 24px 20px 24px; border-bottom: 1px solid #1f1f23;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <div style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                      ⚡ Flash<span style="color: #818cf8;">mente</span>
                    </div>
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #f59e0b; margin-top: 4px; font-weight: 600;">
                      Repetición Espaciada Inteligente
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 12px 0; text-align: center;">
                Confirma tu cuenta
              </h1>
              <p style="font-size: 14px; line-height: 22px; color: #9ca3af; margin: 0 0 24px 0; text-align: center;">
                ¡Gracias por registrarte en Flashmente! Introduce el siguiente código de verificación en la aplicación para activar tu cuenta y comenzar a estudiar:
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
                <tr>
                  <td align="center" style="background-color: #1a1a22; border: 1px solid #3730a3; border-radius: 12px; padding: 24px 16px;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #a5b4fc; margin-bottom: 8px; font-weight: 600;">
                      Código de Activación
                    </div>
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 0.25em; color: #ffffff; text-shadow: 0 0 20px rgba(129, 140, 248, 0.4);">
                      ${otpCode}
                    </div>
                    <div style="font-size: 11px; color: #71717a; margin-top: 10px;">
                      Válido durante 1 hora • No lo compartas con nadie
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Button -->
              ${
                actionLink
                  ? `
              <div style="text-align: center; margin-top: 28px; margin-bottom: 20px;">
                <p style="font-size: 12px; color: #71717a; margin-bottom: 12px;">
                  O si lo prefieres, valida tu cuenta haciendo clic directamente:
                </p>
                <a href="${actionLink}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
                  Verificar automáticamente
                </a>
              </div>
              `
                  : ''
              }

              <!-- Security Notice -->
              <p style="font-size: 11px; line-height: 18px; color: #71717a; margin: 24px 0 0 0; text-align: center; border-top: 1px solid #1f1f23; padding-top: 20px;">
                Si tú no has solicitado este registro o no has creado una cuenta en Flashmente, puedes ignorar este correo sin problema; no se activará ningún servicio.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d0d10; padding: 20px 24px; text-align: center; border-top: 1px solid #1a1a1f;">
              <p style="font-size: 11px; color: #52525b; margin: 0;">
                © 2026 Flashmente • Potenciado por Algoritmo FSRS y Gemini Flash
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const cleanPassword = typeof body.password === 'string' ? body.password : undefined;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Por favor, introduce un correo electrónico válido.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[send-otp] Error: Variables de entorno de Supabase Service Role no configuradas.');
      return NextResponse.json(
        { success: false, error: 'Error de configuración interna del servidor.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Generar link y código OTP numérico mediante la API Admin de Supabase
    const linkOptions = {
      type: 'signup' as const,
      email: cleanEmail,
      password: cleanPassword || 'FlashmenteOtpDummy123!@#',
      options: {
        redirectTo: 'https://www.flashmente.com/auth/callback',
      },
    };

    const genResult = await supabaseAdmin.auth.admin.generateLink(linkOptions);

    if (genResult.error) {
      console.warn('[send-otp] Advertencia al generar link:', genResult.error);

      // Si el usuario ya está confirmado
      if (genResult.error.code === 'email_exists') {
        return NextResponse.json({
          success: false,
          alreadyConfirmed: true,
          message: 'Tu correo ya está verificado. Puedes iniciar sesión directamente.',
        });
      }

      // Si el usuario no existe y no se proporcionó contraseña
      if (genResult.error.code === 'validation_failed') {
        return NextResponse.json(
          {
            success: false,
            notFound: true,
            error: 'No se encontró ninguna cuenta pendiente de verificación con este correo.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: false, error: genResult.error.message || 'Error al generar código de verificación.' },
        { status: 400 }
      );
    }

    const otpCode = genResult.data?.properties?.email_otp;
    const actionLink = genResult.data?.properties?.action_link || '';

    if (!otpCode) {
      console.error('[send-otp] No se pudo obtener el email_otp de Supabase Admin:', genResult.data);
      return NextResponse.json(
        { success: false, error: 'No se pudo generar el código numérico de verificación.' },
        { status: 500 }
      );
    }

    // 2. Enviar el correo inmediatamente mediante el SDK oficial de Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey || resendApiKey.startsWith('re_placeholder')) {
      console.error('[send-otp] Error: RESEND_API_KEY no configurada en el servidor.');
      return NextResponse.json(
        { success: false, error: 'Servicio de correo temporalmente no disponible.' },
        { status: 500 }
      );
    }

    const fromAddress = RESEND_FROM_EMAIL || 'Flashmente <hola@flashmente.com>';
    const subject = `Tu código de verificación de Flashmente: [${otpCode}]`;
    const htmlContent = getEmailTemplate(otpCode, actionLink);

    console.log(`[send-otp] Despachando correo Resend para ${cleanEmail} con OTP: [${otpCode}] desde ${fromAddress}...`);

    const { data: resendData, error: resendError } = await resend.emails.send({
      from: fromAddress,
      to: [cleanEmail],
      subject,
      html: htmlContent,
    });

    if (resendError) {
      console.error('[send-otp] Error devuelto por Resend:', resendError);
      return NextResponse.json(
        { success: false, error: resendError.message || 'Error al entregar el correo de verificación con Resend.' },
        { status: 500 }
      );
    }

    console.log(`[send-otp] Correo enviado exitosamente con Resend. ID: ${resendData?.id}`);

    return NextResponse.json({
      success: true,
      message: 'Código de verificación enviado exitosamente por correo.',
      messageId: resendData?.id,
    });
  } catch (err: unknown) {
    console.error('[send-otp] Excepción no controlada:', err);
    const message = err instanceof Error ? err.message : 'Error interno al procesar el envío del código OTP.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

