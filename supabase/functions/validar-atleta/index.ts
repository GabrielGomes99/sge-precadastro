// supabase/functions/validar-atleta/index.ts
//
// Edge Function ``validar-atleta`` — endpoint público (sem JWT) usado
// pelo portal de pré-cadastro. Suporta dois tipos de cadastro:
//
//   tipo="atleta"   : busca/classifica em ``public.alunos``.
//   tipo="instrutor": busca/classifica em ``public.instrutores``.
//
//   1. ``action: "consultar"``              — dado um CPF (+ cpf_responsavel
//      para atleta), retorna o cadastro existente mapeado para o contrato
//      público do modal (completude + pendências), sem expor dados internos.
//   2. ``action: "solicitar_atualizacao"``  — abre uma solicitação pendente
//      em ``solicitacoes_atualizacao`` para revisão humana no SGE. Nunca
//      escreve em ``public.alunos`` / ``public.instrutores``.
//
// Garantias (idênticas à versão original, preservadas):
//   - POST-only.
//   - Service-role-only: o handler exige ``SUPABASE_URL`` e uma secret
//     key no ambiente. Aceita ``SUPABASE_SECRET_KEYS`` (novo modelo) e
//     ``SUPABASE_SERVICE_ROLE_KEY`` (legado).
//   - ``cpf_responsavel`` continua obrigatório APENAS para atleta.
//     Instrutor não tem responsável — busca só por cpf.
//   - Lookup server-side em ``public.alunos`` ou ``public.instrutores``.
//   - ``atleta_id`` / ``instrutor_id`` / ``status`` / ``decidido_por`` são
//     SEMPRE derivados server-side a partir do CPF. Cliente envia apenas
//     cpf (+ cpf_responsavel para atleta), dados e arquivos.
//   - Snapshot, dados propostos e arquivos são validados por whitelist.
//   - Rate limit determinístico (via RPC ``consumir_rate_limit``) por
//     ``cpf + ip``.
//   - CORS restrito ao portal.
//   - Envelope de erro estável: ``{success:false, code, message}``.

import {
  CpfInvalidoError,
  PublicAthleteData,
  PublicInstructorData,
  classificarCadastro,
  classificarCadastroInstrutor,
  mapearAtleta,
  mapearInstrutor,
  normalizarCpf,
} from "../_shared/cadastro.ts";

// ---------------------------------------------------------------------------
// Constantes públicas
// ---------------------------------------------------------------------------

export const ActionConsultar = "consultar";
export const ActionSolicitarAtualizacao = "solicitar_atualizacao";

const ACTIONS_VALIDAS = new Set<string>([
  ActionConsultar,
  ActionSolicitarAtualizacao,
]);

const TIPOS_VALIDOS = new Set<string>(["atleta", "instrutor"]);

const TABELA_ATLETAS = "alunos";
const TABELA_INSTRUTORES = "instrutores";
const TABELA_SOLICITACOES = "solicitacoes_atualizacao";

const DEFAULT_PORTAL_ORIGINS =
  "https://gabrielgomes99.github.io,https://portal-nec-inec.site";

const LOCAL_DEV_ORIGINS = new Set<string>([
  "http://localhost:8080",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:3000",
]);

// Whitelist de campos válidos em ``dados`` para atleta.
const CAMPOS_DADOS_PERMITIDOS_ATLETA: ReadonlySet<string> = new Set([
  "nome",
  "rg",
  "cpf",
  "data_nascimento",
  "endereco",
  "rua",
  "numero",
  "bairro",
  "cidade",
  "cep",
  "nome_responsavel",
  "parentesco",
  "cpf_responsavel",
  "email",
  "telefone",
  "problema_saude",
  "modalidades",
  "periodo",
]);

