# LinkQ — Arquitetura

Ferramenta interna que dá vida às plaquinhas físicas NFC + QR Code: cada plaquinha abre uma página de pagamento Pix do cliente. Domínio: **gerelink.online**. Não é SaaS (sem cadastro público, planos ou cobrança).

## Como funciona

```
 Plaquinha (NFC/QR)  ──►  https://gerelink.online/<código>  ──►  página pública
   guarda só a URL            código aleatório de 8 chars         busca cliente no banco,
                                                                  decifra a chave, monta o
                                                                  BR Code e desenha o QR Pix
 Operador ──► /login (e-mail + senha) ──► /admin ──► cadastra cliente, gera plaquinhas,
                                                    baixa QR (SVG/PNG), suspende, troca chave
```

A URL na tag é **dinâmica**: a tag guarda apenas `APP_BASE_URL/<código>`. Chave Pix, valor, nome e status vivem no banco e são resolvidos a cada acesso, então nada exige regravar a plaquinha.

## Stack e por quê

| Camada | Escolha | Razão |
|---|---|---|
| App (hosting Netlify) | Next.js 16 (App Router) + React 19, TypeScript strict | Server Components/Actions mantêm segredos no servidor; página pública renderizada no servidor, sem JS obrigatório |
| Motor Pix | `packages/pix-brcode` (TS puro, zero deps) | Risco técnico central isolado: testável sem rede, reutilizável, superfície de supply chain nula |
| Banco | PostgreSQL + Drizzle ORM + postgres.js | SQL tipado e migrações versionadas; triggers garantem o audit log imutável |
| Cripto | AES-256-GCM (`node:crypto`) | Chave Pix cifrada em repouso; autenticada, sem dependência |
| Senhas | scrypt (`node:crypto`, N=2^15) | Memory-hard, sem módulo nativo |
| QR | `qrcode` | Nível M na página de pagamento, **Q** nas plaquinhas (tolera desgaste) |
| UI | Tailwind v4, Geist + Instrument Serif | Dark-first, tipografia editorial |
| Qualidade | Biome, Vitest, fast-check, pnpm workspaces | Uma ferramenta de lint/format, testes rápidos, property-based no motor |

## Estrutura

```
packages/pix-brcode/   motor BR Code: payload, CRC16, validação/máscara de chave, parser
apps/web/
  src/app/[code]/      página pública de pagamento
  src/app/login/       e-mail + senha
  src/app/admin/       painel (clientes, plaquinhas, QR, auditoria)
  src/db/              schema Drizzle e cliente (1 conexão por instância serverless)
  netlify.toml         build da Netlify (package directory = apps/web, definido na UI)
  src/lib/             crypto, sessão, rate limit, links, parsing de valor
  src/middleware.ts    CSP com nonce por requisição (Edge Function na Netlify)
  drizzle/             migrações SQL versionadas
  scripts/             CLIs: operator:create, plate:create
```

## Decisões de segurança

- **Sem cadastro público.** Operadores só são criados pela CLI.
- **Sem 2FA (decisão do fundador):** o login é só e-mail + senha; a defesa é senha forte, rate limit e sessão curta. Se voltar a ser necessário, reintroduzir TOTP (a migração `0004_remove_mfa` removeu as colunas).
- **Sessão:** token aleatório de 256 bits em cookie `httpOnly`, `SameSite=Strict`, `Secure` em produção; no banco só o SHA-256. A sessão dura 12 h.
- **Troca de chave Pix** exige justificativa e fica registrada na auditoria.
- **Rate limit** em Postgres (compartilhado entre instâncias): login por IP e por e-mail, troca de chave e de senha por operador. Login com e-mail inexistente gasta o mesmo tempo (anti-enumeração por timing).
- **Chave Pix:** cifrada em repouso; a página pública mostra só a máscara. O código copia e cola embute a chave por definição do BR Code.
- **Audit log append-only:** triggers bloqueiam `UPDATE`/`DELETE`/`TRUNCATE`. Sem FK para operadores, para não impedir a remoção de contas.
- **CSP** com nonce e `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, SVG servido com CSP própria.
- **IDs não enumeráveis:** 8 caracteres base58 aleatórios (~46 bits), validados por regex antes de tocar no banco.
- **TLS no banco:** em produção o padrão é exigir TLS (`ssl: "require"`). **Decisão do fundador:** o Postgres atual (Easypanel) não suporta TLS, então a produção roda com `DATABASE_SSL=disable`, o que faz senha, sessões e chaves Pix cifradas trafegarem em texto puro entre a Netlify e o banco. O app registra um aviso no log a cada instância. Para reverter: habilitar SSL no banco (ou migrar para Neon/Supabase) e remover a variável.
- **Segredos na Netlify:** `DATABASE_URL` e `PIX_KEY_ENCRYPTION_KEY` entram pela UI/CLI como *secret* (escopos Builds + Functions), jamais em `netlify.toml` ou variáveis com prefixo `NEXT_PUBLIC_`.
- **IP do cliente:** o rate limit usa `x-nf-client-connection-ip`, definido pela borda da Netlify.

## Operação

Pré-requisitos: Node ≥ 22.13, pnpm 10.

```
pnpm install
cp apps/web/.env.example apps/web/.env      # preencha DATABASE_URL e gere as chaves
pnpm --filter @linkq/web db:migrate
OPERATOR_PASSWORD='<12+ caracteres>' pnpm --filter @linkq/web operator:create -- --email voce@empresa.com
pnpm --filter @linkq/web dev                 # http://localhost:3000
```

Variáveis: `DATABASE_URL`, `PIX_KEY_ENCRYPTION_KEY` (32 bytes base64), `APP_BASE_URL` (origem, sem path, ex.: `https://gerelink.online`).

