// supabase/functions/_shared/cadastro.ts
//
// Contrato compartilhado de validação para a Edge Function ``validar-atleta``.
//
// Suporta dois tipos de cadastro:
//   - "atleta"   : exige dados do responsável (cpf_responsavel).
//                   Campos obrigatórios em CAMPOS_TEXTO_OBRIGATORIOS.
//   - "instrutor": NÃO tem responsável. Campos obrigatórios em
//                   CAMPOS_TEXTO_OBRIGATORIOS_INSTRUTOR.
//
// Política de validação: a forma como ``validar-atleta`` usa este módulo é
// puramente server-side. O portal público continua sendo apenas o cliente.

export type CadastroStatus = "completo" | "incompleto";

export interface ClassificacaoCadastro {
  status: CadastroStatus;
  pendencias: string[];
}

export interface PublicAthleteData {
  id: number | null;
  nome: string;
  rg: string;
  cpf: string;
  data_nascimento: string;
  endereco: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  nome_responsavel: string;
  parentesco: string;
  cpf_responsavel: string;
  email: string;
  telefone: string;
  problema_saude: string;
  modalidades: string;
  periodo: string;
  status: string;
  foto_url: string;
  doc_aluno_url: string;
  doc_resp_url: string;
}

// Contrato público do instrutor. Mesma forma do atleta, sem campos de
// responsável e com ``funcao`` + ``doc_instrutor_url``.
export interface PublicInstructorData {
  id: number | null;
  nome: string;
  rg: string;
  cpf: string;
  data_nascimento: string;
  endereco: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  email: string;
  telefone: string;
  funcao: string;
  periodo: string;
  status: string;
  foto_url: string;
  doc_instrutor_url: string;
}

export class CpfInvalidoError extends Error {
  constructor(message: string = "CPF inválido") {
    super(message);
    this.name = "CpfInvalidoError";
  }
}

// ---------------------------------------------------------------------------
// Lista explícita de campos obrigatórios — atleta
// ---------------------------------------------------------------------------

const CAMPOS_TEXTO_OBRIGATORIOS: readonly string[] = [
  "nome",
  "data_nascimento",
  "cpf",
  "nome_responsavel",
  "parentesco",
  "cpf_responsavel",
  "email",
  "telefone",
  "periodo",
  "modalidades",
  "foto_url",
  "doc_aluno_url",
  "doc_resp_url",
];

// ---------------------------------------------------------------------------
// Lista explícita de campos obrigatórios — instrutor
// ---------------------------------------------------------------------------
//
// Instrutor não tem responsável. Os arquivos são ``foto_url`` e
// ``doc_instrutor_url``. ``funcao`` é obrigatória (cargo).
const CAMPOS_TEXTO_OBRIGATORIOS_INSTRUTOR: readonly string[] = [
  "nome",
  "data_nascimento",
  "cpf",
  "email",
  "telefone",
  "funcao",
  "periodo",
  "foto_url",
  "doc_instrutor_url",
];

const CAMPOS_ENDERECO_ESTRUTURADO: readonly string[] = [
  "rua",
  "numero",
  "bairro",
  "cidade",
  "cep",
];

// ---------------------------------------------------------------------------
// normalizarCpf
// ---------------------------------------------------------------------------

export function normalizarCpf(value: unknown): string {
  if (typeof value !== "string") {
    throw new CpfInvalidoError("CPF deve ser uma string");
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) {
    throw new CpfInvalidoError("CPF deve conter 11 dígitos");
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    throw new CpfInvalidoError("CPF não pode ser sequência repetida");
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * (10 - i);
  }
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9], 10) !== check) {
    throw new CpfInvalidoError("Primeiro dígito verificador inválido");
  }

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i], 10) * (11 - i);
  }
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[10], 10) !== check) {
    throw new CpfInvalidoError("Segundo dígito verificador inválido");
  }

  return digits;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function isBlank(value: unknown): boolean {
  return asString(value) === "";
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return isBlank(value);
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] !== undefined) {
      return row[k];
    }
  }
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  return asString(pick(row, keys));
}

function pickCpf(row: Record<string, unknown>, keys: string[]): string {
  const raw = pick(row, keys);
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  return digits;
}

function pickId(row: Record<string, unknown>): number | null {
  const v = pick(row, ["id", "instrutor_id", "aluno_id"]);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    return parseInt(v.trim(), 10);
  }
  return null;
}

function joinModalidades(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter(Boolean).join(", ");
  }
  return asString(value);
}

function calcularPendenciasPorCampos(
  row: Record<string, unknown>,
  camposObrigatorios: readonly string[],
): string[] {
  const pendencias: string[] = [];
  for (const campo of camposObrigatorios) {
    if (isMissing(row[campo])) {
      pendencias.push(campo);
    }
  }
  // Endereço: aceito se ``endereco`` legacy está presente OU se todos os
  // componentes estruturados estão preenchidos. Aplica-se a ambos os tipos.
  const enderecoLegacy = asString(row["endereco"]);
  const todosComponentes = CAMPOS_ENDERECO_ESTRUTURADO.every((c) =>
    !isMissing(row[c])
  );
  if (!enderecoLegacy && !todosComponentes) {
    pendencias.push("endereco");
  }
  return pendencias;
}

