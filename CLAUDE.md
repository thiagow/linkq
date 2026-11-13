# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Fases 1 e 2 implementadas: motor Pix, página pública `/[code]`, login com e-mail + senha (sem 2FA, por decisão do fundador), painel admin (clientes, plaquinhas, QR SVG/PNG, troca de chave com justificativa, auditoria). **Hospedagem: Netlify (sem Docker)**; passo a passo e armadilhas em `ARCHITECTURE.md`. **Pendentes:** pagar R$0,01 em vários bancos (validação manual do BR Code), primeiro deploy na Netlify em `gerelink.online`. Migrações até a `0005` já aplicadas no banco de produção. Plano completo aprovado: `C:\Users\thiag\.claude\plans\fa-a-uma-analise-e-gentle-kahan.md`.

## Comandos

Monorepo pnpm (Node ≥22.13, pnpm 10), Biome para lint/format, Vitest para testes. Rodar da raiz:

- `pnpm install`
- `pnpm typecheck` · `pnpm lint` · `pnpm format` (auto-fix) · `pnpm test` · `pnpm audit`
- Um único teste: `pnpm --filter @linkq/pix-brcode exec vitest run -t "nome do teste"` ou `... vitest run test/key.test.ts`

Banco (Postgres remoto, `apps/web/.env`, gitignored; modelo em `.env.example`): `pnpm --filter @linkq/web db:generate` · `db:migrate` · `plate:create -- --name … --key … --merchant … --city …` · `OPERATOR_PASSWORD=… operator:create -- --email …` (único jeito de criar operador). Toda página e Server Action do `/admin` deve chamar `requireOperator()` — o layout sozinho não protege. Em produção `src/db/client.ts` exige TLS por padrão e usa 1 conexão por instância; o Postgres atual não suporta TLS, então produção roda com `DATABASE_SSL=disable` por decisão do fundador (risco aceito, ver ARCHITECTURE.md); migrações são manuais (`db:migrate`), nunca no build/boot. O CSP com nonce vive em `src/middleware.ts` (não `proxy.ts`; ver ARCHITECTURE.md). Dev: `pnpm --filter @linkq/web dev`. O driver `postgres.js` não aceita `?schema=public` na URL. `audit_log` é imutável, então testes não devem escrever nele no banco real.

Imports internos usam extensão `.ts` explícita (`allowImportingTsExtensions`). Docker não está instalado na máquina de dev atual.

## O que é

LinkQ **não é SaaS**. É uma ferramenta interna para os clientes que compram nossas plaquinhas físicas NFC + QR Code. Cada plaquinha aponta para uma página pública de pagamento Pix do cliente. Não há cadastro público, planos, cobrança de assinatura, domínio personalizado nem white-label.

## Arquitetura (decisões já tomadas)

- **Motor Pix isolado** em `packages/pix-brcode`: TypeScript puro, zero dependências, 100% testável sem rede. Monta o payload BR Code (EMV), calcula CRC16 e valida chaves. Tudo o mais depende dele.
- **Painel admin interno** (só nossa equipe, login com senha) cadastra cliente, chave Pix, nome e cidade, gera a plaquinha e exporta QR (SVG/PNG) + URL para gravar na tag NFC.
- **Página pública `/[id]`** (Next.js App Router, SSR/ISR com cache de borda): QR + copia-e-cola + botão Copiar. Deve abrir instantaneamente ao toque NFC e funcionar sem JS.
- **Dados:** Postgres + Drizzle. Tabelas previstas: `customers`, `pix_keys` (cifrada), `plates`, `key_audit_log`, `scans`.

## Invariantes que não podem ser quebradas

- **O link impresso/gravado é permanente.** O id da plaquinha é, por padrão, curto e aleatório (base58, 8 chars, nunca sequencial); o operador pode definir um link personalizado (`padariaexemplo`: minúsculas, números e hífen, 3–40 chars, validado em `src/lib/code.ts`), o que torna o link adivinhável por decisão do fundador. Trocar o código invalida tags/QR já gravados. A chave Pix fica no banco, nunca no payload gravado na tag; trocar a chave não exige regravar a plaquinha. O domínio precisa ser nosso e eterno.
- **Pix estático, sem PSP e sem custódia.** Não há confirmação de pagamento; isso é pós-MVP.
- **Chave Pix é dado pessoal (LGPD):** cifrada em repouso (AES-GCM), nunca exibida completa na página pública (só mascarada, ex.: `***.456.789-**`, junto do nome do recebedor).
- **Toda alteração de chave** gera linha em `audit_log` (append-only: trigger no Postgres bloqueia UPDATE/DELETE/TRUNCATE) e exige justificativa do operador (sem MFA: removido por decisão do fundador). Não há aviso por e-mail ao cliente nesta versão (decisão do fundador).
- **A URL da tag NFC é dinâmica:** a tag guarda só `BASE_URL/<code>`; a página resolve o código no servidor a cada acesso. Por isso a tag não precisa ser travada, e trocar chave/valor/status não exige regravar nada.
- O código copia e cola do Pix embute a chave por definição; "mascarar" vale só para o texto exibido. Nunca renderizar a chave em claro fora do payload.
- Plaquinhas devem poder ser suspensas pelo painel sem tocar na peça física.

## Regras do BR Code (erros aqui fazem o banco rejeitar o código)

- Campo 26 = Merchant Account Information, GUI `br.gov.bcb.pix`; campo 01 = `11` (reutilizável) para estático.
- Tamanhos dos campos são em **caracteres**, após normalização para ASCII. Nome ≤25, cidade ≤15, maiúsculas e sem acento. txid `***` quando ausente. Valor com ponto e 2 casas.
- CRC16-CCITT-FALSE (poly `0x1021`, init `0xFFFF`) calculado sobre a string inteira **incluindo** `6304`.
- Validar CPF/CNPJ por dígito verificador, e-mail em minúsculas, telefone `+55…`, chave aleatória UUID v4.
- Testes devem usar vetores oficiais do BCB, round-trip (`buildPayload` ↔ `parsePayload`) e fuzz. Validação final é manual: pagar R$0,01 em vários apps de banco.

## Padrão de qualidade (do CLAUDE.md global do usuário)

Segurança desde o primeiro commit, testes junto com o código, design dark-first e editorial na página pública (não pode parecer template). Skills de revisão: `/hm-engineer`, `/hm-designer`, `/hm-qa`.