### Deploy na Netlify

Next.js 16 roda pelo runtime oficial da Netlify (instalado automaticamente; não fixar versão). Não use `output: "standalone"`.

1. Criar o site a partir do repositório e, na UI (*Project configuration → Build & deploy → Continuous deployment*), definir **Package directory = `apps/web`** (não dá para fazer via `netlify.toml`). O `apps/web/netlify.toml` já traz comando de build, `publish` e `NODE_VERSION`.
2. Variáveis de ambiente pela UI/CLI (`netlify env:set --secret`), escopos **Builds + Functions**, contexto de produção: `DATABASE_URL`, `PIX_KEY_ENCRYPTION_KEY`, `APP_BASE_URL`, `DATABASE_SSL=disable`. Qualquer mudança exige novo deploy.
3. Domínio: adicionar `gerelink.online` ao site e apontar o DNS. Ele é gravado nas tags NFC e **não pode mudar**.
4. **Migrações são manuais** (nunca no build/boot: deploy previews não podem tocar o banco de produção): com `DATABASE_URL` de produção terminando em `?sslmode=require` (o `drizzle-kit` lê isso da URL), rodar `pnpm --filter @linkq/web db:migrate` antes de publicar uma versão que altere o schema.
5. Criar o primeiro operador pela CLI com `NODE_ENV=production` e o `DATABASE_URL` de produção (as CLIs usam `src/db/client.ts`, que exige TLS em produção).

Pontos de atenção da Netlify:
- O app recusa conexão sem TLS em produção, a menos que `DATABASE_SSL=disable` esteja definida (necessária hoje; ver decisão acima). Cadastre essa variável junto das outras.
- Cada instância da função mantém 1 conexão; latência entre a região das funções e a do banco impacta o tempo do toque NFC. Prefira banco e funções na mesma região.
- `src/middleware.ts` (convenção legada do Next 16, Edge Function) foi escolhido porque o `proxy.ts` falhou no adaptador em teste local no Windows. Quando validado em build Linux, renomear para `proxy.ts` e a função para `proxy`.
- Os previews de deploy não devem receber os segredos de produção; use contexto `production` nas variáveis.

**Perder `PIX_KEY_ENCRYPTION_KEY` torna as chaves Pix irrecuperáveis.** Faça backup dela separado do banco.

## Custos

Sem APIs pagas. Cada acesso à página pública faz 1 SELECT e 1 decifragem AES (microssegundos) + geração do QR em memória. Custo = plano da Netlify (invocações de função por acesso à página pública) + Postgres.

## Limitações conhecidas

- Pix **estático**: o sistema não sabe se o pagamento foi feito (pós-MVP: Pix dinâmico via PSP).
- Trocar a senha é possível em `/admin/account` (exige a senha atual e encerra as outras sessões). Não há recuperação de senha esquecida (hoje: apagar e recriar o operador pela CLI).
- A página pública não tem rate limit próprio; contar com CDN/WAF na frente em produção.
- O deploy na Netlify ainda não foi executado de ponta a ponta: o build local do adaptador no Windows para em `EPERM symlink` (exige modo desenvolvedor), então a validação real é o primeiro build na Netlify (Linux).