// Whitelist de campos válidos em ``dados`` para instrutor.
// Sem campos de responsável. Inclui ``formacao`` (mapeado de
// ``funcao`` no frontend) e ``nucleo``.
const CAMPOS_DADOS_PERMITIDOS_INSTRUTOR: ReadonlySet<string> = new Set([
  "nome",
  "rg",
  "cpf",
  "data_nascimento",
  "endereco",
  "rua",
  "numero",
  "bairro",
  "cidade",
  "cep",
  "email",
  "telefone",
  "formacao",
  "funcao", // alias legado aceito por tolerância
  "periodo",
  "nucleo",
  "modalidades",
]);

const CAMPOS_ARQUIVOS_PERMITIDOS_ATLETA: ReadonlySet<string> = new Set([
  "foto_url",
  "doc_aluno_url",
  "doc_resp_url",
]);

// Instrutor tem 2 arquivos: foto + documento. ``doc_instrutor_url`` é
// o nome canônico. ``doc_url`` é aceito como alias.
const CAMPOS_ARQUIVOS_PERMITIDOS_INSTRUTOR: ReadonlySet<string> = new Set([
  "foto_url",
  "doc_instrutor_url",
  "doc_url",
]);

function camposDadosPermitidos(tipo: string): ReadonlySet<string> {
  return tipo === "instrutor"
    ? CAMPOS_DADOS_PERMITIDOS_INSTRUTOR
    : CAMPOS_DADOS_PERMITIDOS_ATLETA;
}

function camposArquivosPermitidos(tipo: string): ReadonlySet<string> {
  return tipo === "instrutor"
    ? CAMPOS_ARQUIVOS_PERMITIDOS_INSTRUTOR
    : CAMPOS_ARQUIVOS_PERMITIDOS_ATLETA;
}

// ---------------------------------------------------------------------------
// Erros tipados
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class AthleteNotFoundError extends HttpError {
  constructor(message = "Atleta não encontrado") {
    super(404, "atleta_nao_encontrado", message);
    this.name = "AthleteNotFoundError";
  }
}

export class InstructorNotFoundError extends HttpError {
  constructor(message = "Instrutor não encontrado") {
    super(404, "instrutor_nao_encontrado", message);
    this.name = "InstructorNotFoundError";
  }
}

export class CadastroInvalidoError extends HttpError {
  constructor(code: string, message: string) {
    super(400, code, message);
    this.name = "CadastroInvalidoError";
  }
}

export class ConflictError extends HttpError {
  constructor(code: string, message: string) {
    super(409, code, message);
    this.name = "ConflictError";
  }
}

export class PendingRequestExistsError extends ConflictError {
  constructor() {
    super("solicitacao_pendente_existente", "Já existe uma solicitação pendente para este cadastro");
    this.name = "PendingRequestExistsError";
  }
}

export class RateLimitedError extends HttpError {
  constructor() {
    super(429, "rate_limit_excedido", "Limite de requisições excedido");
    this.name = "RateLimitedError";
  }
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface EnvelopeOk<T> {
  success: true;
  data: T;
}

interface EnvelopeErr {
  success: false;
  code: string;
  message: string;
}

interface Deps {
  supabase: any;
  rate?: RateLimiter;
}

// ---------------------------------------------------------------------------
// Rate limiter (default — implementação in-memory)
// ---------------------------------------------------------------------------

export interface RateLimiter {
  tryConsume(key: string): boolean;
}

class InMemoryRateLimiter implements RateLimiter {
  private contadores = new Map<string, { count: number; reset: number }>();
  constructor(
    private limite: number,
    private janelaMs: number,
    private clock: () => number = () => Date.now(),
  ) {}

  tryConsume(key: string): boolean {
    const agora = this.clock();
    const atual = this.contadores.get(key);
    if (!atual || atual.reset <= agora) {
      this.contadores.set(key, { count: 1, reset: agora + this.janelaMs });
      return true;
    }
    if (atual.count >= this.limite) return false;
    atual.count += 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function allowedOrigins(env: EdgeEnv): Set<string> {
  const configured = env.PORTAL_ALLOWED_ORIGINS ?? DEFAULT_PORTAL_ORIGINS;
  const origins = new Set(
    configured.split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (env.DENO_ENV === "development") {
    for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
  }
  return origins;
}

function corsOrigin(request: Request, env: EdgeEnv): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins(env).has(origin) ? origin : null;
}

function withCorsHeaders(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, content-type, apikey, x-client-info",
  );
  return new Response(res.body, { status: res.status, headers });
}

// ---------------------------------------------------------------------------
// Helpers de envelope
// ---------------------------------------------------------------------------

function ok<T>(data: T): EnvelopeOk<T> {
  return { success: true, data };
}

function err(code: string, message: string): EnvelopeErr {
  return { success: false, code, message };
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 200);
}

async function buildEnvelopeResponse(
  status: number,
  body: unknown,
  origin: string | null,
): Promise<Response> {
  return withCorsHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
    origin,
  );
}

