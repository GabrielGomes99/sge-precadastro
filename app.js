// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://yoqjelcixpbygwifwirm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvcWplbGNpeHBieWd3aWZ3aXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzUwMzIsImV4cCI6MjA4NzcxMTAzMn0.9pHR-q6MVNp2EPckhnpb7hkBHB2t8vhF1c9WUvBiR-s';
const ENDPOINT_VALIDAR_ATLETA = `${SUPABASE_URL}/functions/v1/validar-atleta`;

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== CONSTANTS ====================
const MODALIDADES_INEC = ['Futebol'];
const MODALIDADES_NEC = ['Futsal', 'Basquete', 'Vôlei', 'Judô', 'Jiu-Jitsu', 'Handebol', 'Tênis de Mesa', 'Balé & Dança', 'X1'];

// Tipo de pré-cadastro em andamento ('atleta' | 'instrutor'). Setado
// pelo modal inicial ``#modal-selecao-tipo`` e lido por ``novoCadastro``
// para decidir qual form deve ser limpo após o envio. Mantido aqui
// (no topo) para ficar disponível antes de qualquer função que o
// referencie.
let tipoCadastro = null;

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
    // Chaves do instrutor (a Edge ``validar-atleta`` emite a mesma
    // nomenclatura, independente do tipo — ver Edge Function).
    funcao: 'Função / Cargo do instrutor',
    doc_instrutor_url: 'Documento de identidade do instrutor',
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
    initModalSelecaoTipo();
    initInputMasksInstrutor();
    initCarteirinhaMasks();
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
    'Futebol': '⚽', 'Futsal': '⚽', 'Basquete': '🏀', 'Vôlei': '🏐',
    'Judô': '🥋', 'Jiu-Jitsu': '🥋', 'Handebol': '🤾', 'Handball': '🤾',
    'Tênis de Mesa': '🏓', 'Balé & Dança': '🩰', 'Balé': '🩰', 'X1': '🏆',
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

    // Foto é obrigatória, exceto quando o atleta já tem foto_url
    // carregada via ``renderUploadPreview`` (fluxo de atualização:
    // o usuário pode manter a foto atual sem re-upload).
    const fotoInput = document.getElementById('inp-foto');
    const hasExistingPhoto = fotoInput && fotoInput.parentElement.querySelector('.upload-preview');
    if (!fotoFile && !hasExistingPhoto) {
        const errEl = document.getElementById('err-foto');
        if (errEl) errEl.textContent = 'Selecione a foto do atleta';
        valid = false;
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
            tipo: 'atleta',
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
        const badgeSucesso = document.getElementById('badge-tipo-sucesso');
        if (badgeSucesso) {
            badgeSucesso.dataset.tipo = tipoCadastro || 'atleta';
            badgeSucesso.textContent = tipoCadastro === 'instrutor' ? 'INSTRUTOR' : 'ATLETA';
        }
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
    // Volta o usuário ao seletor de tipo para que o próximo
    // cadastro seja escolhido conscientemente (atleta ou instrutor).
    resetarParaSelecaoTipo();
}

function novoCadastro() {
    fecharModal();
    if (tipoCadastro === 'instrutor') limparFormularioInstrutor();
    else limparFormulario();
}

// ==================== SELEÇÃO DE TIPO (ATLETA / INSTRUTOR) ====================
//
// Variável global ``tipoCadastro`` controla qual form é renderizado
// (``#form-precadastro`` ou ``#form-instrutor``) e qual pipeline de
// envio/validação roda. É setada pelo modal inicial. Toda a UI
// abaixo do header fica oculta até o usuário escolher um tipo.
//
// Declarada no topo do arquivo (antes de ``novoCadastro`` que a
// referencia) para evitar TDZ em engines que validam escopo léxico.
function initModalSelecaoTipo() {
    const overlay = document.getElementById('modal-selecao-tipo');
    if (!overlay) return;

    const cards = overlay.querySelectorAll('.tipo-card');
    const btnContinuar = document.getElementById('btn-continuar-tipo');

    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.setAttribute('aria-pressed', 'false'));
            card.setAttribute('aria-pressed', 'true');
            if (btnContinuar) btnContinuar.disabled = false;
        });
    });

    if (btnContinuar) {
        btnContinuar.addEventListener('click', () => {
            const selected = overlay.querySelector('.tipo-card[aria-pressed="true"]');
            if (!selected) return;
            const tipo = selected.dataset.tipo;
            confirmarSelecaoTipo(tipo);
        });
    }
}

