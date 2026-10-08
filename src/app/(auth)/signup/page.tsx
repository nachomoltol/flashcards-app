import { AuthForm } from '@/components/auth/AuthForm';

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <AuthForm initialMode="signup" />
    </main>
  );
}