// ---------------------------------------------------------------------------
// calcularPendencias (atleta) — preserva contrato público existente
// ---------------------------------------------------------------------------

export function calcularPendencias(row: Record<string, unknown>): string[] {
  return calcularPendenciasPorCampos(row, CAMPOS_TEXTO_OBRIGATORIOS);
}

export function calcularPendenciasInstrutor(
  row: Record<string, unknown>,
): string[] {
  return calcularPendenciasPorCampos(
    row,
    CAMPOS_TEXTO_OBRIGATORIOS_INSTRUTOR,
  );
}

// ---------------------------------------------------------------------------
// classificarCadastro
// ---------------------------------------------------------------------------

export function classificarCadastro(
  row: Record<string, unknown>,
): ClassificacaoCadastro {
  const pendencias = calcularPendencias(row);
  return {
    status: pendencias.length === 0 ? "completo" : "incompleto",
    pendencias,
  };
}

export function classificarCadastroInstrutor(
  row: Record<string, unknown>,
): ClassificacaoCadastro {
  const pendencias = calcularPendenciasInstrutor(row);
  return {
    status: pendencias.length === 0 ? "completo" : "incompleto",
    pendencias,
  };
}

// ---------------------------------------------------------------------------
// mapearAtleta
// ---------------------------------------------------------------------------

const PUBLIC_KEYS_ATLETA: ReadonlySet<keyof PublicAthleteData> = new Set([
  "id",
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
  "status",
  "foto_url",
  "doc_aluno_url",
  "doc_resp_url",
]);

export function mapearAtleta(row: Record<string, unknown>): PublicAthleteData {
  const mapped: Record<string, unknown> = {
    id: pickId(row),
    nome: pickString(row, ["nome", "nome_completo"]),
    rg: pickString(row, ["rg", "rg_atleta"]),
    cpf: pickCpf(row, ["cpf", "cpf_atleta"]),
    data_nascimento: asString(pick(row, ["data_nascimento"])),
    endereco: pickString(row, ["endereco"]),
    rua: pickString(row, ["rua"]),
    numero: pickString(row, ["numero"]),
    bairro: pickString(row, ["bairro"]),
    cidade: pickString(row, ["cidade"]),
    cep: pickString(row, ["cep"]),
    nome_responsavel: pickString(row, ["nome_responsavel"]),
    parentesco: pickString(row, [
      "parentesco",
      "parentesco_responsavel",
    ]),
    cpf_responsavel: pickCpf(row, ["cpf_responsavel"]),
    email: pickString(row, ["email"]),
    telefone: pickString(row, ["telefone"]),
    problema_saude: pickString(row, ["problema_saude", "info_saude"]),
    modalidades: joinModalidades(pick(row, ["modalidades"])),
    periodo: pickString(row, ["periodo"]),
    status: pickString(row, ["status"]),
    foto_url: pickString(row, ["foto_url"]),
    doc_aluno_url: pickString(row, ["doc_aluno_url"]),
    doc_resp_url: pickString(row, ["doc_resp_url"]),
  };

  const result: Partial<PublicAthleteData> = {};
  for (const key of Object.keys(mapped)) {
    if (PUBLIC_KEYS_ATLETA.has(key as keyof PublicAthleteData)) {
      (result as Record<string, unknown>)[key] = mapped[key];
    }
  }
  return result as PublicAthleteData;
}

// ---------------------------------------------------------------------------
// mapearInstrutor
// ---------------------------------------------------------------------------

const PUBLIC_KEYS_INSTRUTOR: ReadonlySet<keyof PublicInstructorData> = new Set([
  "id",
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
  "funcao",
  "periodo",
  "status",
  "foto_url",
  "doc_instrutor_url",
]);

export function mapearInstrutor(
  row: Record<string, unknown>,
): PublicInstructorData {
  const mapped: Record<string, unknown> = {
    id: pickId(row),
    nome: pickString(row, ["nome", "nome_completo"]),
    rg: pickString(row, ["rg"]),
    cpf: pickCpf(row, ["cpf"]),
    data_nascimento: asString(pick(row, ["data_nascimento"])),
    endereco: pickString(row, ["endereco"]),
    rua: pickString(row, ["rua"]),
    numero: pickString(row, ["numero"]),
    bairro: pickString(row, ["bairro"]),
    cidade: pickString(row, ["cidade"]),
    cep: pickString(row, ["cep"]),
    email: pickString(row, ["email"]),
    telefone: pickString(row, ["telefone"]),
    funcao: pickString(row, ["funcao", "cargo"]),
    periodo: pickString(row, ["periodo"]),
    status: pickString(row, ["status"]),
    foto_url: pickString(row, ["foto_url"]),
    doc_instrutor_url: pickString(row, ["doc_instrutor_url", "doc_url"]),
  };

  const result: Partial<PublicInstructorData> = {};
  for (const key of Object.keys(mapped)) {
    if (PUBLIC_KEYS_INSTRUTOR.has(key as keyof PublicInstructorData)) {
      (result as Record<string, unknown>)[key] = mapped[key];
    }
  }
  return result as PublicInstructorData;
}