function confirmarSelecaoTipo(tipo) {
    tipoCadastro = tipo;
    const overlay = document.getElementById('modal-selecao-tipo');
    if (overlay) overlay.classList.add('hidden');

    const formAtleta = document.getElementById('form-precadastro');
    const formInstr = document.getElementById('form-instrutor');
    const consulta = document.getElementById('consulta-card');
    const secaoCarteirinha = document.getElementById('secao-carteirinha');

    if (tipo === 'instrutor') {
        if (formAtleta) formAtleta.style.display = 'none';
        if (secaoCarteirinha) secaoCarteirinha.style.display = 'none';
        if (consulta) consulta.style.display = 'none';
        abrirFormularioInstrutor();
    } else if (tipo === 'carteirinha') {
        if (formAtleta) formAtleta.style.display = 'none';
        if (formInstr) formInstr.style.display = 'none';
        if (consulta) consulta.style.display = 'none';
        if (secaoCarteirinha) {
            secaoCarteirinha.style.display = '';
            secaoCarteirinha.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const inp = document.getElementById('inp-carteirinha-cpf');
            if (inp) inp.focus();
        }
    } else {
        // Atleta: oculta o formulário de instrutor e a carteirinha
        if (formInstr) formInstr.style.display = 'none';
        if (secaoCarteirinha) secaoCarteirinha.style.display = 'none';

        // Se o formulário do atleta já estiver aberto e preenchido, mantém-no;
        // caso contrário, garante que o card de consulta esteja visível.
        if (formAtleta && formAtleta.style.display === 'block') {
            if (consulta) consulta.style.display = 'none';
            formAtleta.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            if (formAtleta) formAtleta.style.display = 'none';
            if (consulta) {
                consulta.style.display = '';
                consulta.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
}

function resetarParaSelecaoTipo() {
    tipoCadastro = null;
    const overlay = document.getElementById('modal-selecao-tipo');
    if (overlay) {
        overlay.classList.remove('hidden');
        const cards = overlay.querySelectorAll('.tipo-card');
        cards.forEach(c => c.setAttribute('aria-pressed', 'false'));
        const btn = document.getElementById('btn-continuar-tipo');
        if (btn) btn.disabled = true;
    }

    const formAtleta = document.getElementById('form-precadastro');
    if (formAtleta) formAtleta.style.display = 'none';
    const formInstr = document.getElementById('form-instrutor');
    if (formInstr) formInstr.style.display = 'none';
    const secaoCarteirinha = document.getElementById('secao-carteirinha');
    if (secaoCarteirinha) secaoCarteirinha.style.display = 'none';
    const consulta = document.getElementById('consulta-card');
    if (consulta) consulta.style.display = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    DIVERGENTE: 'divergente',
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
        if (data && data.responsavel_divergente) {
            estado = ESTADOS.DIVERGENTE;
        } else if (data && data.encontrado === false) {
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
    const formInstr = document.getElementById('form-instrutor');
    if (consulta) consulta.style.display = 'none';
    if (formInstr) formInstr.style.display = 'none';
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
    [ESTADOS.DIVERGENTE]: {
        iconClass: 'icon-warning',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        titulo: 'CPF do Responsável Divergente',
        descricao: 'Este atleta já possui cadastro no sistema, porém o CPF do responsável informado não confere com o cadastrado. Por favor, confira o número digitado ou procure a secretaria.',
        buttonsHtml: '<button class="btn-primary-modal" data-modal-action="corrigir-cpf">Verificar CPF do Responsável</button>',
        onBind(modal) {
            const btn = modal._content.querySelector('[data-modal-action="corrigir-cpf"]');
            if (btn) btn.addEventListener('click', () => {
                modal.close();
                const el = document.getElementById('inp-consulta-cpf-resp');
                if (el) {
                    el.focus();
                    el.select();
                }
            });
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

// ==================== WHATSAPP POPUP ====================
function toggleWhatsappPopup(open) {
    const overlay = document.getElementById('whatsapp-overlay');
    const popup = document.getElementById('whatsapp-popup');
    if (!overlay || !popup) return;
    if (open) {
        overlay.classList.add('is-open');
        popup.classList.add('is-open');
        popup.setAttribute('aria-hidden', 'false');
    } else {
        overlay.classList.remove('is-open');
        popup.classList.remove('is-open');
        popup.setAttribute('aria-hidden', 'true');
    }
}

// ==================== NAVBAR FILE-TREE DROPDOWNS & MOBILE DRAWER ====================
function toggleNavDropdown(menuId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const targetMenu = document.getElementById(`menu-dropdown-${menuId}`);
    const targetBtn = document.getElementById(`btn-dropdown-${menuId}`);
    if (!targetMenu) return;

    const isOpen = !targetMenu.classList.contains('hidden');

    // Fecha todos os dropdowns abertos antes de alternar o selecionado
    fecharTodosDropdowns();

    if (!isOpen) {
        targetMenu.classList.remove('hidden');
        if (targetBtn) {
            targetBtn.setAttribute('aria-expanded', 'true');
            targetBtn.classList.add('nav-dropdown-active');
            const chevron = targetBtn.querySelector('.nav-chevron');
            if (chevron) chevron.classList.add('rotate-180');
        }
    }
}

function fecharTodosDropdowns() {
    document.querySelectorAll('.nav-dropdown-menu').forEach(menu => menu.classList.add('hidden'));
    document.querySelectorAll('.nav-dropdown-trigger').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('nav-dropdown-active');
        const chevron = btn.querySelector('.nav-chevron');
        if (chevron) chevron.classList.remove('rotate-180');
    });
}

function selecionarSubMenu(tipo) {
    fecharTodosDropdowns();
    confirmarSelecaoTipo(tipo);
}

function toggleMobileAccordion(tipo) {
    const sub = document.getElementById(`sub-mobile-tree-${tipo}`);
    const btn = document.getElementById(`btn-mobile-tree-${tipo}`);
    if (!sub) return;

    const isClosed = sub.classList.contains('hidden');
    if (isClosed) {
        sub.classList.remove('hidden');
        if (btn) {
            const chevron = btn.querySelector('.mobile-tree-chevron');
            if (chevron) chevron.classList.add('rotate-180');
        }
    } else {
        sub.classList.add('hidden');
        if (btn) {
            const chevron = btn.querySelector('.mobile-tree-chevron');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }
}

// Fecha dropdowns da navbar ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown-root')) {
        fecharTodosDropdowns();
    }
});

// ==================== MOBILE NAVIGATION DRAWER (SIDEBAR) ====================
function toggleMobileSidebar(open) {
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const drawer = document.getElementById('mobile-sidebar');
    if (!overlay || !drawer) return;
    if (open) {
        overlay.classList.add('is-open');
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    } else {
        overlay.classList.remove('is-open');
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

function navegarMobile(tipo) {
    toggleMobileSidebar(false);
    if (tipo === 'inicio') {
        resetarParaSelecaoTipo();
    } else {
        confirmarSelecaoTipo(tipo);
    }
}

// Fecha popups, dropdowns e gaveta móvel com a tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharTodosDropdowns();
        toggleWhatsappPopup(false);
        toggleMobileSidebar(false);
    }
});

// ==================== INSTRUTOR (PIPELINE COMPLETO) ====================
//
// Estado local de arquivos do form-instrutor. Mantido em variáveis
// separadas para não colidir com ``fotoFile`` / ``docAlunoFile`` /
// ``docRespFile`` usados pelo atleta.
let fotoFileInstr = null;
let docInstrFile = null;

function initInputMasksInstrutor() {
    // Mesmas máscaras do atleta. IDs diferentes, comportamento igual.
    const pairs = [
        ['inp-cpf-instr', maskCPF],
        ['inp-rg-instr', maskRG],
        ['inp-telefone-instr', maskPhone],
        ['inp-data-nasc-instr', maskDate],
        ['inp-cep-instr', maskCEP],
    ];
    for (const [id, fn] of pairs) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('input', (e) => {
            const pos = el.selectionStart;
            const oldLen = el.value.length;
            el.value = fn(el.value);
            const newLen = el.value.length;
            el.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
        });
    }
}

function handlePhotoSelectInstr(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        showToast('A foto deve ter no máximo 5MB.', 'error');
        input.value = '';
        return;
    }
    fotoFileInstr = file;
    document.getElementById('foto-file-name-instr').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('photo-preview-instr').innerHTML =
            `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

function handleDocSelectInstr(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
        showToast('O documento deve ter no máximo 10MB.', 'error');
        input.value = '';
        return;
    }
    docInstrFile = file;
    document.getElementById('doc-instr-status').textContent = file.name;
    document.getElementById('doc-instr-card').classList.add('has-file');
}

// Regex para Função/Cargo: letras (com acentos) e espaços, hífen,
// barra e "de/da/do". Não aceita números nem símbolos estranhos.
function validateFuncao(value) {
    if (!value) return false;
    const trimmed = value.trim();
    if (trimmed.length < 3 || trimmed.length > 80) return false;
    return /^[A-Za-zÀ-ÿ\s\-\/]+$/.test(trimmed);
}

function validateFormInstrutor() {
    clearErrors();
    let valid = true;

    function requireField(inputId, errId, label) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        const val = inp.value.trim();
        if (!val) {
            setError(errId, `${label} é obrigatório`);
            valid = false;
        }
    }

    requireField('inp-nome-instr', 'nome-instr', 'Nome completo');

    const cpfDigits = extrairDigitos(document.getElementById('inp-cpf-instr').value);
    if (!cpfDigits) {
        setError('cpf-instr', 'CPF é obrigatório');
        valid = false;
    } else if (!validateCPF(cpfDigits)) {
        setError('cpf-instr', 'CPF inválido');
        valid = false;
    }

    requireField('inp-data-nasc-instr', 'data-nasc-instr', 'Data de nascimento');
    requireField('inp-funcao', 'funcao', 'Função / Cargo');
    requireField('inp-periodo-instr', 'periodo-instr', 'Período');
    requireField('inp-nucleo-instr', 'nucleo-instr', 'Núcleo');
    requireField('inp-email-instr', 'email-instr', 'E-mail');
    requireField('inp-telefone-instr', 'telefone-instr', 'Telefone');
    requireField('inp-rua-instr', 'rua-instr', 'Rua');
    requireField('inp-numero-instr', 'numero-instr', 'Número');
    requireField('inp-bairro-instr', 'bairro-instr', 'Bairro');
    requireField('inp-cidade-instr', 'cidade-instr', 'Cidade');
    requireField('inp-cep-instr', 'cep-instr', 'CEP');

    // Validação específica do e-mail
    const email = document.getElementById('inp-email-instr').value.trim();
    if (email && !validateEmail(email)) {
        setError('email-instr', 'E-mail inválido');
        valid = false;
    }

    // Validação específica de função (regex)
    const funcao = document.getElementById('inp-funcao').value.trim();
    if (funcao && !validateFuncao(funcao)) {
        setError('funcao', 'Use apenas letras e espaços (3 a 80 caracteres)');
        valid = false;
    }

    // Data de nascimento: mesmo formato dd/mm/aaaa do atleta
    const dataNasc = document.getElementById('inp-data-nasc-instr').value.trim();
    if (dataNasc) {
        const parts = dataNasc.split('/');
        if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
            setError('data-nasc-instr', 'Data inválida (dd/mm/aaaa)');
            valid = false;
        } else {
            const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
            const date = new Date(y, m - 1, d);
            if (date.getDate() !== d || date.getMonth() !== m - 1 || date.getFullYear() !== y || date > new Date()) {
                setError('data-nasc-instr', 'Data inválida ou futura');
                valid = false;
            }
        }
    }

    // Foto obrigatória
    if (!fotoFileInstr) {
        const errEl = document.getElementById('err-foto-instr');
        if (errEl) errEl.textContent = 'Selecione a foto do instrutor';
        valid = false;
    }

    // Aceite
    if (!document.getElementById('inp-aceite-instr').checked) {
        setError('aceite-instr', 'É necessário aceitar os termos');
        valid = false;
    }

    return valid;
}

async function enviarPreCadastroInstrutor() {
    if (!validateFormInstrutor()) {
        showToast('Corrija os campos destacados em vermelho.', 'error');
        const firstError = document.querySelector('.input-error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    showLoading(true);

    try {
        const [fotoUrl, docUrl] = await Promise.all([
            uploadFileToStorage(fotoFileInstr, 'instrutores/fotos'),
            uploadFileToStorage(docInstrFile, 'instrutores/documentos'),
        ]);

        const dataNasc = getVal('inp-data-nasc-instr');
        const idade = calculateAge(dataNasc);
        const protocolo = generateProtocol();

        const endereco = [
            getVal('inp-rua-instr'),
            getVal('inp-numero-instr'),
            getVal('inp-bairro-instr'),
            getVal('inp-cidade-instr'),
            getVal('inp-cep-instr'),
        ].filter(Boolean).join(', ');

        const dataEnvio = new Date().toLocaleDateString('pt-BR');

        const payload = {
            tipo: 'instrutor',
            nome: getVal('inp-nome-instr'),
            cpf: extrairDigitos(getVal('inp-cpf-instr')),
            rg: getVal('inp-rg-instr'),
            data_nascimento: dataNasc,
            idade,
            categoria: 'Instrutor',
            // ``funcao`` no form mapeia para ``formacao`` no banco
            // (a Edge e o ``mapearInstrutor`` mantêm o alias).
            formacao: getVal('inp-funcao'),
            periodo: getVal('inp-periodo-instr'),
            nucleo: getVal('inp-nucleo-instr'),
            email: getVal('inp-email-instr'),
            telefone: getVal('inp-telefone-instr'),
            endereco,
            status_pendente: 'pendente',
            protocolo,
            data_envio: dataEnvio,
            foto_url: fotoUrl,
            doc_instrutor_url: docUrl,
        };

        const { error } = await supabaseClient
            .from('cadastros_pendentes')
            .insert(payload);

        if (error) throw error;

        document.getElementById('protocolo-number').textContent = protocolo;
        const badgeSucesso = document.getElementById('badge-tipo-sucesso');
        if (badgeSucesso) {
            badgeSucesso.dataset.tipo = 'instrutor';
            badgeSucesso.textContent = 'INSTRUTOR';
        }
        document.getElementById('modal-sucesso').classList.add('active');

    } catch (err) {
        console.error('Erro ao enviar pré-cadastro de instrutor:', err);
        showToast('Erro ao enviar pré-cadastro. Tente novamente.', 'error');
    } finally {
        showLoading(false);
    }
}

function abrirFormularioInstrutor() {
    // Sem pré-consulta para instrutor: mostra o form direto.
    const form = document.getElementById('form-instrutor');
    const formAtleta = document.getElementById('form-precadastro');
    const consulta = document.getElementById('consulta-card');
    if (formAtleta) formAtleta.style.display = 'none';
    if (consulta) consulta.style.display = 'none';
    if (form) {
        form.style.display = '';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function limparFormularioInstrutor() {
    const form = document.getElementById('form-instrutor');
    if (form) form.reset();
    clearErrors();

    fotoFileInstr = null;
    docInstrFile = null;

    const preview = document.getElementById('photo-preview-instr');
    if (preview) {
        preview.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span class="photo-placeholder-text">Clique para selecionar</span>
        `;
    }
    const fileName = document.getElementById('foto-file-name-instr');
    if (fileName) fileName.textContent = '';
    const docStatus = document.getElementById('doc-instr-status');
    if (docStatus) docStatus.textContent = 'Nenhum arquivo selecionado';
    const docCard = document.getElementById('doc-instr-card');
    if (docCard) docCard.classList.remove('has-file');
}

