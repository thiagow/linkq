import { appBaseUrl } from "@/lib/links.ts";
import { requireOperator } from "@/lib/session.ts";
import { buttonPrimary, input, label } from "../../../ui.ts";
import { createCustomerAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOperator();
  const { error } = await searchParams;

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-4xl tracking-tight">Novo cliente</h1>
      <p className="mt-2 text-sm text-muted">
        Cadastra o recebedor Pix e gera as plaquinhas. A URL de cada plaquinha é permanente.
      </p>

      <form action={createCustomerAction} className="mt-8 space-y-5">
        <div>
          <label htmlFor="displayName" className={label}>
            Nome exibido na página
          </label>
          <input id="displayName" name="displayName" required maxLength={80} className={input} />
        </div>
        <div>
          <label htmlFor="key" className={label}>
            Chave Pix
          </label>
          <input
            id="key"
            name="key"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="CPF, CNPJ, e-mail, +55… ou chave aleatória"
            className={input}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="merchantName" className={label}>
              Nome do recebedor (banco)
            </label>
            <input
              id="merchantName"
              name="merchantName"
              required
              maxLength={60}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="city" className={label}>
              Cidade
            </label>
            <input id="city" name="city" required maxLength={60} className={input} />
          </div>
        </div>
        <div>
          <label htmlFor="code" className={label}>
            Link da plaquinha (opcional)
          </label>
          <div className="flex items-center rounded-xl border border-line bg-surface focus-within:border-paper/40">
            <span className="shrink-0 pl-3.5 font-mono text-sm text-muted">
              {appBaseUrl().replace(/^https?:\/\//, "")}/
            </span>
            <input
              id="code"
              name="code"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              placeholder="padariaexemplo"
              className="w-full bg-transparent py-3 pr-3.5 pl-0.5 font-mono text-sm text-paper outline-none placeholder:text-muted/60"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Letras minúsculas, números e hífen (3 a 40). Deixe vazio para gerar um código aleatório.
            Só vale com 1 plaquinha. Depois de gravado na tag, trocar o link exige regravar a tag.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="color" className={label}>
              Cor da marca (opcional)
            </label>
            <input id="color" name="color" placeholder="#ffb86b" maxLength={7} className={input} />
          </div>
          <div>
            <label htmlFor="quantity" className={label}>
              Quantidade de plaquinhas
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              max={100}
              defaultValue={1}
              required
              className={input}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="submit" className={buttonPrimary}>
          Criar cliente e plaquinhas
        </button>
      </form>
    </div>
  );
}
