import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client.ts";
import { customers, plates } from "@/db/schema.ts";
import { requireOperator } from "@/lib/session.ts";
import { buttonPrimary } from "../ui.ts";
import { setPlateStatusAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function AdminHome() {
  await requireOperator();
  const rows = await db
    .select({ plate: plates, customer: customers })
    .from(plates)
    .innerJoin(customers, eq(plates.customerId, customers.id))
    .orderBy(desc(plates.createdAt))
    .limit(300);

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Plaquinhas</h1>
          <p className="mt-1 text-sm text-muted">{rows.length} mais recentes</p>
        </div>
        <Link href="/admin/customers/new" className={buttonPrimary}>
          Novo cliente
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-16 text-center text-muted">
          Nenhuma plaquinha ainda. Cadastre o primeiro cliente.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {rows.map(({ plate, customer }) => (
            <li key={plate.code} className="flex items-center transition hover:bg-surface">
              <Link
                href={`/admin/plates/${plate.code}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 py-4 pl-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{customer.displayName}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {plate.code} · {customer.pixKeyMask}
                    {plate.label ? ` · ${plate.label}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
                  <span className="hidden sm:inline">{dateFormat.format(plate.createdAt)}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 ${plate.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}
                  >
                    {plate.status === "active" ? "Ativa" : "Suspensa"}
                  </span>
                </div>
              </Link>
              <form action={setPlateStatusAction} className="shrink-0 px-5">
                <input type="hidden" name="code" value={plate.code} />
                <input type="hidden" name="from" value="list" />
                <input
                  type="hidden"
                  name="status"
                  value={plate.status === "active" ? "suspended" : "active"}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-paper/80 transition hover:border-paper/30 hover:text-paper"
                >
                  {plate.status === "active" ? "Suspender" : "Reativar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