// ==================== CARTEIRINHA DIGITAL (CR80 & PERSONALIZAÇÃO) ====================

let atletaCarteirinhaAtual = null;
let fotoAtletaDataUrl = null;

function initCarteirinhaMasks() {
    const inp = document.getElementById('inp-carteirinha-cpf');
    if (!inp) return;

    inp.addEventListener('input', () => {
        const pos = inp.selectionStart;
        const oldLen = inp.value.length;
        inp.value = maskCPF(inp.value);
        const newLen = inp.value.length;
        const newPos = pos + (newLen - oldLen);
        inp.setSelectionRange(newPos, newPos);
    });

    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            consultarCarteirinha();
        }
    });
}

function limparBuscaCarteirinha() {
    const inp = document.getElementById('inp-carteirinha-cpf');
    if (inp) inp.value = '';
    const err = document.getElementById('err-carteirinha-cpf');
    if (err) err.textContent = '';
    const previewArea = document.getElementById('carteirinha-preview-area');
    if (previewArea) previewArea.style.display = 'none';
    atletaCarteirinhaAtual = null;
    fotoAtletaDataUrl = null;
}

function formatarDataNascimentoBR(val) {
    if (!val) return 'Não informado';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [y, m, d] = val.split('-');
        return `${d}/${m}/${y}`;
    }
    return val;
}

