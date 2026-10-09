import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function harness({ uploadError = null, exception = false, photo = true, existing = {}, missingPath = false } = {}) {
    const events = { inserts: [], toasts: [], loading: [], resets: 0, success: false };
    const nodes = new Map();
    const client = {
        storage: { from: () => ({
            upload: async () => {
                if (exception) throw new Error('network failure');
                return { data: missingPath ? null : { path: 'fotos/test.png' }, error: uploadError };
            },
            getPublicUrl: () => ({ data: { publicUrl: 'https://storage.example/fotos/test.png' } }),
        }) },
        from: () => ({ insert: async payload => { events.inserts.push(payload); return { error: null }; } }),
    };
    const context = vm.createContext({
        supabase: { createClient: () => client },
        console: { error() {} },
        crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
        document: {
            addEventListener() {},
            querySelectorAll: () => [],
            getElementById: id => {
                if (!nodes.has(id)) nodes.set(id, {
                    value: '', checked: false, dataset: {},
                    classList: { add: () => { if (id === 'modal-sucesso') events.success = true; } },
                    parentElement: { querySelector: () => existing[id] ? { getAttribute: () => existing[id] } : null },
                });
                return nodes.get(id);
            },
        },
        events,
        selectedPhoto: photo ? { name: 'foto.png', size: 100, type: 'image/png' } : null,
    });
    vm.runInContext(source, context);
    vm.runInContext(`
        fotoFile = selectedPhoto;
        fotoFileInstr = selectedPhoto;
        validateForm = validateFormInstrutor = () => true;
        showLoading = value => events.loading.push(value);
        showToast = (message, type) => events.toasts.push({ message, type });
        limparFormulario = () => events.resets++;
    `, context);
    return { context, events };
}

for (const submit of ['enviarPreCadastro', 'enviarPreCadastroInstrutor']) {
    for (const failure of [{ uploadError: { message: 'storage denied' } }, { exception: true }, { missingPath: true }]) {
        test(`${submit}: upload failure blocks submission and keeps the file for retry (${JSON.stringify(failure)})`, async () => {
            const { context, events } = harness(failure);
            await vm.runInContext(`${submit}()`, context);
            assert.equal(events.inserts.length, 0);
            assert.equal(events.success, false);
            assert.equal(events.resets, 0);
            assert.deepEqual(events.loading, [true, false]);
            assert.match(events.toasts[0].message, /Não foi possível enviar o arquivo/);
            assert.equal(vm.runInContext('fotoFile === selectedPhoto', context), true);
        });
    }
    test(`${submit}: successful upload sends the photo URL`, async () => {
        const { context, events } = harness();
        await vm.runInContext(`${submit}()`, context);
        assert.equal(events.inserts.length, 1);
        assert.equal(events.inserts[0].foto_url, 'https://storage.example/fotos/test.png');
        assert.equal(events.success, true);
    });
    test(`${submit}: missing photo blocks submission even if form validation was bypassed`, async () => {
        const { context, events } = harness({ photo: false });
        await vm.runInContext(`${submit}()`, context);
        assert.equal(events.inserts.length, 0);
        assert.equal(events.success, false);
        assert.match(events.toasts[0].message, /foto/);
    });
}

test('keeps existing photo and documents when the user does not select replacements', async () => {
    const existing = {
        'inp-foto': 'https://storage.example/current.jpg',
        'inp-doc-aluno': 'https://storage.example/aluno.pdf',
        'inp-doc-resp': 'https://storage.example/responsavel.pdf',
    };
    const { context, events } = harness({ photo: false, existing });
    await vm.runInContext('enviarPreCadastro()', context);
    assert.equal(events.inserts.length, 1);
    assert.equal(events.inserts[0].foto_url, existing['inp-foto']);
    assert.equal(events.inserts[0].doc_aluno_url, existing['inp-doc-aluno']);
    assert.equal(events.inserts[0].doc_resp_url, existing['inp-doc-resp']);
});

test('a failed replacement never silently falls back to the existing photo', async () => {
    const { context, events } = harness({ uploadError: { message: 'failed' }, existing: { 'inp-foto': 'https://storage.example/current.jpg' } });
    await vm.runInContext('enviarPreCadastro()', context);
    assert.equal(events.inserts.length, 0);
    assert.equal(events.success, false);
});
