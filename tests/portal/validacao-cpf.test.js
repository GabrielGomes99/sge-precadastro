// tests/portal/validacao-cpf.test.js
//
// Pure-function tests for the public portal CPF lookup + update mode
// pipeline (Task 6). These cover only the dependency-free helpers that
// power `consultarAtletaPorCpf`, `cpfValidoParaLookup`, and
// `extrairEnderecoLegado`. The DOM-touching code in app.js is exercised
// manually.
//
// Run with the built-in Node test runner:
//   node --test tests/portal/validacao-cpf.test.js

import { test } from 'node:test';
import assert from 'node:assert';
import {
  extrairDigitos,
  cpfValidoParaLookup,
  extrairEnderecoLegado,
  parseModalidades,
  montarPayloadSolicitacao,
  CAMPOS_DADOS_PERMITIDOS,
  CAMPOS_ARQUIVOS_PERMITIDOS,
} from '../../lookup-helpers.js';

// ---------------------------------------------------------------------------
// extrairDigitos
// ---------------------------------------------------------------------------

test('extrairDigitos removes formatting', () => {
  assert.strictEqual(extrairDigitos('111.444.777-35'), '11144477735');
});

test('extrairDigitos keeps digits-only input unchanged', () => {
  assert.strictEqual(extrairDigitos('11144477735'), '11144477735');
});

test('extrairDigitos returns empty string for empty input', () => {
  assert.strictEqual(extrairDigitos(''), '');
});

test('extrairDigitos drops all non-digit characters', () => {
  assert.strictEqual(extrairDigitos('a1b2c3'), '123');
});

// ---------------------------------------------------------------------------
// cpfValidoParaLookup
// ---------------------------------------------------------------------------

test('cpfValidoParaLookup rejects partial input', () => {
  assert.strictEqual(cpfValidoParaLookup('111.444.777'), false);
});

test('cpfValidoParaLookup rejects invalid check digits', () => {
  assert.strictEqual(cpfValidoParaLookup('111.444.777-34'), false);
});

test('cpfValidoParaLookup rejects repeated sequences', () => {
  assert.strictEqual(cpfValidoParaLookup('111.111.111-11'), false);
});

test('cpfValidoParaLookup accepts valid CPF', () => {
  assert.strictEqual(cpfValidoParaLookup('111.444.777-35'), true);
});

test('cpfValidoParaLookup accepts digit-only valid CPF', () => {
  assert.strictEqual(cpfValidoParaLookup('11144477735'), true);
});

// ---------------------------------------------------------------------------
// extrairEnderecoLegado
// ---------------------------------------------------------------------------

test('extrairEnderecoLegado parses legacy string', () => {
  const r = extrairEnderecoLegado('Rua A, 123 - Bairro, Cidade - 12345-678');
  assert.strictEqual(r.rua, 'Rua A');
  assert.strictEqual(r.numero, '123');
  assert.strictEqual(r.bairro, 'Bairro');
  assert.strictEqual(r.cidade, 'Cidade');
  assert.strictEqual(r.cep, '12345-678');
});

test('extrairEnderecoLegado returns blanks for unparseable string', () => {
  const r = extrairEnderecoLegado('');
  assert.strictEqual(r.rua, '');
  assert.strictEqual(r.numero, '');
  assert.strictEqual(r.bairro, '');
  assert.strictEqual(r.cidade, '');
  assert.strictEqual(r.cep, '');
});

test('extrairEnderecoLegado returns blanks for null', () => {
  const r = extrairEnderecoLegado(null);
  assert.strictEqual(r.rua, '');
  assert.strictEqual(r.numero, '');
});

// ---------------------------------------------------------------------------
// parseModalidades
// ---------------------------------------------------------------------------

test('parseModalidades splits CSV string into trimmed array', () => {
  assert.deepStrictEqual(parseModalidades('Futebol, Vôlei, Judô'), [
    'Futebol',
    'Vôlei',
    'Judô',
  ]);
});