// ---------------------------------------------------------------------------
// Validação de ambiente — service-role-only
// ---------------------------------------------------------------------------

interface EdgeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEYS?: string;
  PORTAL_ALLOWED_ORIGINS?: string;
  DENO_ENV?: string;
  STORAGE_BUCKET?: string;
}

function resolveServiceRoleKey(env: EdgeEnv): string | null {
  const secretKeysJson = env.SUPABASE_SECRET_KEYS;
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson);
      const candidate = parsed?.default;
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    } catch (_) {
      // cai no fallback abaixo
    }
  }
  const legacy = env.SUPABASE_SERVICE_ROLE_KEY;
  if (legacy && legacy.length > 0) return legacy;
  return null;
}

function requireServiceRole(env: EdgeEnv): { url: string; key: string } {
  const url = env.SUPABASE_URL;
  const key = resolveServiceRoleKey(env);
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SECRET_KEYS (ou SUPABASE_SERVICE_ROLE_KEY) são obrigatórios (service-role-only).",
    );
  }
  let valid = false;
  if (key.startsWith("sb_secret_")) {
    valid = key.length >= 30;
  } else if (key.startsWith("eyJ")) {
    valid = key.length >= 100;
  }
  if (!valid) {
    throw new Error("service role key inválida (formato ou tamanho).");
  }
  return { url, key };
}

async function createRealSupabaseClient(url: string, key: string): Promise<any> {
  const mod = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  return mod.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Lookup server-side
// ---------------------------------------------------------------------------

type LookupResultAtleta = {
  encontrado: boolean;
  status: "completo" | "incompleto" | null;
  pendencias: string[];
  atleta: PublicAthleteData | null;
  tipo: "atleta";
};

type LookupResultInstrutor = {
  encontrado: boolean;
  status: "completo" | "incompleto" | null;
  pendencias: string[];
  instrutor: PublicInstructorData | null;
  tipo: "instrutor";
};

type LookupResult = LookupResultAtleta | LookupResultInstrutor;

async function consultarAtleta(
  supabase: any,
  cpf: string,
  cpfResponsavel: string,
): Promise<LookupResultAtleta> {
  const { data: rows, error } = await supabase
    .from(TABELA_ATLETAS)
    .select("*")
    .eq("cpf", cpf)
    .limit(1);

  if (error) {
    throw new Error("Falha ao consultar cadastro");
  }

  const row = (rows ?? [])[0];

  // Desafio cpf_responsavel: além do CPF do atleta, o cliente precisa
  // conhecer o CPF do responsável. Sem esse segundo CPF, qualquer
  // cliente anônimo conseguiria consultar CPFs raspados. Em caso de
  // mismatch, retornamos a MESMA envelope de "não encontrado".
  if (!row || row.cpf_responsavel !== cpfResponsavel) {
    return { encontrado: false, status: null, pendencias: [], atleta: null, tipo: "atleta" };
  }

  const atleta = mapearAtleta(row);
  const classificacao = classificarCadastro({
    ...atleta,
    endereco: atleta.endereco,
    cpf: atleta.cpf,
  });

  return {
    encontrado: true,
    status: classificacao.status,
    pendencias: classificacao.pendencias,
    atleta,
    tipo: "atleta",
  };
}

async function consultarInstrutor(
  supabase: any,
  cpf: string,
): Promise<LookupResultInstrutor> {
  const { data: rows, error } = await supabase
    .from(TABELA_INSTRUTORES)
    .select("*")
    .eq("cpf", cpf)
    .limit(1);

  if (error) {
    throw new Error("Falha ao consultar cadastro");
  }

  const row = (rows ?? [])[0];

  // Instrutor não tem responsável — busca só por cpf.
  // ``row`` ausente é o caso "não encontrado".
  if (!row) {
    return { encontrado: false, status: null, pendencias: [], instrutor: null, tipo: "instrutor" };
  }

  const instrutor = mapearInstrutor(row);
  const classificacao = classificarCadastroInstrutor({
    ...instrutor,
    endereco: instrutor.endereco,
    cpf: instrutor.cpf,
  });

  return {
    encontrado: true,
    status: classificacao.status,
    pendencias: classificacao.pendencias,
    instrutor,
    tipo: "instrutor",
  };
}

// ---------------------------------------------------------------------------
// Validação dos payloads de solicitação
// ---------------------------------------------------------------------------

function validarDadosPropostos(
  dados: unknown,
  tipo: string,
): Record<string, string> {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new CadastroInvalidoError("dados_invalidos", "dados deve ser um objeto");
  }
  const permitidos = camposDadosPermitidos(tipo);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    if (!permitidos.has(k)) {
      throw new CadastroInvalidoError(
        "dados_invalidos",
        `campo não permitido em dados: ${k}`,
      );
    }
    if (v === null || v === undefined) {
      // Permitido — equivale a "manter valor atual".
      continue;
    }
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      throw new CadastroInvalidoError(
        "dados_invalidos",
        `campo ${k} com tipo inválido`,
      );
    }
    out[k] = String(v);
  }
  return out;
}

