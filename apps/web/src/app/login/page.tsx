import { redirect } from "next/navigation";
import { getSession } from "@/lib/session.ts";
import { buttonPrimary, input, label } from "../ui.ts";
import { loginAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "E-mail ou senha incorretos.",
  throttled: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/admin");
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">LinkQ · Operação</p>
      <h1 className="mt-3 font-serif text-5xl leading-none tracking-tight">Entrar</h1>
      <form action={loginAction} className="mt-10 space-y-5">
        <div>
          <label htmlFor="email" className={label}>
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className={input}
          />
        </div>
        <div>
          <label htmlFor="password" className={label}>
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={input}
          />
        </div>
        {message && (
          <p role="alert" className="text-sm text-red-400">
            {message}
          </p>
        )}
        <button type="submit" className={`${buttonPrimary} w-full`}>
          Continuar
        </button>
      </form>
    </main>
  );
}
