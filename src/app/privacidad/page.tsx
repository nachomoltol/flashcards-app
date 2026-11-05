import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldCheck,
  ArrowLeft,
  Database,
  Globe,
  Cpu,
  Lock,
  Megaphone,
  FileText,
  CreditCard,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { DeleteAccountRequestButton } from '@/components/privacy/DeleteAccountRequestButton';

export const metadata: Metadata = {
  title: 'Términos del Servicio y Política de Privacidad | Flashmente',
  description:
    'Términos del Servicio y Política de Privacidad de Flashmente. Información del titular responsable, uso de datos, Google AdMob (CMP/UMP), condiciones del modelo PRO y cumplimiento de la DSA y Google Play Store.',
  alternates: {
    canonical: 'https://flashmente.com/privacidad',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased selection:bg-amber-100 selection:text-amber-900">
      {/* Header de Navegación */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente Logo"
              className="w-9 h-9 rounded-lg object-contain shadow-xs group-hover:scale-105 transition-transform"
            />
            <span className="font-bold text-slate-900 text-lg tracking-tight">Flashmente</span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a la app</span>
          </Link>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 sm:p-12 space-y-10">
          {/* Título, Fecha e Identificación del Titular */}
          <div className="border-b border-slate-200 pb-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Documento Legal Oficial · Cumplimiento DSA y Google Play</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Términos del Servicio y Política de Privacidad de Flashmente
            </h1>
            <p className="text-sm font-medium text-slate-500">
              Última actualización: 5 de noviembre de 2026
            </p>

            {/* Tarjeta de Identificación del Titular Responsable (DSA / Google Play Trader Compliance) */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/80 text-xs sm:text-sm text-slate-700 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Identificación del Titular y Responsable del Tratamiento (DSA / Google Play)</span>
              </div>
              <p className="leading-relaxed">
                En cumplimiento del Reglamento (UE) 2016/679 (RGPD), la Ley de Servicios Digitales
                (DSA) y los requisitos de transparencia de Google Play Console, se informa que la
                aplicación y plataforma web <strong>Flashmente</strong> es operada por:
              </p>
              <ul className="space-y-1 pt-1 text-slate-800">
                <li>
                  <strong>Titular responsable:</strong> Ignacio Molina Toledo
                </li>
                <li>
                  <strong>Correo electrónico de contacto y soporte:</strong>{' '}
                  <a
                    href="mailto:nachomoltol@gmail.com"
                    className="font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900 transition-colors"
                  >
                    nachomoltol@gmail.com
                  </a>
                </li>
                <li>
                  <strong>Sitio web oficial:</strong>{' '}
                  <a
                    href="https://flashmente.com"
                    className="font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900 transition-colors"
                  >
                    https://flashmente.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Sección 1 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                1
              </span>
              Información que recopilamos
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Para proporcionar las funciones de la aplicación y garantizar su correcto
              funcionamiento, recopilamos la siguiente información:
            </p>
            <ul className="grid sm:grid-cols-2 gap-3 pt-1">
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Datos de registro:</strong> Dirección de correo electrónico y nombre
                  (opcional) al crear una cuenta.
                </span>
              </li>
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Identificadores de usuario:</strong> ID interno generado por el sistema de
                  autenticación y estado de suscripción (Plan Gratuito / PRO).
                </span>
              </li>
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Contenido educativo y progreso:</strong> Mazos de tarjetas (flashcards),
                  estadísticas de estudio y fragmentos de documentos procesados bajo demanda del
                  usuario.
                </span>
              </li>
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Datos publicitarios y de dispositivo (Plan Gratuito):</strong>{' '}
                  Identificadores de publicidad del dispositivo (como el ID de publicidad de Google /
                  AAID) e interacciones con anuncios a través de Google AdMob, sujetos a tu
                  consentimiento previo.
                </span>
              </li>
            </ul>
          </section>

          {/* Sección 2 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                2
              </span>
              Uso de la información
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Utilizamos los datos recopilados exclusivamente para las siguientes finalidades:
            </p>
            <ul className="space-y-2.5 pl-2">
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>Autenticar tu acceso a la aplicación y gestionar tu cuenta de usuario.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>
                  Sincronizar y guardar en la nube tus mazos de flashcards y tu progreso de estudio
                  con repetición espaciada (algoritmo FSRS).
                </span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>
                  Generar tarjetas de estudio mediante Inteligencia Artificial a partir de los
                  documentos o textos que decidas subir.
                </span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>
                  Mostrar anuncios y anuncios recompensados en la versión gratuita mediante Google
                  AdMob, o gestionar tu suscripción sin anuncios en el modelo Flashmente PRO.
                </span>
              </li>
            </ul>

            <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-sm font-medium flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                No vendemos tus datos personales ni tus documentos de estudio a terceros.
              </span>
            </div>
          </section>

          {/* Sección 3: Publicidad, Google AdMob y Consentimiento CMP/UMP */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                3
              </span>
              Publicidad (Google AdMob) y Plataforma de Consentimiento (CMP / UMP)
            </h2>
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 text-sm sm:text-base text-slate-700 leading-relaxed">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Megaphone className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Integración de Google AdMob y Google User Messaging Platform (UMP)</span>
              </div>
              <p>
                La modalidad gratuita de Flashmente se financia parcialmente mediante la inclusión de
                espacios publicitarios y anuncios recompensados proporcionados por{' '}
                <strong>Google AdMob</strong> (Google Ireland Limited / Google LLC). Para ello, el
                SDK de Google AdMob puede recopilar y procesar identificadores del dispositivo (como
                el Advertising ID de Android), datos de diagnóstico, ubicación aproximada asociada a
                la dirección IP y métricas de interacción con los anuncios para mostrar publicidad,
                prevenir el fraude y medir el rendimiento.
              </p>
              <p>
                En estricto cumplimiento del Reglamento General de Protección de Datos (RGPD) en el
                Espacio Económico Europeo (EEE), Reino Unido y normativas internacionales de
                privacidad, Flashmente integra la plataforma de gestión del consentimiento
                certificada por Google (<strong>CMP / Google User Messaging Platform - UMP</strong>{' '}
                bajo el marco TCF de IAB Europe). Antes de cargar anuncios personalizados, se te
                presentará el formulario oficial de consentimiento donde podrás aceptar, rechazar o
                configurar granularmente tus preferencias de privacidad y el uso de identificadores
                publicitarios.
              </p>
              <p className="text-xs sm:text-sm text-slate-600">
                Los usuarios suscritos al plan <strong>Flashmente PRO</strong> están exentos de
                publicidad dentro de la aplicación. Puedes consultar más detalles sobre cómo Google
                utiliza la información de aplicaciones que emplean sus servicios en{' '}
                <a
                  href="https://policies.google.com/technologies/partner-sites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900"
                >
                  policies.google.com/technologies/partner-sites
                </a>
                .
              </p>
            </div>
          </section>

          {/* Sección 4 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                4
              </span>
              Proveedores de servicios (Terceros)
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Utilizamos proveedores tecnológicos de primer nivel para el funcionamiento de la
              aplicación, los cuales cumplen con altos estándares de seguridad, privacidad y cifrado:
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Supabase</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para la base de datos en la nube y la autenticación segura de usuarios.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Globe className="w-4 h-4 text-sky-600" />
                  <span>Vercel</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para el alojamiento web, servidores sin estado (serverless) y distribución segura.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  <span>Google Gemini (IA)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para el procesamiento de texto y generación automatizada de flashcards.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Megaphone className="w-4 h-4 text-amber-600" />
                  <span>Google AdMob & UMP</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para la gestión del consentimiento (CMP/UMP) y visualización de anuncios en el
                  plan gratuito.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span>Stripe / Pasarelas Oficiales</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para el procesamiento seguro de pagos del plan PRO sin almacenar datos bancarios en
                  nuestros servidores.
                </p>
              </div>
            </div>
          </section>

          {/* Sección 5 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                5
              </span>
              Seguridad de los datos
            </h2>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 text-sm sm:text-base leading-relaxed flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
              <span>
                Toda la información transmitida entre la aplicación y nuestros servidores está
                cifrada en tránsito mediante protocolos seguros (HTTPS/SSL/TLS) y protegida mediante
                políticas de aislamiento por usuario en base de datos.
              </span>
            </div>
          </section>

          {/* Sección 6 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                6
              </span>
              Eliminación de la cuenta y derechos de privacidad del usuario
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Tienes derecho a acceder, rectificar, portar o solicitar la eliminación total de tu
              cuenta y de todos los datos asociados (incluyendo tus mazos, tarjetas y progreso de
              estudio) en cualquier momento.
            </p>
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3 text-sm text-slate-700 leading-relaxed">
              <p>
                Para solicitar la eliminación definitiva de tu cuenta, envía un correo electrónico al
                responsable (<strong>Ignacio Molina Toledo</strong>) a{' '}
                <a
                  href="mailto:nachomoltol@gmail.com?subject=Eliminar%20cuenta"
                  className="font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900 transition-colors"
                >
                  nachomoltol@gmail.com
                </a>{' '}
                desde la dirección de correo con la que te registraste, indicando en el asunto{' '}
                <span className="font-semibold text-slate-900 bg-slate-200/70 px-1.5 py-0.5 rounded">
                  &quot;Eliminar cuenta&quot;
                </span>
                . Procesaremos tu solicitud y eliminaremos todos tus datos de nuestros servidores en
                un plazo máximo de 30 días.
              </p>
              <div className="pt-1">
                <DeleteAccountRequestButton />
              </div>
            </div>
          </section>

          {/* Sección 7: Términos y Condiciones del Servicio y Modelo PRO */}
          <section className="space-y-4 border-t border-slate-200 pt-8">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                7
              </span>
              Términos y Condiciones de Uso del Servicio y Modelo PRO
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              El acceso y uso de la aplicación web y móvil <strong>Flashmente</strong> atribuye la
              condición de usuario e implica la aceptación de las siguientes condiciones de uso:
            </p>

            <div className="space-y-3.5">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <FileText className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>7.1. Naturaleza del servicio y uso permitido</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  Flashmente es una herramienta educativa de estudio activo y repetición espaciada
                  asistida por Inteligencia Artificial. El usuario se compromete a hacer un uso
                  lícito de la plataforma y garantiza disponer de los permisos o derechos necesarios
                  sobre los documentos o apuntes que procesa para su estudio personal o preparación
                  docente. Las tarjetas generadas por IA constituyen material de apoyo pedagógico y
                  no sustituyen el criterio académico o profesional del usuario.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>7.2. Plan Gratuito y Suscripción Flashmente PRO</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  Flashmente ofrece una <strong>modalidad gratuita</strong> con funciones completas
                  de repaso y cuota diaria de generación con IA (ampliable mediante anuncios
                  recompensados de Google AdMob), así como una{' '}
                  <strong>modalidad de pago (Flashmente PRO)</strong> que elimina la publicidad y
                  desbloquea límites ampliados de generación con IA y modos avanzados de estudio. Los
                  precios, impuestos incluidos, condiciones de renovación y métodos de cancelación se
                  muestran de forma clara y transparente antes de completar cualquier compra. El
                  usuario puede gestionar o cancelar su suscripción PRO en cualquier momento sin
                  penalización, manteniendo los beneficios contratados hasta el final del periodo de
                  facturación en curso.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>7.3. Atención al usuario, reclamaciones y contacto del operador</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  Para cualquier consulta técnica, ejercicio de derechos de consumidor, facturación
                  del modelo PRO o comunicación legal relacionada con la Ley de Servicios Digitales
                  (DSA) y Google Play Store, el titular responsable{' '}
                  <strong>Ignacio Molina Toledo</strong> atiende directamente en el correo
                  electrónico{' '}
                  <a
                    href="mailto:nachomoltol@gmail.com"
                    className="font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900"
                  >
                    nachomoltol@gmail.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          {/* Sección 8 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                8
              </span>
              Cambios en esta política y términos del servicio
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Podemos actualizar estos Términos del Servicio y Política de Privacidad ocasionalmente
              para reflejar mejoras en la aplicación o nuevos requisitos normativos. Te notificaremos
              cualquier cambio importante publicando la versión actualizada en esta misma página con
              su fecha de revisión vigente.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500 space-y-1">
          <p>© 2026 Flashmente · Titular responsable: Ignacio Molina Toledo (nachomoltol@gmail.com)</p>
          <p>Todos los derechos reservados.</p>
        </footer>
      </main>
    </div>
  );
}
