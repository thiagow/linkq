import { requireOperator } from "@/lib/session.ts";
import { buttonPrimary, card, input, label } from "../../ui.ts";
import { changePasswordAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await requireOperator();
  const { error, saved } = await searchParams;

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-4xl tracking-tight">Conta</h1>
      <p className="mt-2 font-mono text-xs text-muted">{session.email}</p>

      <section className={`${card} mt-8`}>
        <h2 className="font-serif text-2xl">Alterar senha</h2>
        <p className="mt-1 text-sm text-muted">
          Exige a senha atual. As outras sessões abertas serão encerradas.
        </p>
        {saved && (
          <output className="mt-4 block text-sm text-emerald-300">
            Senha alterada com sucesso.
          </output>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}
        <form action={changePasswordAction} className="mt-5 space-y-5">
          <div>
            <label htmlFor="current" className={label}>
              Senha atual
            </label>
            <input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className={input}
            />
          </div>
          <div>
            <label htmlFor="next" className={label}>
              Nova senha (mínimo 12 caracteres)
            </label>
            <input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className={input}
            />
          </div>
          <div>
            <label htmlFor="confirm" className={label}>
              Confirmar nova senha
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className={input}
            />
          </div>
          <button type="submit" className={buttonPrimary}>
            Alterar senha
          </button>
        </form>
      </section>
    </div>
  );
}