test('parseModalidades returns empty array for blank input', () => {
  assert.deepStrictEqual(parseModalidades(''), []);
  assert.deepStrictEqual(parseModalidades(null), []);
});

test('parseModalidades accepts already-parsed array', () => {
  assert.deepStrictEqual(parseModalidades(['Futebol', 'Vôlei']), [
    'Futebol',
    'Vôlei',
  ]);
});

// ---------------------------------------------------------------------------
// montarPayloadSolicitacao (whitelist enforcement)
// ---------------------------------------------------------------------------

test('montarPayloadSolicitacao builds a whitelisted payload', () => {
  const formValues = {
    nome: 'Fulano',
    rg: '12.345.678-9',
    cpf: '111.444.777-35',
    data_nascimento: '01/01/2010',
    rua: 'Rua A',
    numero: '123',
    bairro: 'Bairro',
    cidade: 'Cidade',
    cep: '12345-678',
    nome_responsavel: 'Ciclano',
    parentesco: 'Mãe',
    cpf_responsavel: '222.333.444-05',
    email: 'a@b.c',
    telefone: '(11) 90000-0000',
    problema_saude: '',
    modalidades: 'Futebol',
    periodo: 'Manhã',
  };
  const arquivos = {
    foto_url: 'https://x.supabase.co/storage/v1/object/public/atletas/f.jpg',
    doc_aluno_url: '',
    doc_resp_url: '',
  };
  const payload = montarPayloadSolicitacao('11144477735', formValues, arquivos);
  assert.strictEqual(payload.action, 'solicitar_atualizacao');
  assert.strictEqual(payload.cpf, '11144477735');
  assert.strictEqual(payload.dados.nome, 'Fulano');
  assert.strictEqual(payload.dados.cpf, undefined); // never echo own CPF in dados
  assert.strictEqual(payload.arquivos.foto_url, arquivos.foto_url);
});

test('montarPayloadSolicitacao inclui cpf_responsavel quando preenchido', () => {
  const payload = montarPayloadSolicitacao(
    '11144477735',
    { nome: 'X', cpf_responsavel: '52998224725' },
    {},
  );
  assert.strictEqual(payload.dados.cpf_responsavel, '52998224725');
});

test('montarPayloadSolicitacao never includes atleta_id, snapshot, or status', () => {
  const payload = montarPayloadSolicitacao(
    '11144477735',
    { nome: 'Fulano' },
    {},
    { forbiddenHint: 'atleta_id', snapshot: { x: 1 }, status: 'pendente' },
  );
  assert.strictEqual('atleta_id' in payload, false);
  assert.strictEqual('snapshot' in payload, false);
  assert.strictEqual('status' in payload, false);
});

test('montarPayloadSolicitacao drops unknown keys from dados', () => {
  const payload = montarPayloadSolicitacao(
    '11144477735',
    { nome: 'Fulano', evil: 'value' },
    {},
  );
  assert.strictEqual(payload.dados.nome, 'Fulano');
  assert.strictEqual(payload.dados.evil, undefined);
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('CAMPOS_DADOS_PERMITIDOS is a non-empty Set', () => {
  assert.ok(CAMPOS_DADOS_PERMITIDOS instanceof Set);
  assert.ok(CAMPOS_DADOS_PERMITIDOS.size > 0);
  assert.ok(CAMPOS_DADOS_PERMITIDOS.has('nome'));
});

test('CAMPOS_ARQUIVOS_PERMITIDOS contains the three expected keys', () => {
  assert.ok(CAMPOS_ARQUIVOS_PERMITIDOS instanceof Set);
  assert.ok(CAMPOS_ARQUIVOS_PERMITIDOS.has('foto_url'));
  assert.ok(CAMPOS_ARQUIVOS_PERMITIDOS.has('doc_aluno_url'));
  assert.ok(CAMPOS_ARQUIVOS_PERMITIDOS.has('doc_resp_url'));
});