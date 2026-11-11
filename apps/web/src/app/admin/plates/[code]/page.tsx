import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client.ts";
import { customers, plates } from "@/db/schema.ts";
import { CODE_PATTERN } from "@/lib/code.ts";
import { plateUrl } from "@/lib/links.ts";
import { requireOperator } from "@/lib/session.ts";
import { buttonGhost, buttonPrimary, card, input, label } from "../../../ui.ts";
import {
  addPlatesAction,
  changeKeyAction,
  setPlateStatusAction,
  updateCustomerAction,
} from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function PlatePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireOperator();
  const [{ code }, { error, saved }] = await Promise.all([params, searchParams]);
  if (!CODE_PATTERN.test(code)) notFound();

  const [row] = await db
    .select({ plate: plates, customer: customers })
    .from(plates)
    .innerJoin(customers, eq(plates.customerId, customers.id))
    .where(eq(plates.code, code))
    .limit(1);
  if (!row) notFound();
  const { plate, customer } = row;
  const url = plateUrl(code);
  const suspended = plate.status === "suspended";

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-muted transition hover:text-paper">
          ← Plaquinhas
        </Link>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">{customer.displayName}</h1>
        <p className="mt-1 font-mono text-xs text-muted">
          {code} · {customer.pixKeyMask}
        </p>
        {saved && <p className="mt-3 text-sm text-emerald-300">Alterações salvas.</p>}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      <section className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <div>
          {/* biome-ignore lint/performance/noImgElement: rota autenticada que devolve SVG; next/image não otimiza SVG */}
          <img
            src={`/admin/plates/${code}/qr?format=svg`}
            alt={`QR Code da plaquinha ${code}`}
            width={256}
            height={256}
            className="aspect-square w-full rounded-2xl bg-white p-1"
          />
        </div>
        <div className={card}>
          <p className={label}>URL gravada na tag NFC e no QR</p>
          <input
            readOnly
            value={url}
            className={`${input} font-mono`}
            aria-label="URL da plaquinha"
          />
          <p className="mt-3 text-sm text-muted">
            Grave exatamente esta URL na tag (NDEF URI). Ela é dinâmica: chave, valor e status podem
            mudar sem regravar nada.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={`/admin/plates/${code}/qr?format=svg&download=1`} className={buttonGhost}>
              Baixar SVG
            </a>
            <a href={`/admin/plates/${code}/qr?format=png&download=1`} className={buttonGhost}>
              Baixar PNG
            </a>
            <a href={`/${code}`} target="_blank" rel="noreferrer" className={buttonGhost}>
              Abrir página
            </a>
          </div>
          <form action={setPlateStatusAction} className="mt-5">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
            <button type="submit" className={suspended ? buttonPrimary : buttonGhost}>
              {suspended ? "Reativar plaquinha" : "Suspender plaquinha"}
            </button>
          </form>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-serif text-2xl">Dados do recebedor</h2>
        <form action={updateCustomerAction} className="mt-5 grid gap-5 sm:grid-cols-2">
          <input type="hidden" name="code" value={code} />
          <div>
            <label htmlFor="displayName" className={label}>
              Nome exibido
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={customer.displayName}
              required
              className={input}
            />
          </div>
          <div>
            <label htmlFor="color" className={label}>
              Cor da marca
            </label>
            <input
              id="color"
              name="color"
              defaultValue={customer.brandColor ?? ""}
              placeholder="#ffb86b"
              className={input}
            />
          </div>
          <div>
            <label htmlFor="merchantName" className={label}>
              Nome do recebedor
            </label>
            <input
              id="merchantName"
              name="merchantName"
              defaultValue={customer.merchantName}
              required
              className={input}
            />
          </div>
          <div>
            <label htmlFor="city" className={label}>
              Cidade
            </label>
            <input
              id="city"
              name="city"
              defaultValue={customer.merchantCity}
              required
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={buttonGhost}>
              Salvar dados
            </button>
          </div>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-serif text-2xl">Trocar chave Pix</h2>
        <p className="mt-1 text-sm text-muted">
          Vale para todas as plaquinhas deste cliente. Exige justificativa e fica registrado na
          auditoria.
        </p>
        <form action={changeKeyAction} className="mt-5 grid gap-5 sm:grid-cols-2">
          <input type="hidden" name="code" value={code} />
          <div className="sm:col-span-2">
            <label htmlFor="key" className={label}>
              Nova chave
            </label>
            <input
              id="key"
              name="key"
              required
              autoComplete="off"
              spellCheck={false}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="reason" className={label}>
              Justificativa
            </label>
            <input
              id="reason"
              name="reason"
              required
              minLength={5}
              maxLength={300}
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={buttonPrimary}>
              Trocar chave
            </button>
          </div>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-serif text-2xl">Mais plaquinhas para este cliente</h2>
        <form action={addPlatesAction} className="mt-5 flex items-end gap-4">
          <input type="hidden" name="code" value={code} />
          <div className="w-32">
            <label htmlFor="quantity" className={label}>
              Quantidade
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              max={100}
              defaultValue={1}
              className={input}
            />
          </div>
          <button type="submit" className={buttonGhost}>
            Gerar
          </button>
        </form>
      </section>
    </div>
  );
}
