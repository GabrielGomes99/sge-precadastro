"""Regressão estática para o modal de consulta do pré-cadastro.

O frontend ``web/precadastro/app.js`` precisa estar em sincronia com
o contrato público da Edge Function ``validar-atleta`` (action:
``consultar``). Estes testes **não** rodam JS — eles parseam o
arquivo e verificam que:

  * o objeto ``ESTADOS`` exporta os 4 valores esperados;
  * ``verificarCadastro`` lê ``data.status`` (não ``data.ficha_status``,
    que foi o nome errado usado na primeira tentativa);
  * ``verificarCadastro`` trata ``pendencias`` como ``string[]`` (a
    Edge Function retorna mensagens, não objetos ``{status: ...}``);
  * ``ModalConsulta._render`` **não** usa ``innerHTML`` com dados do
    backend (XSS — usa apenas ``replaceChildren`` + ``textContent``);
  * os 4 estados têm ``MODAL_DEFS`` registrados;
  * ``initConsultaMasks`` cobre os IDs ``inp-consulta-cpf-atleta`` e
    ``inp-consulta-cpf-resp``.

Se algum desses contratos quebrar, o teste falha com mensagem
específica para acelerar a correção.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

APP_JS = Path(__file__).resolve().parent.parent / "app.js"


def _read_app_js() -> str:
    return APP_JS.read_text(encoding="utf-8")


def _slice(src: str, start_marker: str, end_marker: str) -> str:
    """Retorna o trecho entre dois marcadores (inclusivo)."""
    i = src.index(start_marker)
    j = src.index(end_marker, i)
    return src[i:j + len(end_marker)]


class TestEstadosConst:
    def test_objeto_estados_tem_4_valores(self):
        src = _read_app_js()
        m = re.search(
            r"const\s+ESTADOS\s*=\s*Object\.freeze\(\s*\{([^}]+)\}",
            src,
            re.DOTALL,
        )
        assert m, "Objeto ESTADOS não encontrado em app.js"
        body = m.group(1)
        for nome in ("NOVO", "COMPLETO", "INCOMPLETO", "PENDENTE"):
            assert re.search(rf"{nome}\s*:\s*'[a-z]+'", body), (
                f"ESTADOS.{nome} ausente ou formato errado"
            )

    def test_estados_strings_canônicas(self):
        # Não usar strings mágicas — ModalConsulta e verificarCadastro
        # devem referenciar ``ESTADOS.*`` em comparações, não as
        # strings cruas (digitar 'novo' em vez de ESTADOS.NOVO seria
        # bug difícil de detectar).
        src = _read_app_js()
        # As 4 strings precisam aparecer como valores literais.
        for valor in ("'novo'", "'completo'", "'incompleto'", "'pendente'"):
            assert valor in src, f"String canônica {valor} ausente em app.js"


class TestVerificarCadastroContract:
    """Garante que o frontend lê os campos certos da resposta da Edge
    Function. ``status`` (não ``ficha_status``) e ``pendencias`` como
    ``string[]``.
    """

    def test_le_status_nao_ficha_status(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "data.status" in body, (
            "verificarCadastro deve ler data.status (contrato da Edge Function)"
        )
        assert "ficha_status" not in body, (
            "verificarCadastro NÃO deve usar ficha_status — nome errado, "
            "Edge Function retorna 'status'"
        )

    def test_pendencias_tratadas_como_string_array(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        # A checagem de "tem pendência em análise" usa regex sobre
        # strings (Edge Function retorna mensagens). Se alguém voltar
        # a tratar pendencias como objeto ``{status: 'pendente'}``,
        # este teste falha.
        assert "pendencias.some" in body
        assert "/pendente/i.test" in body or "pendente" in body, (
            "verificarCadastro deve usar regex /pendente/i sobre itens string"
        )
        assert ".status === 'pendente'" not in body, (
            "Não acessar ``.status`` em pendencias — a Edge Function "
            "retorna string[], não objetos"
        )


class TestModalConsultaSafety:
    """Garante que o modal renderiza via DOM API e não innerHTML."""

    def test_render_nao_usa_innerHTML_para_conteudo_dinamico(self):
        src = _read_app_js()
        # Pega só o método _render (entre ``_render(estado, payload)``
        # e o ``},`` de fechamento, mas cuidado: o método tem ``}}``
        # interno por causa de createElement. Usamos marcador mais
        # específico.
        body = _slice(src, "_render(estado, payload) {", "if (def.onBind) {")
        # innerHTML é usado APENAS para def.iconSvg e def.buttonsHtml,
        # que são literais do autor. NUNCA para valores vindos do
        # backend (``def.titulo``, ``def.descricao``, ``atletaNome``).
        for forbidden in (
            "innerHTML = def.titulo",
            "innerHTML = def.descricao",
            "innerHTML = atletaNome",
            "innerHTML = escapeHtml(atletaNome)",
            "innerHTML = escapeHtml(def.titulo)",
            "innerHTML = escapeHtml(def.descricao)",
        ):
            assert forbidden not in body, (
                f"XSS surface: {forbidden} encontrado — use textContent"
            )

    def test_render_usa_textContent_e_replaceChildren(self):
        src = _read_app_js()
        body = _slice(src, "_render(estado, payload) {", "if (def.onBind) {")
        assert "replaceChildren()" in body, (
            "_render deve limpar o container com replaceChildren()"
        )
        assert "title.textContent" in body, (
            "Título deve ser setado via textContent"
        )
        assert "desc.textContent" in body, (
            "Descrição deve ser setada via textContent"
        )


class TestModalLayoutCSS:
    """Regressão para o bug 'modal cortado em viewports estreitos'.

    Sem ``min-width: 0`` + ``max-width: min(480px, calc(100vw - 32px))``
    + ``overflow-wrap: anywhere``, o card cresce até caber o título
    mais largo (372px de ``Atleta não cadastrado`` em Bebas Neue 26px)
    e o texto vaza lateralmente, ficando cortado em viewports ≤420px.
    """

    STYLE = (Path(__file__).resolve().parent.parent / "style.css").read_text(encoding="utf-8")

    def test_modal_card_tem_min_width_zero(self):
        # Extrai o bloco ``.modal-card { ... }``
        m = re.search(r"\.modal-card\s*\{([^}]+)\}", self.STYLE, re.DOTALL)
        assert m, "Bloco .modal-card não encontrado"
        body = m.group(1)
        assert re.search(r"min-width\s*:\s*0", body), (
            ".modal-card precisa de min-width: 0 para encolher dentro do flex"
        )

    def test_modal_card_max_width_limitado_ao_viewport(self):
        m = re.search(r"\.modal-card\s*\{([^}]+)\}", self.STYLE, re.DOTALL)
        body = m.group(1)
        # ``min(480px, calc(100vw - 32px))`` impede o card de exceder o
        # viewport. ``calc(100vw - X)`` é a forma robusta.
        assert re.search(
            r"max-width\s*:\s*min\(\s*480px\s*,\s*calc\(\s*100vw\s*-\s*\d+px\s*\)\s*\)",
            body,
        ), (
            ".modal-card precisa de max-width: min(480px, calc(100vw - Xpx))"
        )

    def test_modal_title_e_text_quebram_palavra(self):
        # ``overflow-wrap: anywhere`` é o que faz o texto quebrar em
        # viewports estreitos. ``word-break: break-word`` é fallback
        # para browsers antigos.
        assert re.search(
            r"\.modal-title\s*,\s*\.modal-text\s*\{[^}]*overflow-wrap\s*:\s*anywhere",
            self.STYLE,
            re.DOTALL,
        ), (
            ".modal-title e .modal-text precisam de overflow-wrap: anywhere"
        )


class TestFormActionsScoping:
    """Regressão: ``.form-actions { position: fixed }`` é necessário no
    formulário principal (botão "Enviar Pré-cadastro" fica acessível
    enquanto o usuário rola a página grande). Mas a regra era global
    e capturava o botão "Verificar cadastro" da consulta inicial,
    colando-o no rodapé do viewport e cobrindo os campos de CPF.

    O escopo correto é ``#form-precadastro .form-actions`` — só
    dentro do form grande, não na consulta.
    """

    STYLE = (Path(__file__).resolve().parent.parent / "style.css").read_text(encoding="utf-8")

    def test_form_actions_fixed_escopado_ao_form_principal(self):
        # A regra com ``position: fixed`` deve estar dentro do escopo
        # ``#form-precadastro .form-actions``, não como seletor global.
        m = re.search(
            r"#form-precadastro\s+\.form-actions\s*\{[^}]*position\s*:\s*fixed",
            self.STYLE,
            re.DOTALL,
        )
        assert m, (
            "Regra .form-actions { position: fixed } deve estar "
            "escopada a #form-precadastro .form-actions "
            "(senão captura o botão da consulta inicial)"
        )

    def test_sem_position_fixed_global_em_form_actions(self):
        # Garante que NÃO existe um seletor global ``.form-actions``
        # com ``position: fixed`` (que era o bug original).
        m = re.search(
            r"^\.form-actions\s*\{[^}]*position\s*:\s*fixed",
            self.STYLE,
            re.DOTALL | re.MULTILINE,
        )
        assert not m, (
            "NÃO deve haver seletor global '.form-actions { "
            "position: fixed }' — captura o botão da consulta"
        )

    def test_modal_defs_cobre_os_4_estados(self):
        src = _read_app_js()
        # MODAL_DEFS tem 4 chaves.
        for estado in ("NOVO", "COMPLETO", "INCOMPLETO", "PENDENTE"):
            assert f"[ESTADOS.{estado}]:" in src, (
                f"MODAL_DEFS faltando para ESTADOS.{estado}"
            )


class TestConsultaWiring:
    def test_init_consulta_masks_cobre_os_2_campos(self):
        src = _read_app_js()
        body = _slice(src, "function initConsultaMasks()", "function initModalidades()")
        assert "inp-consulta-cpf-atleta" in body
        assert "inp-consulta-cpf-resp" in body

    def test_init_consulta_masks_chamado_no_domcontentloaded(self):
        src = _read_app_js()
        # A função é invocada dentro do listener DOMContentLoaded.
        # Verifica que tanto o addEventListener quanto o init estão lá.
        assert "addEventListener('DOMContentLoaded'" in src
        assert "initConsultaMasks();" in src


class TestAbrirFormulario:
    def test_esconde_consulta_e_mostra_form(self):
        src = _read_app_js()
        body = _slice(src, "function abrirFormulario()", "function prePreencherFormulario(")
        assert "consulta-card" in body
        assert "form-precadastro" in body
        assert "display = 'none'" in body
        assert "display = 'block'" in body

    def test_pre_preenchimento_apenas_em_incompleto(self):
        src = _read_app_js()
        body = _slice(src, "function abrirFormulario()", "function prePreencherFormulario(")
        assert "ESTADOS.INCOMPLETO" in body, (
            "prePreencherFormulario deve ser chamado SÓ em estado INCOMPLETO"
        )


class TestVerificarCadastroRequestContract:
    """Regressão: o body enviado à Edge Function ``validar-atleta`` precisa
    casar com o que o backend lê. A primeira tentativa enviou
    ``cpf_atleta`` mas o backend faz ``body.cpf`` (``index.ts`` linha 706),
    o que retornava 400 ``cpf_invalido`` mesmo com CPF válido.
    """

    def test_body_envia_cpf_nao_cpf_atleta(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert re.search(r"body:\s*JSON\.stringify\(\{[^}]*cpf:\s*cpfAtleta", body, re.DOTALL), (
            "verificarCadastro deve enviar 'cpf' (não 'cpf_atleta') — "
            "Edge Function lê body.cpf"
        )
        assert "cpf_atleta:" not in body, (
            "verificarCadastro NÃO deve enviar 'cpf_atleta:' — nome errado, "
            "Edge Function retorna 400 cpf_invalido"
        )


class TestValidarAtletaAuthHeader:
    def test_verificar_cadastro_usa_fetch_em_endereco_da_edge_function(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert re.search(r"await\s+fetch\(ENDPOINT_VALIDAR_ATLETA\s*,", body)

    def test_verificar_cadastro_envia_authorization_bearer(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "'Authorization': `Bearer ${SUPABASE_ANON_KEY}`" in body

    def test_verificar_cadastro_envia_apikey_header(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "'apikey': SUPABASE_ANON_KEY" in body

    def test_verificar_cadastro_nao_usa_functions_invoke_para_validar_atleta(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "functions.invoke('validar-atleta'" not in body

    def test_verificar_cadastro_preserva_mensagem_de_erro_via_edge_flag(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert re.search(
            r"if\s*\([^)]*e\.body[^)]*\)\s*\{\s*mensagem\s*=\s*e\.body\.message",
            body,
            re.DOTALL,
        )
        assert "error.context.json" not in body

    def test_verificar_cadastro_distinguem_network_failure_de_edge_error(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "Erro de conexão" in body
        assert "Não foi possível verificar" in body

    def test_verificar_cadastro_trata_response_json_parse_failure(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert re.search(
            r"try\s*\{\s*data\s*=\s*await\s+response\.json\(\);\s*\}\s*catch",
            body,
            re.DOTALL,
        )
        assert re.search(
            r"console\.warn\([^;]*resposta não-JSON",
            body,
            re.DOTALL,
        )


class TestCpfSanitization:
    """Regressão: garantir que o frontend strip dots/dashes do CPF antes
    de enviar para a Edge Function e para o payload de
    ``cadastros_pendentes``.

    O live portal ``sge-precadastro`` já faz isso via
    ``lookup-helpers.js#extrairDigitos``. O sge-system working copy
    precisa do mesmo hardening (report de 400 cpf_invalido no portal
    live apontou para ``Data Sanitization`` + ``Client-Side
    Validation`` como recomendações).

    Sem strip, o body enviado é ``"111.444.777-35"`` em vez de
    ``"11144477735"``. Backend ``normalizarCpf`` strip internamente
    (não causa 400), mas a recomendação é strip também no cliente
    para reduzir payload e fazer hygiene explícita.
    """

    def test_extrair_digitos_helper_defined(self):
        src = _read_app_js()
        assert "function extrairDigitos" in src, (
            "extrairDigitos precisa ser definido em app.js — "
            "paridade com lookup-helpers.js do live portal"
        )
        # O helper tem que de fato usar replace(/\D/g, '') para tirar
        # dots/dashes. Sem essa regex ele não strip.
        m = re.search(
            r"function\s+extrairDigitos\s*\([^)]*\)\s*\{[^}]*replace\(/\\D/g\s*,\s*''\)",
            src,
            re.DOTALL,
        )
        assert m, (
            "extrairDigitos deve usar replace(/\\D/g, '') para "
            "remover tudo que não é dígito"
        )

    def test_extrair_digitos_rejeita_nao_string(self):
        # Parity com lookup-helpers.js#extrairDigitos:
        # ``typeof cpf !== 'string' return ''`` — número/null/undefined
        # viram string vazia, não coerção implícita. Sem isso
        # ``extrairDigitos(123)`` retorna ``"123"`` e mascara bug
        # onde alguém passa número por engano.
        import subprocess
        import tempfile
        import os

        # Extrai o source da função extrairDigitos do app.js e roda
        # com node em subprocess isolado. NÃO usa eval — só leitura
        # de arquivo e execução direta do .js que escrevemos.
        app_src = APP_JS.read_text(encoding="utf-8")
        m = re.search(
            r"function\s+extrairDigitos\s*\([^)]*\)\s*\{[^}]*\}",
            app_src,
            re.DOTALL,
        )
        assert m, "extrairDigitos não encontrada no app.js"
        helper_src = m.group(0)

        # Casos: (input, expected). Para inputs não-string esperamos "".
        cases_js = """