const STORAGE_BUCKET_DEFAULT = "arquivos";
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

// Contrato de arquivos por campo. Mantido igual ao original — os campos
// ``foto_url``, ``doc_aluno_url`` e ``doc_resp_url`` continuam usando o
// mesmo padrão. ``doc_instrutor_url`` é novo.
const FIELD_FILE_CONTRACTS: Record<string, { category: string; extensions: string }> = {
  foto_url: { category: "foto", extensions: "jpg|jpeg|png|webp" },
  doc_aluno_url: { category: "doc-aluno", extensions: "jpg|jpeg|png|webp|pdf" },
  doc_resp_url: { category: "doc-responsavel", extensions: "jpg|jpeg|png|webp|pdf" },
  doc_instrutor_url: { category: "doc-instrutor", extensions: "jpg|jpeg|png|webp|pdf" },
  doc_url: { category: "doc-instrutor", extensions: "jpg|jpeg|png|webp|pdf" },
};
const LEGACY_PREFIX_BY_FIELD: Record<string, string> = {
  foto_url: "fotos",
  doc_aluno_url: "documentos",
  doc_resp_url: "documentos",
  doc_instrutor_url: "instrutores/documentos",
  doc_url: "instrutores/documentos",
};
const LEGACY_EXTENSION_BY_FIELD: Record<string, string> = {
  foto_url: "jpg|jpeg|png|webp",
  doc_aluno_url: "jpg|jpeg|png|webp|pdf",
  doc_resp_url: "jpg|jpeg|png|webp|pdf",
  doc_instrutor_url: "jpg|jpeg|png|webp|pdf",
  doc_url: "jpg|jpeg|png|webp|pdf",
};
const LEGACY_COMPATIBILITY_REMOVAL = "2026-08-24";

function fieldPathPattern(field: string): RegExp {
  const contract = FIELD_FILE_CONTRACTS[field];
  return new RegExp(`^pendentes/${UUID_PATTERN}/${contract.category}\\.(${contract.extensions})$`, "i");
}

function legacyUrlPattern(field: string): RegExp {
  return new RegExp(`^/storage/v1/object/public/${STORAGE_BUCKET_DEFAULT}/${LEGACY_PREFIX_BY_FIELD[field]}/${UUID_PATTERN}\\.(${LEGACY_EXTENSION_BY_FIELD[field]})$`, "i");
}

