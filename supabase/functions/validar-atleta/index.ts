// Edge Function: validar-atleta
// ------------------------------------------------------------------
// Recebe POST com JSON { action: 'consultar' | 'criar', ... } e
// classifica ou cria pré-cadastros. Suporta tipo='atleta' (com
// cpf_responsavel) e tipo='instrutor' (sem responsável).
//
// IMPORTANTE: este arquivo é uma versão REESCRITA que adiciona
// suporte a instrutor. Se a função original tiver lógica adicional
// (ex: webhooks, e-mails, integrações externas), copie essas partes
// antes de substituir. O contrato com o frontend foi mantido:
//
//   Consultar:
//     POST { action:'consultar', tipo:'atleta'|'instrutor',
//            cpf, cpf_responsavel? }
//     → 200 { success:true, data:{ encontrado, status, atleta|null,
//                                 pendencias:string[] } }
//
//   Criar:
//     POST { action:'criar', tipo:'atleta'|'instrutor', ...campos }
//     → 200 { success:true, data:{ protocolo } }
//     → 4xx { success:false, error }
//
// Deploy: `supabase functions deploy validar-atleta --no-verify-jwt`
// (a Edge usa service role para escrever na tabela).
// ------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// Chaves que precisam estar preenchidas para a ficha ser considerada
// "completa". Cada tipo tem o seu próprio conjunto.
const REQUIRED_FIELDS_ATLETA = [
    'nome', 'cpf', 'data_nascimento', 'data_envio',
    'nome_responsavel', 'cpf_responsavel', 'parentesco',
    'email', 'telefone', 'endereco', 'periodo', 'modalidades',
    'foto_url', 'doc_aluno_url', 'doc_resp_url',
];

const REQUIRED_FIELDS_INSTRUTOR = [
    'nome', 'cpf', 'data_nascimento', 'data_envio',
    'funcao', 'periodo',
    'email', 'telefone', 'endereco',
    'foto_url', 'doc_instrutor_url',
];

// Labels traduzidos para ``pendencias[]``. Mantido em paridade com
// ``PENDENCIAS_TRADUZIDAS`` em ``app.js``.
const PENDENCIAS_TRADUZIDAS: Record<string, string> = {
    nome: 'Nome completo',
    rg: 'RG',
    cpf: 'CPF',
    data_nascimento: 'Data de nascimento',
    nome_responsavel: 'Nome do responsável',
    cpf_responsavel: 'CPF do responsável',
    parentesco: 'Parentesco',
    email: 'E-mail',
    telefone: 'Telefone',
    endereco: 'Endereço',
    periodo: 'Período',
    modalidades: 'Modalidades',
    funcao: 'Função / Cargo',
    foto_url: 'Foto',
    doc_aluno_url: 'Documento do atleta',
    doc_resp_url: 'Documento do responsável',
    doc_instrutor_url: 'Documento do instrutor',
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return json({ success: false, error: 'Método não permitido' }, 405);
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ success: false, error: 'JSON inválido' }, 400);
    }

    const action = body.action as string;
    const tipo = (body.tipo as string) || 'atleta';

    if (tipo !== 'atleta' && tipo !== 'instrutor') {
        return json({ success: false, error: 'Tipo inválido' }, 400);
    }

    try {
        if (action === 'consultar') {
            return await handleConsultar(body, tipo);
        }
        if (action === 'criar') {
            return await handleCriar(body, tipo);
        }
        return json({ success: false, error: 'Ação desconhecida' }, 400);
    } catch (e) {
        console.error('validar-atleta erro:', e);
        return json({ success: false, error: String(e) }, 500);
    }
});

// ==================== CONSULTAR ====================

