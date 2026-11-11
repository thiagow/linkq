import QRCode from "qrcode";
import { CODE_PATTERN } from "@/lib/code.ts";
import { plateUrl } from "@/lib/links.ts";
import { getSession } from "@/lib/session.ts";

// Nível Q: tolera desgaste da plaquinha impressa. Quiet zone de 4 módulos (mínimo da norma).
const OPTIONS = { errorCorrectionLevel: "Q", margin: 4 } as const;

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { code } = await params;
  if (!CODE_PATTERN.test(code)) return new Response("Not found", { status: 404 });

  const search = new URL(request.url).searchParams;
  const format = search.get("format") === "png" ? "png" : "svg";
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (search.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="linkq-${code}.${format}"`;
  }
  const url = plateUrl(code);

  if (format === "png") {
    const png = await QRCode.toBuffer(url, { ...OPTIONS, width: 1200 });
    return new Response(new Uint8Array(png), {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  }
  const svg = await QRCode.toString(url, { ...OPTIONS, type: "svg" });
  return new Response(svg, {
    headers: {
      ...headers,
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
