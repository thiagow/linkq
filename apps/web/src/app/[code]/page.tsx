import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { formatBRL, parseAmountParam } from "@/lib/amount.ts";
import { resolvePlate } from "@/lib/plates.ts";
import { CopyPanel } from "./copy-panel.tsx";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ valor?: string | string[] }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function PayPage({ params, searchParams }: Props) {
  const [{ code }, { valor }] = await Promise.all([params, searchParams]);
  const amountCents = parseAmountParam(Array.isArray(valor) ? valor[0] : valor);
  const plate = await resolvePlate(code, amountCents);
  if (!plate) notFound();

  if (plate.status === "suspended") {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
        <div>
          <h1 className="font-serif text-4xl">Plaquinha indisponível</h1>
          <p className="mt-3 text-sm text-muted">
            Este ponto de pagamento foi desativado. Procure o estabelecimento.
          </p>
        </div>
      </main>
    );
  }

  const svg = await QRCode.toString(plate.payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const brand =
    plate.brandColor && SAFE_COLOR.test(plate.brandColor) ? plate.brandColor : "#f4f2ee";

  return (
    <main
      style={{ "--brand": brand } as React.CSSProperties}
      className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 opacity-25 blur-3xl"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, var(--brand), transparent)" }}
      />

      <header>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <ShieldIcon />
          Pagamento seguro via Pix
        </p>
        <p className="mt-6 text-sm text-muted">Você vai pagar para</p>
        <h1 className="mt-1 font-serif text-5xl leading-[1.02] tracking-tight">
          {plate.displayName}
        </h1>
        {amountCents !== undefined && (
          <p className="mt-4 text-3xl font-medium tabular-nums">{formatBRL(amountCents)}</p>
        )}
      </header>

      <div className="mt-8">
        <CopyPanel text={plate.payload} />
      </div>

      <section
        aria-labelledby="confira"
        className="mt-8 rounded-2xl border border-line bg-surface/60 p-4"
      >
        <h2 id="confira" className="flex items-center gap-2 text-sm font-medium">
          <span className="text-emerald-300">
            <ShieldIcon />
          </span>
          Confira no seu banco antes de pagar
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Recebedor</dt>
            <dd className="text-right font-medium">{plate.merchantName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Chave Pix</dt>
            <dd className="text-right font-mono text-paper/90">{plate.keyMask}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          Se o nome que aparecer no seu banco for diferente, não confirme o pagamento.
        </p>
      </section>

      <details className="group mt-4 rounded-2xl border border-line bg-surface/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>
            Prefere ler um QR Code?
            <span className="mt-0.5 block text-xs font-normal text-muted">
              Útil se estiver pagando por outro aparelho
            </span>
          </span>
          <span
            aria-hidden="true"
            className="text-muted transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="px-4 pb-5">
          <div
            role="img"
            aria-label="QR Code para pagamento Pix"
            className="mx-auto w-full max-w-[15rem] overflow-hidden rounded-2xl bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG gerado localmente pela lib qrcode a partir do payload, sem HTML vindo do usuário
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-3 text-center text-xs text-muted">
            No app do banco: <span className="text-paper">Pix → Ler QR Code</span>
          </p>
        </div>
      </details>

      <footer className="mt-auto pt-10 text-center text-xs leading-relaxed text-muted">
        <p>
          O dinheiro vai direto para o recebedor. Esta página não pede senha, cartão nem dados do
          seu banco, e não cobra nenhuma taxa.
        </p>
        <p className="mt-2 text-paper/50">Pagamento Pix · LinkQ</p>
      </footer>
    </main>
  );
}
