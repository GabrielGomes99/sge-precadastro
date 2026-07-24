// web/precadastro/lookup-helpers.js
//
// Pure-function helpers used by the public portal during CPF lookup and
// update submission (Task 6). This module deliberately depends on no
// browser APIs so it can be unit-tested with `node --test`.
//
// Responsibilities:
//   - extrairDigitos            : strip formatting from a CPF string.
//   - validateCPFInternal       : modulo-11 check-digit algorithm.
//                                 Kept in lockstep with
//                                 web/precadastro/app.js#validateCPF —
//                                 both must agree on validity so the
//                                 client gate matches the server gate.
//   - cpfValidoParaLookup       : thin wrapper used by the input handler
//                                 before calling the Edge Function.
//   - extrairEnderecoLegado     : parse "Rua X, 123 - Bairro, Cidade - CEP".
//   - parseModalidades          : normalize CSV or array into trimmed list.
//   - montarPayloadSolicitacao  : assemble the whitelist-shaped payload
//                                 sent to the Edge Function on update.
//   - CAMPOS_DADOS_PERMITIDOS /
//     CAMPOS_ARQUIVOS_PERMITIDOS: whitelists used for payload filtering.
//
// DOM-touching logic (debounced listeners, modal rendering, file
// uploads) lives in app.js. Those pieces no-op when the corresponding
// elements are absent, per the task brief.

// ---------------------------------------------------------------------------
// CPF helpers
// ---------------------------------------------------------------------------

/**
 * Strip non-digit characters from a CPF string. Returns "" for non-string
 * inputs to keep callers from having to guard themselves.
 */
export function extrairDigitos(cpf) {
    if (typeof cpf !== 'string') return '';
    return cpf.replace(/\D/g, '');
}

/**
 * Validate the 11-digit CPF check digits. Mirrors the algorithm in
 * app.js#validateCPF byte-for-byte: rejects non-11-digit input, all-repeated
 * sequences, and fails on either of the two modulo-11 checks.
 *
 * Returns false on any non-string input.
 */
export function validateCPFInternal(cpf) {
    if (typeof cpf !== 'string') return false;
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[9], 10) !== check) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
    check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[10], 10) !== check) return false;

    return true;
}

/**
 * Returns true only if the input is a string that normalizes to a
 * 11-digit CPF with valid check digits. This is the gate the input
 * listener uses before calling the Edge Function — partial input never
 * triggers a lookup.
 */
export function cpfValidoParaLookup(cpf) {
    const d = extrairDigitos(cpf);
    if (d.length !== 11) return false;
    return validateCPFInternal(d);
}

// ---------------------------------------------------------------------------
// Legacy address parser
// ---------------------------------------------------------------------------

/**
 * Parse the legacy concatenated address string
 *   "Rua X, 123 - Bairro, Cidade - 12345-678"
 * into structured fields. Best-effort: returns blanks for parts that
 * cannot be parsed. The parser is intentionally permissive — if the
 * portal only has the legacy string, we want to surface as much as we
 * can and leave the user to fill the gaps.
 */
export function extrairEnderecoLegado(enderecoStr) {
    const out = { rua: '', numero: '', bairro: '', cidade: '', cep: '' };
    if (typeof enderecoStr !== 'string' || !enderecoStr.trim()) return out;

    const trimmed = enderecoStr.trim();

    // CEP: look for the last "- 12345-678" or "- 12345678" at the end.
    const cepMatch = trimmed.match(/-\s*(\d{5}-?\d{3})\s*$/);
    let head = trimmed;
    if (cepMatch) {
        out.cep = cepMatch[1];
        head = trimmed.slice(0, cepMatch.index).trim().replace(/[-,]\s*$/, '');
    }

    // Cidade: text after the last comma in the remaining string.
    const lastComma = head.lastIndexOf(',');
    if (lastComma !== -1) {
        out.cidade = head.slice(lastComma + 1).trim();
        head = head.slice(0, lastComma).trim();
    }

    // Bairro: text after the last " - ".
    const bairroSep = head.lastIndexOf(' - ');
    if (bairroSep !== -1) {
        out.bairro = head.slice(bairroSep + 3).trim();
        head = head.slice(0, bairroSep).trim();
    }

    // Rua/numero: "Rua X, 123" -> split on the last comma.
    const ruaComma = head.lastIndexOf(',');
    if (ruaComma !== -1) {
        out.rua = head.slice(0, ruaComma).trim();
        out.numero = head.slice(ruaComma + 1).trim();
    } else {
        out.rua = head;
    }

    return out;
}