const cases = [
    [null, ''],
    [undefined, ''],
    [123, ''],
    [true, ''],
    ['111.444.777-35', '11144477735'],
    ['012.345.678-90', '01234567890'],
    ['', ''],
    ['   ', ''],
];
let fail = 0;
for (const [input, expected] of cases) {
    const got = extrairDigitos(input);
    const ok = got === expected;
    if (!ok) {
        console.error('extrairDigitos(' + JSON.stringify(input)
                      + ') = ' + JSON.stringify(got)
                      + ', expected ' + JSON.stringify(expected));
        fail++;
    }
}
process.exit(fail === 0 ? 0 : 1);
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".js", delete=False, encoding="utf-8"
        ) as f:
            f.write(helper_src + "\n" + cases_js)
            tmp_path = f.name
        try:
            result = subprocess.run(
                ["node", tmp_path],
                capture_output=True,
                text=True,
                cwd=str(Path(__file__).resolve().parent.parent),
                timeout=10,
            )
        finally:
            os.unlink(tmp_path)
        assert result.returncode == 0, (
            "extrairDigitos falhou casos de teste:\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    def test_consulta_usa_extrair_digitos_no_cpf_atleta(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        # No fix anterior (commit e1f5e65) o código lia
        # ``cpfAtletaEl.value.trim()``. Tem que virar
        # ``extrairDigitos(cpfAtletaEl.value)``.
        assert "extrairDigitos(cpfAtletaEl.value)" in body, (
            "verificarCadastro deve chamar extrairDigitos em "
            "cpfAtletaEl.value antes do invoke"
        )

    def test_consulta_usa_extrair_digitos_no_cpf_resp(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        assert "extrairDigitos(cpfRespEl.value)" in body, (
            "verificarCadastro deve chamar extrairDigitos em "
            "cpfRespEl.value antes do invoke"
        )

    def test_validate_form_usa_extrair_digitos_no_cpf_atleta(self):
        src = _read_app_js()
        body = _slice(src, "function validateForm()", "async function enviarPreCadastro()")
        # Assert específico: o call site usa o padrão
        # ``extrairDigitos(document.getElementById('inp-cpf-atleta').value)``.
        # Sem isso o validateForm passa o CPF COM formatação para
        # validateCPF (que strip internamente, mas o payload sai
        # sem strip se outra função downstream consumir essa var).
        assert "extrairDigitos(document.getElementById('inp-cpf-atleta').value)" in body, (
            "validateForm deve chamar "
            "extrairDigitos(document.getElementById('inp-cpf-atleta').value) "
            "— não .value.trim() direto"
        )

    def test_payload_atualizar_usa_extrair_digitos_no_cpf_atleta(self):
        src = _read_app_js()
        # Procura o payload com ``cpf: getVal('inp-cpf-atleta')`` —
        # padrão atual do código enviarPreCadastro.
        # Tem que virar ``cpf: extrairDigitos(getVal('inp-cpf-atleta'))``.
        assert "cpf: extrairDigitos(getVal('inp-cpf-atleta'))" in src, (
            "enviarPreCadastro deve usar "
            "cpf: extrairDigitos(getVal('inp-cpf-atleta')) "
            "— sem strip, payload inclui dots/dashes"
        )

    def test_payload_atualizar_usa_extrair_digitos_no_cpf_resp(self):
        src = _read_app_js()
        assert "cpf_responsavel: extrairDigitos(getVal('inp-cpf-resp'))" in src, (
            "enviarPreCadastro deve usar "
            "cpf_responsavel: extrairDigitos(getVal('inp-cpf-resp')) "
            "— sem strip, payload inclui dots/dashes"
        )