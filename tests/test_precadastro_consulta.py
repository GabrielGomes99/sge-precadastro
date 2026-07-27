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


class TestEdgeResponseEnvelopeUnwrap:
    """Regressão: a Edge Function ``validar-atleta`` sempre retorna o
    envelope ``{success: true, data: {encontrado, status, pendencias,
    atleta}}`` (e ``{success: false, code, message}`` para erros). O
    frontend precisa desembrulhar antes de ler os campos — sem isso,
    ``data.encontrado`` é ``undefined`` e o modal cai em
    ``ESTADOS.NOVO`` ("atleta não cadastrado") mesmo para CPFs que
    existem na base.

    Bug original (portal-nec-inec.site): usuário preenchia CPFs
    válidos (atleta 08398021101, responsável 02181594120), recebia
    200 + ``{encontrado: true, ...}``, mas o app.js lia
    ``data.encontrado`` direto na raiz — sempre ``undefined`` — e
    mostrava "atleta não encontrado".
    """

    def test_verificar_cadastro_desembrulha_envelope_success_data(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        # Após ``response.json()`` o código precisa desembrulhar
        # ``data.data`` antes de acessar ``data.encontrado``. Padrão
        # esperado: ``data = data?.data ?? data`` ou equivalente.
        # Sem isso, ``data.encontrado`` é ``undefined`` e cai no
        # else → ESTADOS.NOVO → "atleta não encontrado".
        assert re.search(
            r"data\s*=\s*data\??\.data\s*\?\?\s*data", body
        ), (
            "verificarCadastro deve desembrulhar o envelope "
            "{success, data} da Edge Function — sem isso, "
            "data.encontrado é undefined e mostra 'não encontrado'"
        )

    def test_verificar_cadastro_le_encontrado_apos_desembrulhar(self):
        src = _read_app_js()
        body = _slice(src, "async function verificarCadastro()", "function abrirFormulario()")
        # A leitura ``data.encontrado`` deve existir E estar
        # posicionada depois do desembrulhamento. Verificamos que
        # ambas as formas estão presentes no body — a ordem é checada
        # pelo teste anterior.
        assert "data.encontrado" in body, (
            "verificarCadastro lê data.encontrado — só funciona "
            "se desembrulhar antes"
        )


class TestAtletaNomeField:
    """Regressão: a Edge Function ``validar-atleta`` retorna
    ``atleta.nome`` (canônico via ``mapearAtleta``). ModalConsulta e
    prePreencherFormulario já tentaram ler ``atleta.nome_completo``
    (legado) — resultado: nome do atleta vazio no modal e no form
    pré-preenchido. Bug observado em 2026-07-27 no portal-nec-inec.site
    com CPF 08398021101 (Davi Costa Gomes Machado).

    ``mapearAtleta`` mantém fallback ``pickString(row, ['nome',
    'nome_completo'])`` para tolerar linhas legadas em fila de
    migração, mas o frontend deve ler pelo canônico ``atleta.nome``.
    """

    def test_render_le_atleta_nome_nao_nome_completo(self):
        src = _read_app_js()
        body = _slice(src, "_render(estado, payload) {", "if (def.onBind) {")
        # ModalConsulta._render deve exibir o nome do atleta para o
        # usuário confirmar que é a pessoa certa — sem isso, o modal
        # mostra apenas o status ("Ficha incompleta") sem identidade.
        assert re.search(
            r"payload\.atleta\.nome\b(?!_)", body
        ) or "payload.atleta.nome &&" in body or "payload.atleta && payload.atleta.nome" in body, (
            "ModalConsulta._render deve ler payload.atleta.nome "
            "(canônico) — não payload.atleta.nome_completo (legado)"
        )
        assert "payload.atleta.nome_completo" not in body, (
            "ModalConsulta._render NÃO deve ler "
            "payload.atleta.nome_completo — Edge Function retorna "
            "'nome' (mapearAtleta canônico)"
        )

    def test_pre_preencher_formulario_le_atleta_nome_nao_nome_completo(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert re.search(
            r"atleta\.nome\b(?!_)", body
        ) or "atleta.nome &&" in body or "atleta && atleta.nome" in body, (
            "prePreencherFormulario deve ler atleta.nome (canônico) "
            "— não atleta.nome_completo (legado)"
        )
        assert "atleta.nome_completo" not in body, (
            "prePreencherFormulario NÃO deve ler atleta.nome_completo "
            "— Edge Function retorna 'nome'"
        )


class TestPrePrefillCompleto:
    """Regressão: prePreencherFormulario precisa cobrir TODOS os campos
    editáveis que a Edge Function ``validar-atleta`` retorna. Sem
    isso, usuário abre o form de atualização e vê só 8 campos
    preenchidos, tendo que redigitar o resto — especialmente
    endereço estruturado (rua, numero, bairro, cidade, cep),
    parentesco, periodo e modalidades.

    O caso Davi Costa Gomes Machado (id=78, 2026-07-27) tem
    endereço completo, modalidades ("Futebol") e periodo
    ("Manhã") cadastrados, mas o prefill antigo só cobria
    nome/data/cpf/rg/contato + nome/cpf do responsável.
    """

    CAMPOS_OBRIGATORIOS = [
        # Atleta
        "inp-nome", "inp-data-nasc", "inp-rg-atleta",
        # Responsável
        "inp-nome-resp", "inp-parentesco",
        "inp-email", "inp-telefone",
        # Endereço estruturado
        "inp-rua", "inp-numero", "inp-bairro", "inp-cidade", "inp-cep",
        # Período
        "inp-periodo",
        # Saúde
        "inp-info-saude",
    ]

    def test_pre_preencher_cobre_todos_os_campos_editaveis(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        missing = [c for c in self.CAMPOS_OBRIGATORIOS if f"'{c}'" not in body]
        assert not missing, (
            f"prePreencherFormulario não cobre os inputs: {missing}. "
            "Usuário com cadastro completo perde tempo redigitando."
        )

    def test_pre_preencher_nao_sobrescreve_campos_digitados(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        # A regra "não sobrescreve se o usuário já digitou" precisa
        # estar presente — caso contrário, abrir o form e modificar
        # um campo apaga o que o usuário tinha digitado.
        assert re.search(
            r"el\.value\.trim\(\)\s*\)", body
        ) or re.search(r"if\s*\(\s*el\.value\.trim\(\)", body), (
            "prePreencherFormulario deve pular campos já preenchidos "
            "(el.value.trim() truthy) — caso contrário, apaga o que "
            "o usuário digitou antes do prefill"
        )

    def test_pre_preencher_marca_campos_vazios_como_pendentes(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        # Para campos que a Edge retornou vazios, o input precisa
        # ficar com classe ``needs-fill`` para o usuário ver que
        # ainda precisa preencher. Sem isso, o usuário olha o form
        # pré-preenchido e pensa que está pronto.
        assert "needs-fill" in body, (
            "prePreencherFormulario deve marcar com .needs-fill os "
            "campos que a Edge retornou vazios"
        )

    def test_pre_preencher_preeche_cpf_atleta_como_readonly(self):
        # CPF do atleta é a chave de lookup — pré-preenchemos para o
        # usuário ver qual cadastro está sendo atualizado, mas
        # marcamos como readonly para não permitir edição (mudaria
        # o invariante do banco e quebraria a busca subsequente).
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert "'inp-cpf-atleta'" in body, (
            "prePreencherFormulario deve pré-preencher inp-cpf-atleta "
            "(como readonly) — usuário precisa ver qual CPF está editando"
        )
        assert re.search(
            r"'inp-cpf-atleta'.*?\.readOnly\s*=\s*true",
            body,
            re.DOTALL,
        ), (
            "inp-cpf-atleta deve ser marcado como readOnly=true "
            "após o prefill — não pode ser editável pelo usuário"
        )

    def test_pre_preencher_preeche_cpf_responsavel_como_readonly(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert "'inp-cpf-resp'" in body, (
            "prePreencherFormulario deve pré-preencher inp-cpf-resp "
            "(como readonly)"
        )
        assert re.search(
            r"'inp-cpf-resp'.*?\.readOnly\s*=\s*true",
            body,
            re.DOTALL,
        ), (
            "inp-cpf-resp deve ser marcado como readOnly=true após "
            "o prefill"
        )

    def test_pre_preencher_marca_modalidades_a_partir_da_lista(self):
        # Modalidades vem como string CSV ("Futebol, Judô") da Edge.
        # O prefill precisa marcar os checkboxes correspondentes —
        # caso contrário, o usuário vê o campo vazio e re-marca.
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert re.search(
            r"atleta\.modalidades", body
        ), (
            "prePreencherFormulario precisa ler atleta.modalidades "
            "(string CSV) e marcar os checkboxes correspondentes"
        )
        # Tem que iterar as checkboxes de modalidade e marcar as
        # que estão na lista.
        assert "checkbox" in body and "checked" in body, (
            "prePreencherFormulario precisa iterar os checkboxes "
            "de modalidade e marcar (checked) os que estão no CSV"
        )

    def test_pre_preencher_marca_toggle_saude_se_problema_saude_existe(self):
        # Se a Edge retornou ``problema_saude`` não-vazio, o toggle
        # "Tem problema de saúde?" precisa estar marcado e o
        # textarea visível. Caso contrário, deixar off.
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert "inp-tem-saude" in body, (
            "prePreencherFormulario precisa sincronizar o toggle "
            "inp-tem-saude com a presença de problema_saude da Edge"
        )


class TestNeedsFillCSS:
    """Regressão visual: o prefill adiciona ``.needs-fill`` em inputs
    que a Edge retornou vazios. Precisa existir regra CSS que
    destaque esses campos em âmbar — sem ela, o destaque é invisível
    e o usuário olha o form pré-preenchido e pensa que está pronto.
    """

    def test_style_tem_regra_needs_fill(self):
        style = (Path(__file__).resolve().parent.parent / "style.css").read_text(encoding="utf-8")
        assert re.search(
            r"\.needs-fill\s*\{",
            style,
        ), (
            "style.css precisa de regra para .needs-fill — sem ela, "
            "o destaque de campos pendentes é invisível"
        )

    def test_style_needs_fill_usa_cor_ambar_nao_vermelho(self):
        # Vermelho é reservado para erros de validação pós-submit.
        # .needs-fill é "atenção, falta aqui" → âmbar.
        style = (Path(__file__).resolve().parent.parent / "style.css").read_text(encoding="utf-8")
        m = re.search(
            r"\.needs-fill[^{}]*\{([^}]+)\}",
            style,
            re.DOTALL,
        )
        assert m, "Regra .needs-fill não encontrada"
        body = m.group(1)
        assert "border-color" in body, (
            ".needs-fill precisa de border-color para destacar o input"
        )
        # Cor âmbar (D97706, B45309, F59E0B, FBBF24, ou similar)
        # — NÃO vermelho puro (EF4444 / DC2626 / B91C1C).
        assert not re.search(
            r"#[a-fA-F0-9]{0,2}(?:EF|DC|B9|ef|dc|b9)[a-fA-F0-9]{2}",
            body,
        ), (
            ".needs-fill NÃO deve usar vermelho (reservado para "
            "erros de validação). Use âmbar para 'pendente'."
        )


class TestModalListaPendencias:
    """Regressão: o modal INCOMPLETO deve listar as pendências
    retornadas pela Edge Function (``pendencias`` é uma lista de
    strings como ``["doc_aluno_url", "doc_resp_url"]``) em formato
    amigável para o usuário decidir se quer ou não atualizar.

    Sem isso, o modal só diz "Ficha incompleta — deseja atualizar?"
    sem mostrar O QUE está faltando. Usuário fica sem informação
    para decidir.
    """

    def test_tem_dicionario_pendencias_traduzidas(self):
        src = _read_app_js()
        # Mapeamento canônico: chave da Edge → label amigável.
        # Precisa existir como objeto literal no app.js.
        assert re.search(
            r"PENDENCIAS_TRADUZIDAS\s*=\s*\{", src
        ), (
            "app.js precisa de dicionário PENDENCIAS_TRADUZIDAS "
            "mapeando chaves da Edge (ex: 'doc_aluno_url') para "
            "labels amigáveis (ex: 'Documento do atleta')"
        )

    def test_traducoes_cobrem_pelo_menos_as_3_principais(self):
        # Edge pode retornar: nome, rg, data_nascimento, cpf,
        # nome_responsavel, parentesco, cpf_responsavel, email,
        # telefone, problema_saude, modalidades, periodo, foto_url,
        # doc_aluno_url, doc_resp_url, endereco (ou 5 estruturados).
        # OBRIGATÓRIAS para o usuário decidir atualizar:
        src = _read_app_js()
        # Procura o início do objeto e captura até o `};` de
        # fechamento. Valores são strings simples, sem objetos
        # aninhados — então ``\{[^}]+\}`` casa o corpo inteiro.
        m = re.search(
            r"PENDENCIAS_TRADUZIDAS\s*=\s*\{([^}]*)\}",
            src,
            re.DOTALL,
        )
        assert m, "PENDENCIAS_TRADUZIDAS não encontrada"
        body = m.group(1)
        for chave in ("doc_aluno_url", "doc_resp_url", "foto_url"):
            assert f"{chave}:" in body, (
                f"PENDENCIAS_TRADUZIDAS precisa cobrir '{chave}' "
                f"(campo de documento/arquivo que o usuário precisa "
                f"saber que está faltando)"
            )

    def test_render_lista_pendencias_no_modal_incompleto(self):
        # O _render precisa renderizar a lista de pendências quando
        # o estado for INCOMPLETO e houver payload.pendencias.
        src = _read_app_js()
        body = _slice(src, "_render(estado, payload) {", "if (def.onBind) {")
        assert "pendencias" in body, (
            "ModalConsulta._render precisa ler payload.pendencias "
            "para listar os campos que faltam no modal"
        )
        # Deve iterar e renderizar via DOM API.
        assert re.search(
            r"pendencias\.(?:forEach|map|filter)", body
        ), (
            "_render precisa iterar payload.pendencias para criar "
            "a lista visual"
        )


class TestFotoEDocPreview:
    """Regressão: o prefill precisa exibir a foto atual
    (``atleta.foto_url``) e os documentos existentes
    (``doc_aluno_url``, ``doc_resp_url``) para o usuário ver o
    que já tem antes de decidir re-uploadar.

    Sem isso, o usuário pensa que não tem nada (o input file
    está vazio visualmente) e re-envia arquivos duplicados.
    """

    def test_prefill_renderiza_foto_url_no_preview(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        assert re.search(
            r"renderUploadPreview\(\s*['\"]inp-foto['\"]\s*,\s*atleta\.foto_url",
            body,
        ), (
            "prePreencherFormulario precisa chamar renderUploadPreview "
            "com atleta.foto_url para mostrar a foto atual"
        )

    def test_prefill_expoe_doc_urls_para_preview(self):
        src = _read_app_js()
        body = _slice(src, "function prePreencherFormulario(atleta)", "const ModalConsulta = {")
        # Mesmo padrão para doc_aluno_url e doc_resp_url.
        assert re.search(
            r"doc_aluno_url",
            body,
        ), (
            "prePreencherFormulario precisa referenciar "
            "atleta.doc_aluno_url para o preview de documento"
        )
        assert re.search(
            r"doc_resp_url",
            body,
        ), (
            "prePreencherFormulario precisa referenciar "
            "atleta.doc_resp_url para o preview de documento"
        )