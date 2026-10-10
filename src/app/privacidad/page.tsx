import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Mail, ArrowLeft, Database, Globe, Cpu, Lock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Flashmente',
  description:
    'Política de Privacidad de Flashmente para la gestión segura de datos de usuario y cumplimiento de Google Play Store.',
  robots: {
    index: true,
    follow: true,
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
          {/* Título y Fecha */}
          <div className="border-b border-slate-200 pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-medium mb-4">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Documento Oficial</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Política de Privacidad de Flashmente
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-2">
              Última actualización: 10 de octubre de 2026
            </p>
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
              Para proporcionar las funciones de la aplicación, recopilamos la siguiente información
              personal al crear una cuenta:
            </p>
            <ul className="grid sm:grid-cols-3 gap-3 pt-1">
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>Dirección de correo electrónico.</span>
              </li>
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>Nombre (opcional).</span>
              </li>
              <li className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-slate-800 text-sm flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>Identificadores de usuario (ID interno generado por el sistema).</span>
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
              Utilizamos estos datos exclusivamente para:
            </p>
            <ul className="space-y-2.5 pl-2">
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>Autenticar tu acceso a la aplicación.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>Gestionar tu cuenta de usuario.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
                <span>
                  Sincronizar y guardar en la nube tus mazos de flashcards y tu progreso de estudio.
                </span>
              </li>
            </ul>

            <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-sm font-medium flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>No compartimos ni vendemos tu información personal a terceros.</span>
            </div>
          </section>

          {/* Sección 3 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                3
              </span>
              Proveedores de servicios (Terceros)
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Utilizamos servicios de terceros para el funcionamiento de la app, los cuales cumplen con
              altos estándares de seguridad y cifrado:
            </p>
            <div className="grid sm:grid-cols-3 gap-3.5 pt-1">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Supabase</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para la base de datos y la autenticación segura de usuarios.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Globe className="w-4 h-4 text-sky-600" />
                  <span>Vercel</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para el alojamiento web y de la aplicación.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  <span>Google Gemini (IA)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para la generación de texto de las flashcards.
                </p>
              </div>
            </div>
          </section>

          {/* Sección 4 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                4
              </span>
              Seguridad de los datos
            </h2>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 text-sm sm:text-base leading-relaxed flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
              <span>
                Toda la información transmitida entre la aplicación y nuestros servidores está cifrada
                en tránsito mediante protocolos seguros (HTTPS/SSL).
              </span>
            </div>
          </section>

          {/* Sección 5 */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                5
              </span>
              Eliminación de la cuenta y los datos de usuario
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Tienes el derecho de solicitar la eliminación total de tu cuenta y de todos los datos
              asociados (incluyendo tus mazos y progreso).
            </p>
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3 text-sm text-slate-700 leading-relaxed">
              <p>
                Para solicitar la eliminación, envía un correo electrónico a{' '}
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
                . Procesaremos tu solicitud y eliminaremos todos tus datos de nuestros servidores en un
                plazo máximo de 30 días.
              </p>
              <div className="pt-1">
                <a
                  href="mailto:nachomoltol@gmail.com?subject=Eliminar%20cuenta"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Enviar solicitud a nachomoltol@gmail.com</span>
                </a>
              </div>
            </div>
          </section>

          {/* Sección 6 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                6
              </span>
              Cambios en esta política
            </h2>
            <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
              Podemos actualizar esta política ocasionalmente. Te notificaremos cualquier cambio
              importante publicando la nueva política en esta misma página.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          <p>© 2026 Flashmente. Todos los derechos reservados.</p>
        </footer>
      </main>
    </div>
  );
}
