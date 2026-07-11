// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://yoqjelcixpbygwifwirm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvcWplbGNpeHBieWd3aWZ3aXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzUwMzIsImV4cCI6MjA4NzcxMTAzMn0.9pHR-q6MVNp2EPckhnpb7hkBHB2t8vhF1c9WUvBiR-s';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== CONSTANTS ====================
const MODALIDADES_INEC = ['Futebol'];
const MODALIDADES_NEC = ['Judô', 'Jiu-Jitsu', 'Balé', 'Forró', 'Hip Hop', 'Zumba', 'Vôlei', 'Futsal', 'X1', 'Basquete', 'Tênis de Mesa', 'Handball'];

// ==================== FILE STATE ====================
let fotoFile = null;
let docAlunoFile = null;
let docRespFile = null;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initModalidades();
    initInputMasks();
});

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
    const cpfAtleta = document.getElementById('inp-cpf-atleta').value.trim();
    if (cpfAtleta && !validateCPF(cpfAtleta)) {
        setError('cpf-atleta', 'CPF inválido');
        valid = false;
    }

    const cpfResp = document.getElementById('inp-cpf-resp').value.trim();
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
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    return `PRE-${y}${m}${d}-${rand}`;
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
            cpf: getVal('inp-cpf-atleta'),
            data_nascimento: dataNasc,
            idade: idade,
            categoria: categoria,
            endereco: endereco,
            nome_responsavel: getVal('inp-nome-resp'),
            parentesco: getVal('inp-parentesco'),
            cpf_responsavel: getVal('inp-cpf-resp'),
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

// ==================== MODAL ====================
function fecharModal() {
    document.getElementById('modal-sucesso').classList.remove('active');
}

function novoCadastro() {
    fecharModal();
    limparFormulario();
}

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