async function handleConsultar(body: Record<string, unknown>, tipo: string) {
    const cpf = (body.cpf as string || '').replace(/\D/g, '');
    const cpfResp = (body.cpf_responsavel as string || '').replace(/\D/g, '');

    if (!cpf || cpf.length !== 11) {
        return json({ success: false, error: 'CPF inválido' }, 400);
    }

    // Instrutor não tem responsável — busca só por (tipo, cpf).
    // Atleta: busca por (tipo, cpf, cpf_responsavel).
    let query = supabase
        .from('cadastros_pendentes')
        .select('*')
        .eq('tipo', tipo)
        .eq('cpf', cpf)
        .order('created_at', { ascending: false })
        .limit(1);

    if (tipo === 'atleta') {
        if (!cpfResp || cpfResp.length !== 11) {
            return json({ success: false, error: 'CPF do responsável inválido' }, 400);
        }
        query = query.eq('cpf_responsavel', cpfResp);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    if (!rows || rows.length === 0) {
        return json({
            success: true,
            data: { encontrado: false, status: null, atleta: null, pendencias: [] },
        });
    }

    const record = rows[0];

    // Não retorna cadastros já aprovados (já migraram para a tabela
    // final). Mantém compatibilidade com o frontend atual.
    if (record.status_pendente === 'aprovado') {
        return json({
            success: true,
            data: { encontrado: false, status: null, atleta: null, pendencias: [] },
        });
    }

    // Pendência = já existe solicitação de atualização em análise.
    if (record.status_pendente === 'pendente') {
        return json({
            success: true,
            data: {
                encontrado: true,
                status: null,
                atleta: record,
                pendencias: ['atualizacao_em_analise'],
            },
        });
    }

    const required = tipo === 'instrutor' ? REQUIRED_FIELDS_INSTRUTOR : REQUIRED_FIELDS_ATLETA;
    const pendencias = required.filter((k) => !record[k]);

    const completo = pendencias.length === 0;

    return json({
        success: true,
        data: {
            encontrado: true,
            status: completo ? 'completo' : 'incompleto',
            atleta: record,
            pendencias,
        },
    });
}

// ==================== CRIAR ====================

async function handleCriar(body: Record<string, unknown>, tipo: string) {
    // Validação mínima — protocolo continua sendo UUIDv4 (length 36)
    // para satisfazer a RLS ``anon_insert_cadastros_pendentes``.
    const protocolo = body.protocolo as string;
    if (!protocolo || protocolo.length !== 36) {
        return json({ success: false, error: 'Protocolo ausente ou inválido' }, 400);
    }

    // Defesa extra: garante que instrutor não envia cpf_responsavel
    // e atleta envia. A RLS pode validar isso, mas falhamos cedo aqui
    // com mensagem clara.
    if (tipo === 'instrutor' && body.cpf_responsavel) {
        return json({
            success: false,
            error: 'Instrutor não deve ter cpf_responsavel',
        }, 400);
    }

    // Re-monta o payload explicitamente — não confiamos em chaves
    // extras que o cliente possa ter enviado.
    const payload: Record<string, unknown> = {
        tipo,
        protocolo,
        status_pendente: 'pendente',
    };

    // Whitelist de campos (qualquer chave fora daqui é descartada).
    const ALLOWED_FIELDS = [
        'nome', 'rg', 'cpf', 'data_nascimento', 'idade', 'categoria',
        'funcao', 'periodo', 'email', 'telefone', 'endereco',
        'nome_responsavel', 'parentesco', 'cpf_responsavel',
        'modalidades', 'problema_saude',
        'foto_url', 'doc_aluno_url', 'doc_resp_url', 'doc_instrutor_url',
        'data_envio',
    ];

    for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) payload[key] = body[key];
    }

    // Atleta precisa de cpf_responsavel.
    if (tipo === 'atleta' && !payload.cpf_responsavel) {
        return json({
            success: false,
            error: 'Atleta deve informar cpf_responsavel',
        }, 400);
    }

    const { error } = await supabase
        .from('cadastros_pendentes')
        .insert(payload);

    if (error) {
        // Conflito de protocolo (uuid duplicado) — improvável mas possível
        // se o cliente reenviar. Sinaliza claramente.
        if (error.code === '23505') {
            return json({ success: false, error: 'Protocolo já utilizado' }, 409);
        }
        throw error;
    }

    return json({ success: true, data: { protocolo } });
}

// ==================== HELPERS ====================

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