async function carregarImagemComoDataUrl(url) {
    if (!url) return null;
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return url;
        const blob = await resp.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(url);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Fallback para URL remota da foto:', e);
        return url;
    }
}

async function consultarCarteirinha() {
    const inp = document.getElementById('inp-carteirinha-cpf');
    const errEl = document.getElementById('err-carteirinha-cpf');
    if (errEl) errEl.textContent = '';

    const cpfDigits = extrairDigitos(inp ? inp.value : '');
    if (!cpfDigits) {
        if (errEl) errEl.textContent = 'Informe o CPF do atleta';
        return;
    }
    if (!validateCPF(cpfDigits)) {
        if (errEl) errEl.textContent = 'CPF inválido';
        return;
    }

    const btn = document.getElementById('btn-buscar-carteirinha');
    if (btn) btn.disabled = true;
    showLoading(true);

    try {
        const response = await fetch(ENDPOINT_VALIDAR_ATLETA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: 'carteirinha',
                cpf: cpfDigits
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Erro na consulta do atleta');
        }

        const data = result.data;
        if (!data || !data.encontrado || !data.atleta) {
            if (errEl) {
                errEl.textContent = 'Nenhum cadastro de atleta encontrado com este CPF no INEC/NEC.';
            }
            showToast('Atleta não encontrado. Verifique o CPF ou realize o pré-cadastro.', 'warning');
            return;
        }

        atletaCarteirinhaAtual = data.atleta;

        // Pré-carrega a foto em Data URL para o canvas do PDF não falhar
        if (atletaCarteirinhaAtual.foto_url) {
            fotoAtletaDataUrl = await carregarImagemComoDataUrl(atletaCarteirinhaAtual.foto_url);
        } else {
            fotoAtletaDataUrl = null;
        }

        // Popula o banner no modal de personalização
        const miniNome = document.getElementById('personalizar-mini-nome');
        if (miniNome) miniNome.textContent = atletaCarteirinhaAtual.nome || 'Atleta';

        const miniDetalhes = document.getElementById('personalizar-mini-detalhes');
        if (miniDetalhes) {
            const cat = atletaCarteirinhaAtual.categoria || 'Categoria Geral';
            const mod = atletaCarteirinhaAtual.modalidades || 'Geral';
            const pol = atletaCarteirinhaAtual.nucleo || 'INEC';
            miniDetalhes.textContent = `${cat} • ${mod} • Polo ${pol}`;
        }

        const miniFoto = document.getElementById('personalizar-mini-foto');
        if (miniFoto) {
            if (fotoAtletaDataUrl) {
                miniFoto.innerHTML = `<img src="${fotoAtletaDataUrl}" alt="${escapeHtml(atletaCarteirinhaAtual.nome)}" class="w-full h-full object-cover">`;
            } else {
                miniFoto.innerHTML = `<span class="material-symbols-outlined text-outline text-[28px]">person</span>`;
            }
        }

        // Configuração inicial de checkboxes com base nos dados disponíveis
        const chkRg = document.getElementById('chk-card-rg');
        if (chkRg) chkRg.checked = !!atletaCarteirinhaAtual.rg;

        const chkFoto = document.getElementById('chk-card-foto');
        if (chkFoto) chkFoto.checked = !!fotoAtletaDataUrl;

        // Abre o modal de personalização
        abrirModalPersonalizarCarteirinha();

    } catch (err) {
        console.error('Erro ao consultar carteirinha:', err);
        showToast('Erro ao consultar carteirinha. Verifique sua conexão e tente novamente.', 'error');
    } finally {
        showLoading(false);
        if (btn) btn.disabled = false;
    }
}

