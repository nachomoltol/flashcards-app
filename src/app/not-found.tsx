import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-2xl shadow-inner">
        🔍
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Página no encontrada</h1>
      <p className="text-xs sm:text-sm text-neutral-400 max-w-sm">
        La sección o recurso que buscas no existe o ha cambiado de lugar.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition active:scale-95"
      >
        <span>Volver a Mazos</span>
      </Link>
    </div>
  );
}
