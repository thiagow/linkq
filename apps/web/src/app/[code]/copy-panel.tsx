"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CopyState = "idle" | "auto" | "manual" | "blocked";

/** Escrita silenciosa: só a Clipboard API, que falha sem gesto/foco em alguns navegadores. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Dentro de um toque do usuário vale também o método legado (iOS/WebViews antigas). */
async function writeClipboardFromGesture(text: string): Promise<boolean> {
  if (await writeClipboard(text)) return true;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done?: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${
          done ? "bg-emerald-400 text-black" : "border border-line bg-surface text-paper/80"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div>
        <p className="text-[15px] font-medium leading-snug">{title}</p>
        {children && <p className="mt-0.5 text-sm leading-snug text-muted">{children}</p>}
      </div>
    </li>
  );
}

export function CopyPanel({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const copied = state === "auto" || state === "manual";
  const done = useRef(false);

  const markCopied = useCallback((how: "auto" | "manual") => {
    done.current = true;
    setState(how);
    if (how === "manual") navigator.vibrate?.(12);
  }, []);

  // Cópia automática ao abrir a página (toque NFC). Se o navegador bloquear, tenta de novo ao
  // ganhar foco e no primeiro toque em qualquer lugar da página.
  useEffect(() => {
    let cancelled = false;

    async function attempt(fromGesture: boolean) {
      if (done.current || cancelled) return;
      const ok = fromGesture ? await writeClipboardFromGesture(text) : await writeClipboard(text);
      if (cancelled || done.current) return;
      if (ok) markCopied(fromGesture ? "manual" : "auto");
      else if (!fromGesture) setState("blocked");
    }

    void attempt(false);
    const onGesture = () => void attempt(true);
    const onFocus = () => void attempt(false);
    document.addEventListener("pointerdown", onGesture, { once: true });
    document.addEventListener("keydown", onGesture, { once: true });
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
      window.removeEventListener("focus", onFocus);
    };
  }, [text, markCopied]);

  async function copyNow() {
    if (await writeClipboardFromGesture(text)) markCopied("manual");
    else setState("blocked");
  }

  const banner =
    state === "auto"
      ? {
          title: "Código Pix copiado automaticamente",
          body: "Agora é só abrir o app do seu banco e colar.",
        }
      : state === "manual"
        ? { title: "Código Pix copiado", body: "Agora é só abrir o app do seu banco e colar." }
        : state === "blocked"
          ? {
              title: "Toque para copiar o código",
              body: "Seu navegador pede um toque para copiar. Use o botão abaixo.",
            }
          : {
              title: "Preparando seu código Pix",
              body: "Se não copiar sozinho, use o botão abaixo.",
            };

  return (
    <>
      <div
        className={`rounded-2xl border p-4 transition-colors ${
          copied ? "border-emerald-400/40 bg-emerald-400/10" : "border-line bg-surface/70"
        }`}
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`grid size-9 shrink-0 place-items-center rounded-full text-lg transition-colors ${
              copied ? "bg-emerald-400 text-black" : "bg-line text-paper/70"
            }`}
          >
            {copied ? "✓" : "⧉"}
          </span>
          <div>
            <p className="font-medium leading-tight">{banner.title}</p>
            <p className="mt-0.5 text-sm leading-snug text-muted">{banner.body}</p>
          </div>
        </div>
      </div>

      <section aria-labelledby="como-pagar" className="mt-8">
        <h2 id="como-pagar" className="text-xs uppercase tracking-[0.2em] text-muted">
          Como pagar
        </h2>
        <ol className="mt-4 space-y-4">
          <Step n={1} done={copied} title="Copie o código Pix">
            {copied ? "Já está na área de transferência." : "Toque no botão logo abaixo."}
          </Step>
          <Step n={2} title="Abra o app do seu banco">
            Procure por <b className="font-medium text-paper">Pix</b> e depois{" "}
            <b className="font-medium text-paper">Pix Copia e Cola</b>.
          </Step>
          <Step n={3} title="Cole, confira e confirme">
            Veja se o nome do recebedor é o de baixo e finalize com a sua senha do banco.
          </Step>
        </ol>
      </section>

      <section className="mt-8 space-y-3" aria-label="Código Pix copia e cola">
        <button
          type="button"
          onClick={copyNow}
          className="relative w-full overflow-hidden rounded-2xl bg-[var(--brand)] px-6 py-4 text-base font-semibold text-black shadow-[0_10px_40px_-12px_var(--brand)] transition active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span className={`transition-opacity ${copied ? "opacity-0" : "opacity-100"}`}>
            Copiar código Pix
          </span>
          <span
            aria-hidden="true"
            className={`absolute inset-0 grid place-items-center transition-opacity ${copied ? "opacity-100" : "opacity-0"}`}
          >
            Copiado ✓ Copiar de novo
          </span>
        </button>
        <label className="block">
          <span className="sr-only">Código Pix copia e cola</span>
          <textarea
            readOnly
            rows={3}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-2xl border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-muted"
          />
        </label>
      </section>
    </>
  );
}
