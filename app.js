// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://yoqjelcixpbygwifwirm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvcWplbGNpeHBieWd3aWZ3aXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzUwMzIsImV4cCI6MjA4NzcxMTAzMn0.9pHR-q6MVNp2EPckhnpb7hkBHB2t8vhF1c9WUvBiR-s';
const ENDPOINT_VALIDAR_ATLETA = `${SUPABASE_URL}/functions/v1/validar-atleta`;

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== CONSTANTS ====================
const MODALIDADES_INEC = ['Futebol'];
const MODALIDADES_NEC = ['Judô', 'Jiu-Jitsu', 'Balé', 'Forró', 'Hip Hop', 'Zumba', 'Vôlei', 'Futsal', 'X1', 'Basquete', 'Tênis de Mesa', 'Handball'];

// Tradução amigável das chaves de pendência retornadas pela Edge
// Function ``validar-atleta`` em ``data.pendencias`` (string[]).
// O modal de consulta INCOMPLETO lista essas strings traduzidas
// para o usuário decidir se quer ou não atualizar. A chave precisa
// casar 100% com o que ``calcularPendencias`` na Edge emite.
const PENDENCIAS_TRADUZIDAS = {
    nome: 'Nome completo do atleta',
    rg: 'RG do atleta',
    data_nascimento: 'Data de nascimento',
    cpf: 'CPF do atleta',
    nome_responsavel: 'Nome do responsável',
    parentesco: 'Grau de parentesco do responsável',
    cpf_responsavel: 'CPF do responsável',
    email: 'E-mail de contato',
    telefone: 'Telefone de contato',
    problema_saude: 'Informações de saúde',
    modalidades: 'Modalidades esportivas',
    periodo: 'Período (manhã/tarde/noite)',
    foto_url: 'Foto do atleta',
    doc_aluno_url: 'Documento de identidade do atleta',
    doc_resp_url: 'Documento de identidade do responsável',
    endereco: 'Endereço completo',
    rua: 'Rua',
    numero: 'Número',
    bairro: 'Bairro',
    cidade: 'Cidade',
    cep: 'CEP',
};

// ==================== FILE STATE ====================
let fotoFile = null;
let docAlunoFile = null;
let docRespFile = null;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initModalidades();
    initInputMasks();
    initConsultaMasks();
});

function initConsultaMasks() {
    // Reaproveita os mesmos masks do form principal para os campos
    // da etapa de consulta.
    const ids = ['inp-consulta-cpf-atleta', 'inp-consulta-cpf-resp'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('input', (e) => {
            const pos = el.selectionStart;
            const oldLen = el.value.length;
            el.value = maskCPF(el.value);
            const newLen = el.value.length;
            el.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
        });
        // Permite disparar a verificação com Enter no campo de CPF.
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verificarCadastro();
            }
        });
    }
}

function initModalidades() {
    const inecContainer = document.getElementById('mod-inec');
    const necContainer = document.getElementById('mod-nec');

    MODALIDADES_INEC.forEach(mod => {
        inecContainer.appendChild(createCheckbox(mod));
    });

    MODALIDADES_NEC.forEach(mod => {
        necContainer.appendChild(createCheckbox(mod));
    });
}

const EMOJI_MAP = {
    'Futebol': '⚽', 'Judô': '🥋', 'Jiu-Jitsu': '🥊', 'Balé': '🩰',
    'Forró': '💃', 'Hip Hop': '🎤', 'Zumba': '💃', 'Vôlei': '🏐',
    'Futsal': '⚽', 'X1': '🏆', 'Basquete': '🏀', 'Tênis de Mesa': '🏓',
    'Handball': '🤾', 'Karatê': '🥋', 'Natação': '🏊', 'Atletismo': '🏃'
};

function createCheckbox(label) {
    const emoji = EMOJI_MAP[label] || '🏅';
    const wrapper = document.createElement('label');
    wrapper.className = 'checkbox-item';
    wrapper.innerHTML = `<input type="checkbox" value="${label}"><span>${emoji} ${label}</span>`;
    return wrapper;
}

// ==================== INPUT MASKS ====================
function initInputMasks() {
    maskInput('inp-data-nasc', maskDate);
    maskInput('inp-cpf-atleta', maskCPF);
    maskInput('inp-cpf-resp', maskCPF);
    maskInput('inp-telefone', maskPhone);
    maskInput('inp-cep', maskCEP);
    maskInput('inp-rg-atleta', maskRG);
}