function isValidLegacyUrl(value: string, field: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(value);
    const origin = new URL(supabaseUrl).origin;
    return url.protocol === "https:" && url.origin === origin &&
      url.username === "" && url.password === "" && url.search === "" &&
      url.hash === "" && url.pathname === decodeURI(url.pathname) &&
      legacyUrlPattern(field).test(url.pathname);
  } catch (_) {
    return false;
  }
}

function assertCanonicalUuid(uuid: string): void {
  if (!new RegExp(`^${UUID_PATTERN}$`, "i").test(uuid)) {
    throw new Error("uuid gerado não é canônico");
  }
}

function validarArquivosPropostos(
  arquivos: unknown,
  tipo: string,
  supabaseUrl: string,
  storageBucket: string,
): Record<string, string> {
  if (arquivos === undefined || arquivos === null) return {};
  if (typeof arquivos !== "object" || Array.isArray(arquivos)) {
    throw new CadastroInvalidoError("arquivo_invalido", "arquivos deve ser um objeto");
  }
  const permitidos = camposArquivosPermitidos(tipo);
  const out: Record<string, string> = {};
  let submissionUuid: string | null = null;
  for (const [k, v] of Object.entries(arquivos as Record<string, unknown>)) {
    if (!permitidos.has(k)) {
      throw new CadastroInvalidoError("arquivo_invalido", `campo não permitido em arquivos: ${k}`);
    }
    if (typeof v !== "string" || v.length === 0 || v.length > 2048) {
      throw new CadastroInvalidoError("arquivo_invalido", `arquivo ${k} inválido`);
    }
    if (fieldPathPattern(k).test(v)) {
      const uuid = v.split("/")[1];
      if (submissionUuid === null) submissionUuid = uuid;
      if (submissionUuid !== uuid) {
        throw new CadastroInvalidoError("arquivo_invalido", "arquivos devem compartilhar o mesmo UUID");
      }
      out[k] = v;
      continue;
    }
    if (isValidLegacyUrl(v, k, supabaseUrl)) {
      out[k] = v;
      continue;
    }
    throw new CadastroInvalidoError("arquivo_invalido", `arquivo ${k} não corresponde ao contrato`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Submission de solicitação
// ---------------------------------------------------------------------------

interface SolicitacaoResult {
  solicitacao_id: number | null;
  status: "pendente";
}

async function solicitarAtualizacao(
  supabase: any,
  cpf: string,
  rawDados: unknown,
  rawArquivos: unknown,
  tipo: string,
  env: EdgeEnv,
): Promise<SolicitacaoResult> {
  const dadosValidados = validarDadosPropostos(rawDados, tipo);
  const storageBucket = env.STORAGE_BUCKET ?? STORAGE_BUCKET_DEFAULT;
  if (storageBucket !== STORAGE_BUCKET_DEFAULT) {
    throw new CadastroInvalidoError("arquivo_invalido", "bucket de storage inválido");
  }
  const arquivosValidados = validarArquivosPropostos(
    rawArquivos,
    tipo,
    env.SUPABASE_URL ?? "",
    storageBucket,
  );

  // Atleta exige cpf_responsavel. Instrutor não.
  if (tipo === "atleta") {
    const rawCpfResponsavel = dadosValidados.cpf_responsavel;
    if (
      rawCpfResponsavel === undefined || rawCpfResponsavel === null ||
      rawCpfResponsavel === ""
    ) {
      throw new CadastroInvalidoError(
        "cpf_responsavel_obrigatorio",
        "cpf_responsavel é obrigatório para criar solicitação de atleta",
      );
    }
    var cpfResponsavel: string;
    try {
      cpfResponsavel = normalizarCpf(rawCpfResponsavel);
    } catch (e) {
      if (e instanceof CpfInvalidoError) {
        throw new CadastroInvalidoError(
          "cpf_responsavel_invalido",
          "cpf_responsavel inválido",
        );
      }
      throw new CadastroInvalidoError(
        "cpf_responsavel_invalido",
        sanitizeErrorMessage((e as Error).message),
      );
    }
  }

  const rpcArgs: Record<string, unknown> = {
    p_cpf: cpf,
    p_dados: dadosValidados,
    p_arquivos: arquivosValidados,
    p_tipo: tipo,
  };
  if (tipo === "atleta") {
    rpcArgs.p_cpf_responsavel = cpfResponsavel;
  }

  const { data, error } = await supabase.rpc("criar_solicitacao_atualizacao", rpcArgs);
  if (error) {
    if (error.code === "23505" || error.message === "solicitacao_pendente_existente") {
      throw new PendingRequestExistsError();
    }
    if (error.code === "P0002") {
      // Atleta/instrutor não encontrado (mensagem varia). Tratamos como
      // not-found para normalizar a resposta.
      if (tipo === "instrutor") {
        throw new InstructorNotFoundError();
      }
      throw new AthleteNotFoundError();
    }
    if (error.message === "atleta_nao_encontrado") {
      throw new AthleteNotFoundError();
    }
    if (error.message === "instrutor_nao_encontrado") {
      throw new InstructorNotFoundError();
    }
    throw new Error("Falha ao criar solicitação");
  }
  const result = Array.isArray(data) ? data[0] : data;
  return { solicitacao_id: result?.id ?? null, status: "pendente" };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export interface HandleRequestOpts {
  env?: EdgeEnv;
  _injected?: Deps;
}

export async function handleRequest(
  request: Request,
  opts: HandleRequestOpts = {},
): Promise<Response> {
  const env = opts.env ?? {};
  const origin = corsOrigin(request, env);

  if (request.method === "OPTIONS") {
    return withCorsHeaders(new Response(null, { status: 204 }), origin);
  }

  if (request.method !== "POST") {
    return await buildEnvelopeResponse(
      405,
      err("metodo_nao_permitido", "Apenas POST é permitido"),
      origin,
    );
  }

  let deps: Deps;
  try {
    if (opts._injected) {
      deps = opts._injected;
    } else {
      const { url, key } = requireServiceRole(env);
      const supabase = await createRealSupabaseClient(url, key);
      deps = {
        supabase,
      };
    }
  } catch (e) {
    return await buildEnvelopeResponse(
      500,
      err("configuracao_invalida", sanitizeErrorMessage((e as Error).message)),
      origin,
    );
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    rawBody = text ? JSON.parse(text) : null;
  } catch (_) {
    return await buildEnvelopeResponse(
      400,
      err("json_invalido", "Corpo JSON inválido"),
      origin,
    );
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return await buildEnvelopeResponse(
      400,
      err("json_invalido", "Corpo deve ser objeto JSON"),
      origin,
    );
  }

  const body = rawBody as Record<string, unknown>;
  const action = body.action;
  const cpfRaw = body.cpf;
  const tipoRaw = body.tipo;
  // Default: atleta (compatibilidade com chamadas que ainda não mandam
  // ``tipo``). Frontend sempre envia a partir do commit 8488faa.
  const tipo = typeof tipoRaw === "string" && TIPOS_VALIDOS.has(tipoRaw) ? tipoRaw : "atleta";

  if (typeof action !== "string" || !ACTIONS_VALIDAS.has(action)) {
    return await buildEnvelopeResponse(
      400,
      err("acao_invalida", "Action inválida"),
      origin,
    );
  }

  let cpf: string;
  try {
    cpf = normalizarCpf(cpfRaw);
  } catch (e) {
    if (e instanceof CpfInvalidoError) {
      return await buildEnvelopeResponse(
        400,
        err("cpf_invalido", "CPF inválido"),
        origin,
      );
    }
    return await buildEnvelopeResponse(
      400,
      err("cpf_invalido", sanitizeErrorMessage((e as Error).message)),
      origin,
    );
  }

  const ip = request.headers.get("fly-client-ip") ?? "0.0.0.0";
  const rateKey = `${cpf}|${ip}`;
  let rateAllowed: boolean;
  if (deps.rate) {
    rateAllowed = deps.rate.tryConsume(rateKey);
  } else {
    const { data, error } = await deps.supabase.rpc("consumir_rate_limit", {
      p_chave: rateKey,
      p_limite: 5,
      p_janela_segundos: 60,
    });
    if (error) {
      return await buildEnvelopeResponse(
        503,
        err("rate_limit_indisponivel", "Serviço de limite temporariamente indisponível"),
        origin,
      );
    }
    rateAllowed = data === true;
  }
  if (!rateAllowed) {
    return await buildEnvelopeResponse(
      429,
      err("rate_limit_excedido", "Limite de requisições excedido"),
      origin,
    );
  }

  try {
    if (action === ActionConsultar) {
      if (tipo === "atleta") {
        const rawCpfResponsavel = body.cpf_responsavel;
        if (
          rawCpfResponsavel === undefined || rawCpfResponsavel === null ||
          typeof rawCpfResponsavel !== "string" || rawCpfResponsavel === ""
        ) {
          return await buildEnvelopeResponse(
            400,
            err(
              "cpf_responsavel_obrigatorio",
              "cpf_responsavel é obrigatório para consultar atleta",
            ),
            origin,
          );
        }
        let cpfResponsavel: string;
        try {
          cpfResponsavel = normalizarCpf(rawCpfResponsavel);
        } catch (e) {
          if (e instanceof CpfInvalidoError) {
            return await buildEnvelopeResponse(
              400,
              err("cpf_responsavel_invalido", "cpf_responsavel inválido"),
              origin,
            );
          }
          return await buildEnvelopeResponse(
            400,
            err(
              "cpf_responsavel_invalido",
              sanitizeErrorMessage((e as Error).message),
            ),
            origin,
          );
        }
        const result = await consultarAtleta(deps.supabase, cpf, cpfResponsavel);
        return await buildEnvelopeResponse(200, ok(result), origin);
      }
      // tipo === "instrutor"
      const result = await consultarInstrutor(deps.supabase, cpf);
      return await buildEnvelopeResponse(200, ok(result), origin);
    }
    // ActionSolicitarAtualizacao
    const result = await solicitarAtualizacao(
      deps.supabase,
      cpf,
      body.dados,
      body.arquivos,
      tipo,
      env,
    );
    return await buildEnvelopeResponse(200, ok(result), origin);
  } catch (e) {
    // SIBLING-PATH GATE PARITY (preservado da versão original).
    // Normaliza 404/409 para 200 com encontrado: false, eliminando
    // side-channel entre actions.
    if (
      e instanceof AthleteNotFoundError ||
      e instanceof InstructorNotFoundError ||
      e instanceof PendingRequestExistsError
    ) {
      return await buildEnvelopeResponse(
        200,
        ok({
          encontrado: false,
          status: null,
          pendencias: [],
          [tipo === "instrutor" ? "instrutor" : "atleta"]: null,
        }),
        origin,
      );
    }

    if (e instanceof HttpError) {
      return await buildEnvelopeResponse(
        e.status,
        err(e.code, sanitizeErrorMessage(e.message)),
        origin,
      );
    }
    return await buildEnvelopeResponse(
      500,
      err("erro_interno", "Erro interno ao processar requisição"),
      origin,
    );
  }
}

// ---------------------------------------------------------------------------
// Bootstrap para Supabase Edge Functions
// ---------------------------------------------------------------------------

if (
  typeof (globalThis as any).Deno?.serve === "function" &&
  (import.meta as any).main
) {
  (globalThis as any).Deno.serve((req: Request) =>
    handleRequest(req, {
      env: {
        SUPABASE_URL: (globalThis as any).Deno.env?.get?.("SUPABASE_URL"),
        SUPABASE_SERVICE_ROLE_KEY:
          (globalThis as any).Deno.env?.get?.("SUPABASE_SERVICE_ROLE_KEY"),
        SUPABASE_SECRET_KEYS:
          (globalThis as any).Deno.env?.get?.("SUPABASE_SECRET_KEYS"),
      },
    })
  );
}