function abrirModalPersonalizarCarteirinha() {
    const modal = document.getElementById('modal-personalizar-carteirinha');
    if (modal) modal.classList.add('active');
}

function fecharModalPersonalizarCarteirinha() {
    const modal = document.getElementById('modal-personalizar-carteirinha');
    if (modal) modal.classList.remove('active');
}

function toggleTodosPersonalizar(marcar) {
    const checks = document.querySelectorAll('#modal-personalizar-carteirinha input[type="checkbox"]');
    checks.forEach(c => c.checked = marcar);
}

function confirmarGeracaoCarteirinha() {
    if (!atletaCarteirinhaAtual) {
        showToast('Nenhum atleta selecionado para gerar a carteirinha.', 'error');
        fecharModalPersonalizarCarteirinha();
        return;
    }

    const config = {
        showFoto: document.getElementById('chk-card-foto')?.checked ?? true,
        showNome: document.getElementById('chk-card-nome')?.checked ?? true,
        showCpf: document.getElementById('chk-card-cpf')?.checked ?? true,
        showRg: document.getElementById('chk-card-rg')?.checked ?? true,
        showNasc: document.getElementById('chk-card-nasc')?.checked ?? true,
        showCategoria: document.getElementById('chk-card-categoria')?.checked ?? true,
        showModalidade: document.getElementById('chk-card-modalidade')?.checked ?? true,
        showPeriodo: document.getElementById('chk-card-periodo')?.checked ?? true,
        showNucleo: document.getElementById('chk-card-nucleo')?.checked ?? true,
        showResponsavel: document.getElementById('chk-card-responsavel')?.checked ?? true,
        showMatricula: document.getElementById('chk-card-matricula')?.checked ?? true,
        showQrCode: document.getElementById('chk-card-qrcode')?.checked ?? true,
    };

    fecharModalPersonalizarCarteirinha();
    renderizarCarteirinha(atletaCarteirinhaAtual, config);

    const previewArea = document.getElementById('carteirinha-preview-area');
    if (previewArea) {
        previewArea.style.display = '';
        previewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast('Carteirinha digital gerada com sucesso!', 'success');
}

function renderizarCarteirinha(atleta, config) {
    const frenteContainer = document.getElementById('carteirinha-frente-container');
    const versoContainer = document.getElementById('carteirinha-verso-container');
    if (!frenteContainer || !versoContainer) return;

    // Atualiza cabeçalho do preview
    const tituloPreview = document.getElementById('preview-atleta-titulo');
    if (tituloPreview) tituloPreview.textContent = `Credencial: ${atleta.nome || 'Atleta'}`;

    const subtituloPreview = document.getElementById('preview-atleta-subtitulo');
    if (subtituloPreview) {
        subtituloPreview.textContent = `${atleta.categoria || 'Atleta'} • ${atleta.nucleo || 'INEC'} • Temporada 2026/2027`;
    }

    const matriculaId = atleta.matricula || (atleta.id ? String(atleta.id).replace(/-/g, '').slice(0, 8).toUpperCase() : '2026-REG');
    const cpfFormatado = maskCPF(String(atleta.cpf || ''));
    const dataNascFormatada = formatarDataNascimentoBR(atleta.data_nascimento);
    const idadeCalculada = atleta.idade || calculateAge(dataNascFormatada) || '';

    // Datas oficiais de emissão e validade (+1 ano)
    const hoje = new Date();
    const dataEmissaoFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
    const dataValidade = new Date(hoje);
    dataValidade.setFullYear(dataValidade.getFullYear() + 1);
    const dataValidadeFormatada = `${String(dataValidade.getDate()).padStart(2, '0')}/${String(dataValidade.getMonth() + 1).padStart(2, '0')}/${dataValidade.getFullYear()}`;

    // ================= FRENTE DO CARTÃO =================
    let fotoHtml = '';
    if (config.showFoto && fotoAtletaDataUrl) {
        fotoHtml = `<img src="${fotoAtletaDataUrl}" alt="${escapeHtml(atleta.nome)}">`;
    } else {
        fotoHtml = `
            <div class="cr80-photo-fallback-sys">
                <span class="material-symbols-outlined text-[32px]">person</span>
                <span>FOTO 3 × 4</span>
            </div>
        `;
    }

    // Campos visíveis na frente conforme personalização selecionada
    const listaCampos = [
        { id: 'data_nasc', show: config.showNasc, label: 'DATA DE NASCIMENTO', value: dataNascFormatada + (idadeCalculada ? ` (${idadeCalculada} ANOS)` : '') },
        { id: 'categoria', show: config.showCategoria, label: 'CATEGORIA', value: atleta.categoria || '—' },
        { id: 'cpf', show: config.showCpf, label: 'CPF', value: cpfFormatado || '—' },
        { id: 'rg', show: config.showRg && atleta.rg, label: 'RG', value: atleta.rg || '—' },
        { id: 'periodo', show: config.showPeriodo, label: 'TURNO', value: atleta.periodo || '—' },
        { id: 'modalidade', show: config.showModalidade, label: 'MODALIDADES', value: atleta.modalidades || '—' },
        { id: 'nucleo', show: config.showNucleo, label: 'POLO OFICIAL', value: atleta.nucleo || 'INEC' },
        { id: 'responsavel', show: config.showResponsavel, label: 'RESPONSÁVEL', value: atleta.nome_responsavel || '—' },
    ];
    const camposAtivos = listaCampos.filter(c => c.show && c.value && c.value !== '—');
    const camposTop = camposAtivos.slice(0, 3);
    const camposExtra = camposAtivos.slice(3);

    function renderCampo(label, val) {
        return `
            <div class="cr80-sys-field">
                <span class="cr80-sys-field-label">${escapeHtml(label)}</span>
                <span class="cr80-sys-field-val">${escapeHtml(val)}</span>
                <div class="cr80-sys-field-line"></div>
            </div>
        `;
    }

    const camposTopHtml = camposTop.map(c => renderCampo(c.label, c.value)).join('');
    const camposExtraHtml = camposExtra.map(c => renderCampo(c.label, c.value)).join('');

    frenteContainer.innerHTML = `
        <div class="cr80-card cr80-card-frente" id="cr80-card-frente-element">
            <div class="cr80-top-bar">
                <img src="img/LogoINEC.png" alt="INEC" class="cr80-sys-logo">
                <img src="img/logoNEC.png" alt="NEC" class="cr80-sys-logo">
            </div>
            <div class="cr80-gold-stripe"></div>

            <div class="cr80-main-row">
                <div class="cr80-photo-frame">
                    ${fotoHtml}
                </div>
                <div class="cr80-fields-col">
                    ${config.showNome ? `
                        <div class="cr80-sys-field">
                            <span class="cr80-sys-field-label">NOME</span>
                            <span class="cr80-sys-name-val">${escapeHtml(atleta.nome || 'NOME DO ATLETA')}</span>
                            <div class="cr80-sys-field-line"></div>
                        </div>
                    ` : ''}
                    ${camposTopHtml}
                </div>
            </div>

            ${camposExtraHtml ? `
                <div class="cr80-extra-fields">
                    ${camposExtraHtml}
                </div>
            ` : ''}

            <div class="cr80-bottom-row">
                ${config.showQrCode ? `
                    <div class="cr80-qr-square">
                        <div id="cr80-qr-box-target"></div>
                    </div>
                ` : '<div></div>'}
                ${config.showMatricula ? `
                    <div class="cr80-matricula-col">
                        <span class="cr80-matricula-label">MATRÍCULA</span>
                        <span class="cr80-matricula-val">#${escapeHtml(matriculaId)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="cr80-valores-footer">
                <span>DISCIPLINA</span>
                <div class="cr80-footer-dot"></div>
                <span>RESPEITO</span>
                <div class="cr80-footer-dot"></div>
                <span>FOCO</span>
                <div class="cr80-footer-dot"></div>
                <span>SUPERAÇÃO</span>
            </div>
        </div>
    `;

    // ================= VERSO DO CARTÃO =================
    versoContainer.innerHTML = `
        <div class="cr80-card cr80-card-verso" id="cr80-card-verso-element">
            <div class="cr80-verso-header">
                <span>CARTEIRINHA DO ATLETA</span>
            </div>
            <div class="cr80-gold-stripe"></div>

            <div class="cr80-verso-content">
                <p class="cr80-verso-disclaimer">
                    Esta carteirinha é pessoal e intransferível. Obrigatória a apresentação junto com documento oficial com foto.
                </p>

                <div class="cr80-assinatura-box">
                    <div class="cr80-assinatura-line"></div>
                    <span class="cr80-assinatura-label">ASSINATURA DO ATLETA</span>
                </div>

                <div class="cr80-assinatura-box">
                    <div class="cr80-assinatura-line"></div>
                    <span class="cr80-assinatura-label">ASSINATURA DO RESPONSÁVEL</span>
                </div>

                <div class="cr80-datas-row">
                    <div class="cr80-data-col">
                        <span class="cr80-data-label text-muted">EMISSÃO</span>
                        <span class="cr80-data-val">${dataEmissaoFormatada}</span>
                    </div>
                    <div class="cr80-data-col text-right">
                        <span class="cr80-data-label text-blue">VALIDADE</span>
                        <span class="cr80-data-val text-blue">${dataValidadeFormatada}</span>
                    </div>
                </div>
            </div>

            <div class="cr80-verso-footer">
                <span>#SOMOS INEC</span>
            </div>
        </div>
    `;

    // Gera o QR Code com a biblioteca qrcodejs (ou fallback)
    if (config.showQrCode) {
        const qrTarget = document.getElementById('cr80-qr-box-target');
        if (qrTarget) {
            qrTarget.innerHTML = '';
            const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('file'))
                ? window.location.origin
                : 'https://portal-nec-inec.site';
            const qrText = `${origin}/verificar.html?cpf=${encodeURIComponent(atleta.cpf || '')}&id=${encodeURIComponent(matriculaId)}&val=${encodeURIComponent(dataValidadeFormatada)}`;
            if (typeof QRCode !== 'undefined') {
                try {
                    new QRCode(qrTarget, {
                        text: qrText,
                        width: 50,
                        height: 50,
                        colorDark: '#070E33',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (qrErr) {
                    qrTarget.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrText)}" alt="QR Code" style="width:50px;height:50px;object-fit:contain;">`;
                }
            } else {
                qrTarget.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrText)}" alt="QR Code" style="width:50px;height:50px;object-fit:contain;">`;
            }
        }
    }
}

async function baixarPDFCarteirinha() {
    const element = document.getElementById('carteirinha-printable');
    if (!element) {
        showToast('Nenhuma carteirinha para exportar.', 'error');
        return;
    }

    if (typeof html2pdf === 'undefined') {
        showToast('Preparando impressão direta...', 'info');
        window.print();
        return;
    }

    const btn = document.getElementById('btn-baixar-pdf');
    if (btn) btn.disabled = true;
    showLoading(true);

    try {
        const nomeSlug = (atletaCarteirinhaAtual?.nome || 'atleta')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-');

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `carteirinha-${nomeSlug}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2.5,
                useCORS: true,
                letterRendering: true,
                backgroundColor: '#070E33'
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'landscape'
            }
        };

        await html2pdf().set(opt).from(element).save();
        showToast('Download do PDF concluído com sucesso!', 'success');
    } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        showToast('Erro ao baixar PDF da carteirinha.', 'error');
    } finally {
        showLoading(false);
        if (btn) btn.disabled = false;
    }
}

function imprimirCarteirinha() {
    window.print();
}