function maskInput(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const pos = el.selectionStart;
        const oldLen = el.value.length;
        el.value = fn(el.value);
        const newLen = el.value.length;
        const newPos = pos + (newLen - oldLen);
        el.setSelectionRange(newPos, newPos);
    });
}

function maskDate(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5);
    return v.slice(0, 10);
}

function maskCPF(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '.' + v.slice(3);
    if (v.length > 7) v = v.slice(0, 7) + '.' + v.slice(7);
    if (v.length > 11) v = v.slice(0, 11) + '-' + v.slice(11);
    return v.slice(0, 14);
}

function maskPhone(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 0) v = '(' + v;
    if (v.length > 3) v = v.slice(0, 3) + ') ' + v.slice(3);
    if (v.length > 10) v = v.slice(0, 10) + '-' + v.slice(10);
    return v.slice(0, 15);
}

function maskCEP(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    return v.slice(0, 9);
}

function maskRG(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 2) v = v.slice(0, 2) + '.' + v.slice(2);
    if (v.length > 6) v = v.slice(0, 6) + '.' + v.slice(6);
    if (v.length > 10) v = v.slice(0, 10) + '-' + v.slice(10);
    return v.slice(0, 12);
}

// ==================== TOGGLE SAUDE ====================
function toggleSaude() {
    const checked = document.getElementById('inp-tem-saude').checked;
    const details = document.getElementById('saude-details');
    const label = document.getElementById('toggle-saude-text');
    details.style.display = checked ? 'block' : 'none';
    label.textContent = checked ? 'Sim' : 'Não';
}

// ==================== FILE HANDLERS ====================
function handlePhotoSelect(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    if (file.size > 5 * 1024 * 1024) {
        showToast('A foto deve ter no máximo 5MB.', 'error');
        input.value = '';
        return;
    }

    fotoFile = file;
    document.getElementById('foto-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

function handleDocSelect(input, type) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    if (file.size > 10 * 1024 * 1024) {
        showToast('O documento deve ter no máximo 10MB.', 'error');
        input.value = '';
        return;
    }

    if (type === 'aluno') {
        docAlunoFile = file;
        document.getElementById('doc-aluno-status').textContent = file.name;
        document.getElementById('doc-aluno-card').classList.add('has-file');
    } else {
        docRespFile = file;
        document.getElementById('doc-resp-status').textContent = file.name;
        document.getElementById('doc-resp-card').classList.add('has-file');
    }
}

// ==================== VALIDATION ====================
function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function setError(fieldId, msg) {
    const errEl = document.getElementById('err-' + fieldId);
    const inp = document.getElementById('inp-' + fieldId);
    if (errEl) errEl.textContent = msg;
    if (inp) inp.classList.add('input-error');
}

function validateCPF(cpf) {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[9]) !== check) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[10]) !== check) return false;

    return true;
}

/**
 * Strip non-digit characters from a CPF string. Returns 11 raw digits
 * for "111.444.777-35" or "" for null/empty/non-string input.
 *
 * Preserva zeros à esquerda — "012.345.678-90" vira "01234567890"
 * (relevante para CPFs válidos que começam com 0).
 *
 * Parity byte-a-byte com ``lookup-helpers.js#extrairDigitos`` usado
 * pelo live portal: ``typeof s !== 'string' return ''``. Ambos os
 * frontends mandam raw digits para a Edge Function para o payload
 * bater com o que ``normalizarCpf`` produz no backend.
 */