// ---------------------------------------------------------------------------
// Modalidades
// ---------------------------------------------------------------------------

/**
 * Normalize a modalidades value to an array of trimmed, non-empty strings.
 * Accepts a CSV string, an array, or null/undefined.
 */
export function parseModalidades(value) {
    if (Array.isArray(value)) {
        return value
            .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
            .filter(Boolean);
    }
    if (typeof value !== 'string') return [];
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Payload assembly (whitelist enforcement)
// ---------------------------------------------------------------------------

/**
 * Whitelist of fields the client may send in `dados`. Mirrors the
 * CAMPOS_DADOS_PERMITIDOS set in supabase/functions/validar-atleta/index.ts.
 * The Edge Function re-validates — never trust the client — but we
 * filter on the way out as defense in depth.
 */
export const CAMPOS_DADOS_PERMITIDOS = new Set([
    'nome',
    'rg',
    'data_nascimento',
    'endereco',
    'rua',
    'numero',
    'bairro',
    'cidade',
    'cep',
    'nome_responsavel',
    'parentesco',
    'cpf_responsavel',
    'email',
    'telefone',
    'problema_saude',
    'modalidades',
    'periodo',
]);

/**
 * Whitelist of file URL keys. The Edge Function validates the URL
 * points to its own storage bucket before accepting it.
 */
export const CAMPOS_ARQUIVOS_PERMITIDOS = new Set([
    'foto_url',
    'doc_aluno_url',
    'doc_resp_url',
]);

/**
 * Filter `dados` to whitelisted keys. Returns a new object — never
 * mutates the input. Drops null/undefined and non-string values for
 * non-boolean fields; the Edge Function does the strict type check
 * downstream.
 */
function filtrarDados(dados) {
    const out = {};
    if (!dados || typeof dados !== 'object') return out;
    for (const [k, v] of Object.entries(dados)) {
        if (!CAMPOS_DADOS_PERMITIDOS.has(k)) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed) out[k] = trimmed;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            out[k] = String(v);
        }
    }
    return out;
}

function filtrarArquivos(arquivos) {
    const out = {};
    if (!arquivos || typeof arquivos !== 'object') return out;
    for (const [k, v] of Object.entries(arquivos)) {
        if (!CAMPOS_ARQUIVOS_PERMITIDOS.has(k)) continue;
        if (typeof v !== 'string' || !v) continue;
        out[k] = v;
    }
    return out;
}

/**
 * Build the body posted to the Edge Function for `solicitar_atualizacao`.
 *
 * Inputs:
 *   - cpf        : athlete CPF, any formatting (digits are extracted).
 *   - dadosForm  : object keyed by form field id (or by the whitelisted
 *                  key — the function doesn't care, it filters by key).
 *   - arquivos   : { foto_url, doc_aluno_url, doc_resp_url } — empty
 *                  strings are dropped, existing URLs from the lookup
 *                  are passed through.
 *
 * Output shape (exactly what the Edge Function expects):
 *   {
 *     action: 'solicitar_atualizacao',
 *     cpf: <11 digits>,
 *     dados: { ...whitelisted },
 *     arquivos: { ...whitelisted }
 *   }
 *
 * The function NEVER includes `atleta_id`, `snapshot`, `status`,
 * `decidido_por`, or any other server-derived field — even if the
 * caller accidentally passes them.
 */
export function montarPayloadSolicitacao(cpf, dadosForm, arquivos) {
    const cpfLimpo = extrairDigitos(cpf);
    return {
        action: 'solicitar_atualizacao',
        cpf: cpfLimpo,
        dados: filtrarDados(dadosForm),
        arquivos: filtrarArquivos(arquivos),
    };
}

// ---------------------------------------------------------------------------
// Browser bridge
// ---------------------------------------------------------------------------
//
// This file is also loaded as a ``<script type="module">`` from
// ``index.html``. In that environment we expose the same exports on
// ``window.__lookupHelpers`` so the classic ``app.js`` script (which
// cannot use ``import``) can call them without re-implementing the
// logic. The exports above are still available for any future ES module
// consumer.
//
// When the file is imported by Node for tests, ``window`` is undefined
// — we skip the bridge silently.

if (typeof window !== 'undefined') {
    window.__lookupHelpers = {
        extrairDigitos,
        validateCPFInternal,
        cpfValidoParaLookup,
        extrairEnderecoLegado,
        parseModalidades,
        montarPayloadSolicitacao,
        CAMPOS_DADOS_PERMITIDOS,
        CAMPOS_ARQUIVOS_PERMITIDOS,
    };
}