function extrairDigitos(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/\D/g, '');
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm() {
    clearErrors();
    let valid = true;

    function requireField(fieldId, label) {
        const inp = document.getElementById('inp-' + fieldId);
        if (!inp) return;
        const val = inp.value.trim();
        if (!val) {
            setError(fieldId, `${label} é obrigatório`);
            valid = false;
        }
    }

    requireField('nome', 'Nome completo');
    requireField('data-nasc', 'Data de nascimento');
    requireField('cpf-atleta', 'CPF do atleta');
    requireField('nome-resp', 'Nome do responsável');
    requireField('parentesco', 'Parentesco');
    requireField('cpf-resp', 'CPF do responsável');
    requireField('email', 'E-mail');
    requireField('telefone', 'Telefone');
    requireField('rua', 'Rua');
    requireField('numero', 'Número');
    requireField('bairro', 'Bairro');
    requireField('cidade', 'Cidade');
    requireField('cep', 'CEP');

    // Período
    const periodo = document.getElementById('inp-periodo').value;
    if (!periodo) {
        setError('periodo', 'Selecione um período');
        valid = false;
    }

    // CPF validation
    const cpfAtleta = extrairDigitos(document.getElementById('inp-cpf-atleta').value);
    if (cpfAtleta && !validateCPF(cpfAtleta)) {
        setError('cpf-atleta', 'CPF inválido');
        valid = false;
    }

    const cpfResp = extrairDigitos(document.getElementById('inp-cpf-resp').value);
    if (cpfResp && !validateCPF(cpfResp)) {
        setError('cpf-resp', 'CPF inválido');
        valid = false;
    }

    // Email validation
    const email = document.getElementById('inp-email').value.trim();
    if (email && !validateEmail(email)) {
        setError('email', 'E-mail inválido');
        valid = false;
    }

    // Date validation
    const dataNasc = document.getElementById('inp-data-nasc').value.trim();
    if (dataNasc) {
        const parts = dataNasc.split('/');
        if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
            setError('data-nasc', 'Data inválida (dd/mm/aaaa)');
            valid = false;
        } else {
            const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
            const date = new Date(y, m - 1, d);
            if (date.getDate() !== d || date.getMonth() !== m - 1 || date.getFullYear() !== y || date > new Date()) {
                setError('data-nasc', 'Data inválida ou futura');
                valid = false;
            }
        }
    }

    // Modalidades
    const selected = getSelectedModalidades();
    if (selected.length === 0) {
        document.getElementById('err-modalidades').textContent = 'Selecione pelo menos uma modalidade';
        valid = false;
    }

    // Aceite
    if (!document.getElementById('inp-aceite').checked) {
        setError('aceite', 'É necessário aceitar os termos');
        valid = false;
    }

    return valid;
}

// ==================== HELPERS ====================
function getSelectedModalidades() {
    const checkboxes = document.querySelectorAll('.checkbox-grid input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function calculateAge(dataNascimento) {
    if (!dataNascimento) return 0;
    const parts = dataNascimento.split('/');
    if (parts.length !== 3) return 0;
    const nasc = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    const now = new Date();
    let age = now.getFullYear() - nasc.getFullYear();
    const m = now.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < nasc.getDate())) age--;
    return age;
}

function calculateCategory(dataNascimento) {
    if (!dataNascimento) return 'Outros';
    const parts = dataNascimento.split('/');
    if (parts.length !== 3) return 'Outros';
    const nascYear = parseInt(parts[2]);
    const nowYear = new Date().getFullYear();
    const ageTurning = nowYear - nascYear;
    const categoryNum = ageTurning | 1; // make odd
    if (categoryNum < 7) return 'Sub 7';
    if (categoryNum > 15) return 'Outros';
    return `Sub ${categoryNum}`;
}

function generateProtocol() {
    // UUIDv4 (36 chars) para satisfazer a RLS policy anon_insert_cadastros_pendentes
    // (length(protocolo) = 36). crypto.randomUUID() é nativo em navegadores
    // modernos (Chrome 92+, Firefox 95+, Safari 15.4+).
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback para contextos sem crypto.randomUUID (raríssimo em browser).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

// ==================== FILE UPLOAD ====================
async function uploadFileToStorage(file, folder) {
    if (!file) return null;

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${folder}/${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2)}.${ext}`;

        const { data, error } = await supabaseClient.storage
            .from('arquivos')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Upload error:', error);
            return null;
        }

        const { data: urlData } = supabaseClient.storage
            .from('arquivos')
            .getPublicUrl(data.path);

        return urlData.publicUrl;
    } catch (err) {
        console.error('Upload exception:', err);
        return null;
    }
}

// ==================== FORM SUBMIT ====================
async function enviarPreCadastro() {
    if (!validateForm()) {
        showToast('Corrija os campos destacados em vermelho.', 'error');
        // Scroll to first error
        const firstError = document.querySelector('.input-error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    showLoading(true);

    try {
        // Upload files
        const [fotoUrl, docAlunoUrl, docRespUrl] = await Promise.all([
            uploadFileToStorage(fotoFile, 'fotos'),
            uploadFileToStorage(docAlunoFile, 'documentos'),
            uploadFileToStorage(docRespFile, 'documentos')
        ]);

        const dataNasc = getVal('inp-data-nasc');
        const idade = calculateAge(dataNasc);
        const categoria = calculateCategory(dataNasc);
        const protocolo = generateProtocol();

        const endereco = [
            getVal('inp-rua'),
            getVal('inp-numero') ? ', ' + getVal('inp-numero') : '',
            getVal('inp-bairro') ? ' - ' + getVal('inp-bairro') : '',
            getVal('inp-cidade') ? ', ' + getVal('inp-cidade') : '',
            getVal('inp-cep') ? ' - ' + getVal('inp-cep') : ''
        ].join('').replace(/^[\s,-]+/, '');

        const infoSaude = document.getElementById('inp-tem-saude').checked
            ? getVal('inp-info-saude')
            : '';

        const payload = {
            nome: getVal('inp-nome'),
            rg: getVal('inp-rg-atleta'),
            cpf: extrairDigitos(getVal('inp-cpf-atleta')),
            data_nascimento: dataNasc,
            idade: idade,
            categoria: categoria,
            endereco: endereco,
            nome_responsavel: getVal('inp-nome-resp'),
            parentesco: getVal('inp-parentesco'),
            cpf_responsavel: extrairDigitos(getVal('inp-cpf-resp')),
            email: getVal('inp-email'),
            telefone: getVal('inp-telefone'),
            problema_saude: infoSaude,
            modalidades: getSelectedModalidades().join(', '),
            periodo: getVal('inp-periodo'),
            status_pendente: 'pendente',
            protocolo: protocolo,
            data_envio: new Date().toLocaleDateString('pt-BR'),
            foto_url: fotoUrl,
            doc_aluno_url: docAlunoUrl,
            doc_resp_url: docRespUrl
        };

        const { error } = await supabaseClient
            .from('cadastros_pendentes')
            .insert(payload);

        if (error) {
            console.error('Insert error:', error);
            showToast('Erro ao enviar o pré-cadastro. Tente novamente.', 'error');
            showLoading(false);
            return;
        }

        showLoading(false);
        limparFormulario();
        document.getElementById('protocolo-number').textContent = protocolo;
        document.getElementById('modal-sucesso').classList.add('active');

    } catch (err) {
        console.error('Submit exception:', err);
        showToast('Erro inesperado. Verifique sua conexão e tente novamente.', 'error');
        showLoading(false);
    }
}

// ==================== FORM RESET ====================
function limparFormulario() {
    const form = document.getElementById('form-precadastro');
    form.reset();
    clearErrors();

    fotoFile = null;
    docAlunoFile = null;
    docRespFile = null;

    // Reset photo preview
    document.getElementById('photo-preview').innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        <span class="photo-placeholder-text">Clique para selecionar</span>
    `;
    document.getElementById('foto-file-name').textContent = '';

    // Reset doc cards
    document.getElementById('doc-aluno-status').textContent = 'Nenhum arquivo selecionado';
    document.getElementById('doc-resp-status').textContent = 'Nenhum arquivo selecionado';
    document.getElementById('doc-aluno-card').classList.remove('has-file');
    document.getElementById('doc-resp-card').classList.remove('has-file');

    // Reset saude
    document.getElementById('saude-details').style.display = 'none';
    document.getElementById('toggle-saude-text').textContent = 'Não';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== MODAL SUCESSO ====================
function fecharModal() {
    document.getElementById('modal-sucesso').classList.remove('active');
}

function novoCadastro() {
    fecharModal();
    limparFormulario();
}

// ==================== CONSULTA / MODAL ESTADO ====================
//
// A Edge Function ``validar-atleta`` (action: ``consultar``) classifica
// cada par (cpf_atleta, cpf_responsavel) em um dos 4 estados abaixo.
// Mantemos os nomes em uma constante para evitar typos nos ``if`` e
// facilitar a inspeção visual nos testes.
//
//   NOVO        → atleta não cadastrado: libera form vazio.
//   COMPLETO    → ficha já está completa: bloqueia form.
//   INCOMPLETO  → ficha cadastrada mas incompleta: libera form
//                 pré-preenchido para atualização.
//   PENDENTE    → já existe solicitação de atualização em análise:
//                 bloqueia form.

const ESTADOS = Object.freeze({
    NOVO: 'novo',
    COMPLETO: 'completo',
    INCOMPLETO: 'incompleto',
    PENDENTE: 'pendente',
});

// Guarda o último payload retornado pela Edge Function para que o form
// possa ser pré-preenchido caso o usuário opte por atualizar.
const consultaState = {
    cpfAtleta: '',
    cpfResponsavel: '',
    estado: null,
    atleta: null,        // dados do atleta existente (se houver)
    pendencias: [],      // pendências retornadas pela Edge Function
};

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function verificarCadastro() {
    const cpfAtletaEl = document.getElementById('inp-consulta-cpf-atleta');
    const cpfRespEl = document.getElementById('inp-consulta-cpf-resp');

    clearErrors();

    const cpfAtleta = extrairDigitos(cpfAtletaEl.value);
    const cpfResp = extrairDigitos(cpfRespEl.value);

    let hasError = false;
    if (!cpfAtleta || !validateCPF(cpfAtleta)) {
        setError('consulta-cpf-atleta', 'Informe um CPF válido para o atleta');
        hasError = true;
    }
    if (!cpfResp || !validateCPF(cpfResp)) {
        setError('consulta-cpf-resp', 'Informe um CPF válido para o responsável');
        hasError = true;
    }
    if (hasError) return;

    const btn = document.getElementById('btn-verificar');
    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const response = await fetch(ENDPOINT_VALIDAR_ATLETA, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'consultar', cpf: cpfAtleta, cpf_responsavel: cpfResp }),
        });
        let data;
        try {
            data = await response.json();
        } catch (_) {
            // Resposta não-JSON é uma falha de parse do servidor, não um bug do cliente.
            console.warn('validar-atleta: resposta não-JSON', response.status);
            if (!response.ok) {
                throw { __edge: true, status: response.status, body: { message: 'Resposta inválida do servidor' } };
            }
            throw { __edge: true, status: response.status, body: null };
        }
        if (!response.ok) {
            throw { __edge: true, status: response.status, body: data };
        }

        // A Edge Function sempre responde com o envelope
        // ``{success: true, data: {...}}`` para 2xx (e
        // ``{success: false, code, message}`` para erros — esses
        // entram no ``!response.ok`` acima e nunca chegam aqui).
        // Desembrulhamos o envelope para que ``data.encontrado``,
        // ``data.status``, ``data.atleta`` etc. reflitam o payload
        // público da função. Sem isso, ``data.encontrado`` é
        // ``undefined`` e o modal cai em ESTADOS.NOVO ("atleta não
        // cadastrado") mesmo para CPFs que existem na base —
        // regressão observada em 2026-07-27 no portal-nec-inec.site
        // (Davi Costa Gomes Machado, id=78).
        data = data?.data ?? data;

        // ``encontrado`` indica se o atleta já existe; ``status``
        // classifica a ficha em "completo" | "incompleto" | null;
        // ``pendencias`` é uma lista de strings (não objetos) com
        // mensagens de pendência.
        consultaState.cpfAtleta = cpfAtleta;
        consultaState.cpfResponsavel = cpfResp;
        consultaState.atleta = (data && data.atleta) || null;
        consultaState.pendencias = (data && data.pendencias) || [];

        let estado;
        if (data && data.encontrado === false) {
            estado = ESTADOS.NOVO;
        } else if (data && data.encontrado === true) {
            const ficha = data.status; // "completo" | "incompleto" | null
            const temPendencia =
                consultaState.pendencias.length > 0 &&
                consultaState.pendencias.some(
                    (p) => typeof p === 'string' && /pendente/i.test(p)
                );
            if (temPendencia) {
                estado = ESTADOS.PENDENTE;
            } else if (ficha === 'completo') {
                estado = ESTADOS.COMPLETO;
            } else {
                estado = ESTADOS.INCOMPLETO;
            }
        } else {
            // Resposta fora do contrato — trata como novo para não
            // bloquear o usuário.
            estado = ESTADOS.NOVO;
        }

        consultaState.estado = estado;
        ModalConsulta.show(estado, data || {});
    } catch (e) {
        if (e && e.__edge) {
            // A Edge Function retornou não-2xx ou uma resposta não-JSON.
            let mensagem = 'Não foi possível verificar o cadastro agora. Tente novamente em instantes.';
            if (e.body && typeof e.body.message === 'string') {
                mensagem = e.body.message;
            }
            console.warn('validar-atleta: edge error', e.status, mensagem);
            showToast(mensagem, 'error');
        } else {
            // Falha de rede: fetch rejeitou antes de receber uma resposta.
            console.error('verificarCadastro connection failure:', e);
            showToast('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        }
        return;
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

function abrirFormulario() {
    // Esconde o card de consulta e mostra o form principal. Se
    // houver dados de atleta existente (INCOMPLETO), pré-preenche
    // os campos relevantes.
    const consulta = document.getElementById('consulta-card');
    const form = document.getElementById('form-precadastro');
    if (consulta) consulta.style.display = 'none';
    if (form) {
        form.style.display = 'block';
        window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
    }

    if (consultaState.estado === ESTADOS.INCOMPLETO && consultaState.atleta) {
        prePreencherFormulario(consultaState.atleta);
    }
}

function prePreencherFormulario(atleta) {
    // Mapeia os campos editáveis retornados pela Edge Function
    // ``validar-atleta`` para os inputs do formulário. Apenas
    // preenche se o campo existir e estiver vazio — não sobrescreve
    // dados digitados manualmente. Campos que a Edge retornou
    // vazios ficam com classe ``.needs-fill`` para o usuário ver
    // rapidamente o que ainda precisa preencher.
    //
    // CPFs do atleta e do responsável SÃO pré-preenchidos (para o
    // usuário ver qual cadastro está editando), mas marcados como
    // ``readOnly`` para impedir edição — são chaves de lookup e
    // não podem ser alteradas pelo portal (quebraria o invariante
    // do banco e invalidaria a busca subsequente).
    const campos = {
        // CPFs — readonly, ver nota acima
        'inp-cpf-atleta': atleta.cpf,
        'inp-cpf-resp': atleta.cpf_responsavel,
        // Atleta
        'inp-nome': atleta.nome,
        'inp-data-nasc': atleta.data_nascimento,
        'inp-rg-atleta': atleta.rg,
        // Responsável
        'inp-nome-resp': atleta.nome_responsavel,
        'inp-parentesco': atleta.parentesco,
        'inp-email': atleta.email,
        'inp-telefone': atleta.telefone,
        // Endereço estruturado
        'inp-rua': atleta.rua,
        'inp-numero': atleta.numero,
        'inp-bairro': atleta.bairro,
        'inp-cidade': atleta.cidade,
        'inp-cep': atleta.cep,
        // Período (select) e saúde (textarea)
        'inp-periodo': atleta.periodo,
        'inp-info-saude': atleta.problema_saude,
    };
    const readonlyCpfs = new Set(['inp-cpf-atleta', 'inp-cpf-resp']);
    for (const [id, valor] of Object.entries(campos)) {
        const el = document.getElementById(id);
        if (!el) continue;
        // Não sobrescreve dados que o usuário já tenha digitado
        // manualmente.
        if (el.value.trim()) continue;
        if (valor) {
            el.value = valor;
            el.classList.remove('needs-fill');
        } else {
            // A Edge não retornou valor para este campo — destaca
            // visualmente para o usuário preencher.
            el.classList.add('needs-fill');
        }
        // CPFs ficam readonly após o prefill.
        if (readonlyCpfs.has(id)) {
            el.readOnly = true;
            el.classList.add('readonly');
        }
    }

    // Modalidades: a Edge retorna uma string CSV
    // ("Futebol, Judô"). Marcamos os checkboxes correspondentes.
    // Se a string estiver vazia, ativamos o highlight em todos.
    const modalidadesStr = (atleta.modalidades || '').trim();
    const selecionadas = modalidadesStr
        ? new Set(modalidadesStr.split(',').map(s => s.trim()).filter(Boolean))
        : new Set();
    const checkboxes = document.querySelectorAll('.checkbox-grid input[type="checkbox"]');
    let algumaMarcada = false;
    checkboxes.forEach(cb => {
        const deve = selecionadas.has(cb.value);
        cb.checked = deve;
        if (deve) algumaMarcada = true;
    });
    // Se a Edge não retornou modalidades, marca todas as checkboxes
    // com .needs-fill para o usuário ver que precisa escolher.
    if (!algumaMarcada) {
        checkboxes.forEach(cb => cb.classList.add('needs-fill'));
    } else {
        checkboxes.forEach(cb => cb.classList.remove('needs-fill'));
    }

    // Toggle de "tem problema de saúde": se a Edge retornou
    // ``problema_saude`` não-vazio, marca o checkbox e mostra o
    // textarea. Caso contrário, deixa o toggle off.
    const temSaude = document.getElementById('inp-tem-saude');
    if (temSaude) {
        const temProblema = !!(atleta.problema_saude && atleta.problema_saude.trim());
        temSaude.checked = temProblema;
        // toggleSaude() já existe e ajusta o display do textarea
        // baseado no estado do checkbox.
        if (typeof toggleSaude === 'function') toggleSaude();
    }

    // Preview de arquivos: cria um bloco visual
    // ``.upload-preview`` ao lado de cada file input quando a
    // Edge retornou URL existente (``foto_url``,
    // ``doc_aluno_url``, ``doc_resp_url``). O usuário vê a
    // miniatura/link do arquivo atual e decide se mantém (não
    // re-seleciona nada) ou troca. Sem isso, o usuário pensa que
    // não tem nada e re-envia arquivos duplicados.
    renderUploadPreview('inp-foto', atleta.foto_url, 'Foto atual');
    renderUploadPreview('inp-doc-aluno', atleta.doc_aluno_url, 'Documento do atleta');
    renderUploadPreview('inp-doc-resp', atleta.doc_resp_url, 'Documento do responsável');
}

// Helper: renderiza o preview de um arquivo existente (foto ou
// documento) logo após o file input. Se a URL for vazia, limpa
// qualquer preview anterior. URLs do Supabase Storage têm
// ``/storage/v1/object/public/`` — imagens podem ser mostradas
// inline; PDFs/links abrem em nova aba.
function renderUploadPreview(inputId, url, label) {
    const input = document.getElementById(inputId);
    if (!input) return;
    // Remove preview anterior se existir (idempotente em re-renders).
    const prev = input.parentElement.querySelector('.upload-preview');
    if (prev) prev.remove();
    if (!url) return;
    const isImage = /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url);
    const wrap = document.createElement('div');
    wrap.className = 'upload-preview';
    const labelEl = document.createElement('span');
    labelEl.className = 'upload-preview-label';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
    if (isImage) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = label;
        wrap.appendChild(img);
    }
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = isImage ? 'Ver em tamanho real' : 'Abrir arquivo';
    wrap.appendChild(link);
    // Insere o preview logo após o input.
    if (input.nextSibling) {
        input.parentElement.insertBefore(wrap, input.nextSibling);
    } else {
        input.parentElement.appendChild(wrap);
    }
}

const ModalConsulta = {
    _overlay: null,
    _content: null,

    _ensureRefs() {
        if (!this._overlay) this._overlay = document.getElementById('modal-consulta');
        if (!this._content) this._content = document.getElementById('modal-consulta-content');
    },

    show(estado, payload) {
        this._ensureRefs();
        this._render(estado, payload);
        this._overlay.classList.add('active');
    },

    close() {
        this._ensureRefs();
        this._overlay.classList.remove('active');
    },

    _render(estado, payload) {
        const def = MODAL_DEFS[estado] || MODAL_DEFS[ESTADOS.NOVO];
        // ``mapearAtleta`` retorna o nome canônico ``nome``
        // (com fallback para ``nome_completo`` legado em
        // ``cadastros_pendentes``). O modal exibe esse nome para o
        // usuário confirmar que é a pessoa certa antes de
        // prosseguir com atualização.
        const atletaNome = payload.atleta && payload.atleta.nome
            ? payload.atleta.nome
            : '';

        // Build via safe DOM APIs — nunca usar innerHTML com dados do
        // backend (Edge Function). ``def.iconSvg`` e ``def.buttonsHtml``
        // são literais estáticos deste arquivo; ``atletaNome`` e os
        // textos vão via ``textContent``/setAttribute.
        this._content.replaceChildren();

        const iconWrap = document.createElement('div');
        iconWrap.className = `modal-status-icon ${def.iconClass}`;
        // ``iconSvg`` é literal do autor do arquivo, não entrada do usuário.
        iconWrap.innerHTML = def.iconSvg;

        const title = document.createElement('h2');
        title.className = 'modal-title';
        title.textContent = def.titulo;

        const desc = document.createElement('p');
        desc.className = 'modal-text';
        desc.textContent = def.descricao;

        this._content.append(iconWrap, title, desc);

        if (atletaNome) {
            const detalhe = document.createElement('p');
            detalhe.className = 'modal-text';
            detalhe.append('Atleta: ', document.createElement('strong'));
            detalhe.lastChild.textContent = atletaNome;
            this._content.appendChild(detalhe);
        }

        // Lista de pendências: para ESTADOS.INCOMPLETO, mostra
        // quais campos estão faltando para o usuário decidir se
        // quer ou não atualizar. Sem isso, o modal só diz
        // "Ficha incompleta" sem mostrar O QUE falta.
        if (estado === ESTADOS.INCOMPLETO && Array.isArray(payload.pendencias) && payload.pendencias.length > 0) {
            const pendLabel = document.createElement('p');
            pendLabel.className = 'modal-text modal-pendencias-label';
            pendLabel.textContent = 'Itens que ainda faltam na ficha:';
            this._content.appendChild(pendLabel);

            const ul = document.createElement('ul');
            ul.className = 'modal-pendencias';
            payload.pendencias.forEach((chave) => {
                const li = document.createElement('li');
                // Pega a tradução amigável (ex: 'doc_aluno_url' →
                // 'Documento do atleta'); fallback para a própria
                // chave se não houver mapeamento (defensivo).
                const label = (typeof PENDENCIAS_TRADUZIDAS === 'object' && PENDENCIAS_TRADUZIDAS[chave])
                    || chave;
                li.textContent = label;
                ul.appendChild(li);
            });
            this._content.appendChild(ul);
        }

        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        // ``buttonsHtml`` é literal do autor do arquivo.
        actions.innerHTML = def.buttonsHtml;
        this._content.appendChild(actions);

        if (def.onBind) {
            def.onBind(this, payload);
        }
    },
};

const MODAL_DEFS = {
    [ESTADOS.NOVO]: {
        iconClass: 'icon-info',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        titulo: 'Atleta não cadastrado',
        descricao: 'Não encontramos um cadastro para este CPF. Você pode prosseguir com o formulário de pré-cadastro abaixo.',
        buttonsHtml: '<button class="btn-primary-modal" data-modal-action="prosseguir-novo">Prosseguir com o cadastro</button>',
        onBind(modal) {
            const btn = modal._content.querySelector('[data-modal-action="prosseguir-novo"]');
            if (btn) btn.addEventListener('click', () => {
                modal.close();
                abrirFormulario();
            });
        },
    },
    [ESTADOS.COMPLETO]: {
        iconClass: 'icon-success',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        titulo: 'Cadastro já está completo',
        descricao: 'Este atleta já possui ficha completa no sistema. Não é necessário enviar um novo pré-cadastro. Em caso de dúvida, procure a secretaria.',
        buttonsHtml: '<button class="btn-outline-modal" data-modal-action="fechar">Fechar</button>',
        onBind(modal) {
            const btn = modal._content.querySelector('[data-modal-action="fechar"]');
            if (btn) btn.addEventListener('click', () => modal.close());
        },
    },
    [ESTADOS.INCOMPLETO]: {
        iconClass: 'icon-warning',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        titulo: 'Ficha incompleta — deseja atualizar?',
        descricao: 'Encontramos um cadastro deste atleta, mas a ficha ainda está incompleta. Você pode atualizar os dados complementando o formulário abaixo.',
        buttonsHtml: `
            <button class="btn-outline-modal" data-modal-action="fechar">Agora não</button>
            <button class="btn-primary-modal" data-modal-action="prosseguir-incompleto">Atualizar cadastro</button>
        `,
        onBind(modal) {
            const btnFechar = modal._content.querySelector('[data-modal-action="fechar"]');
            const btnProsseguir = modal._content.querySelector('[data-modal-action="prosseguir-incompleto"]');
            if (btnFechar) btnFechar.addEventListener('click', () => modal.close());
            if (btnProsseguir) btnProsseguir.addEventListener('click', () => {
                modal.close();
                abrirFormulario();
            });
        },
    },
    [ESTADOS.PENDENTE]: {
        iconClass: 'icon-warning',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        titulo: 'Solicitação já em análise',
        descricao: 'Já existe uma solicitação de atualização para este atleta em análise pela equipe. Aguarde a conclusão antes de enviar uma nova.',
        buttonsHtml: '<button class="btn-outline-modal" data-modal-action="fechar">Fechar</button>',
        onBind(modal) {
            const btn = modal._content.querySelector('[data-modal-action="fechar"]');
            if (btn) btn.addEventListener('click', () => modal.close());
        },
    },
};

// ==================== LOADING & TOAST ====================
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
}
