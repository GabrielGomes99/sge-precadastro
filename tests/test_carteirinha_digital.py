"""Testes de integridade e regressão para a Carteirinha Digital (CR80 & Personalização).

Verifica estaticamente que:
  1. index.html possui as bibliotecas html2pdf e qrcodejs no head;
  2. index.html expõe a navegação e o modal de tipo para "carteirinha";
  3. index.html contém os elementos essenciais da seção e modal (#secao-carteirinha, #inp-carteirinha-cpf, #carteirinha-preview-area, #modal-personalizar-carteirinha);
  4. app.js implementa as funções do pipeline da carteirinha (consultar, personalizar, renderizar e baixar PDF);
  5. style.css define as classes do cartão padrão CR80 e modal de personalização.
"""
from __future__ import annotations

import re
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT / "index.html"
APP_JS = ROOT / "app.js"
STYLE_CSS = ROOT / "style.css"


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class TestCarteirinhaHTML:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.html = read_file(INDEX_HTML)

    def test_bibliotecas_head_carregadas(self):
        assert "html2pdf.bundle.min.js" in self.html, "html2pdf script tag ausente no head de index.html"
        assert "qrcode.min.js" in self.html, "qrcode script tag ausente no head de index.html"

    def test_modal_selecao_tipo_contem_carteirinha(self):
        assert 'data-tipo="carteirinha"' in self.html, "Opção carteirinha ausente no modal de seleção de tipo"
        assert "Carteirinha Digital" in self.html

    def test_header_nav_contem_carteirinha(self):
        assert "confirmarSelecaoTipo('carteirinha')" in self.html

    def test_secao_carteirinha_estrutura(self):
        assert 'id="secao-carteirinha"' in self.html
        assert 'id="inp-carteirinha-cpf"' in self.html
        assert 'id="btn-buscar-carteirinha"' in self.html
        assert 'id="carteirinha-preview-area"' in self.html
        assert 'id="carteirinha-printable"' in self.html
        assert 'id="carteirinha-frente-container"' in self.html
        assert 'id="carteirinha-verso-container"' in self.html

    def test_modal_personalizar_checkboxes(self):
        assert 'id="modal-personalizar-carteirinha"' in self.html
        expected_checkboxes = [
            "chk-card-foto",
            "chk-card-nome",
            "chk-card-cpf",
            "chk-card-rg",
            "chk-card-nasc",
            "chk-card-categoria",
            "chk-card-modalidade",
            "chk-card-periodo",
            "chk-card-nucleo",
            "chk-card-responsavel",
            "chk-card-matricula",
            "chk-card-qrcode",
        ]
        for chk in expected_checkboxes:
            assert f'id="{chk}"' in self.html, f"Checkbox {chk} ausente no modal de personalização"


class TestCarteirinhaJS:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.js = read_file(APP_JS)

    def test_inicializacao_de_mascara(self):
        assert "initCarteirinhaMasks();" in self.js
        assert "function initCarteirinhaMasks()" in self.js
        assert "inp-carteirinha-cpf" in self.js

    def test_confirmar_selecao_tipo_trata_carteirinha(self):
        assert "tipo === 'carteirinha'" in self.js
        assert "secaoCarteirinha.style.display = ''" in self.js

    def test_consulta_carteirinha_contrato(self):
        assert "async function consultarCarteirinha()" in self.js
        assert "action: 'carteirinha'" in self.js
        assert "ENDPOINT_VALIDAR_ATLETA" in self.js

    def test_pipeline_personalizacao_e_render(self):
        assert "function abrirModalPersonalizarCarteirinha()" in self.js
        assert "function fecharModalPersonalizarCarteirinha()" in self.js
        assert "function confirmarGeracaoCarteirinha()" in self.js
        assert "function renderizarCarteirinha(" in self.js
        assert "function baixarPDFCarteirinha()" in self.js
        assert "function imprimirCarteirinha()" in self.js

    def test_pdf_export_options(self):
        assert "html2pdf()" in self.js
        assert "carteirinha-" in self.js
        assert "format: 'a4'" in self.js or "format:" in self.js

    def test_renderizar_carteirinha_elementos_oficiais(self):
        assert "#SOMOS INEC" in self.js
        assert "CARTEIRINHA DO ATLETA" in self.js
        assert "DISCIPLINA" in self.js
        assert "SUPERAÇÃO" in self.js
        assert "ASSINATURA DO ATLETA" in self.js
        assert "ASSINATURA DO RESPONSÁVEL" in self.js


class TestCarteirinhaCSS:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.css = read_file(STYLE_CSS)

    def test_cr80_card_styles(self):
        assert ".cr80-card" in self.css
        assert ".cr80-card-frente" in self.css
        assert ".cr80-card-verso" in self.css

    def test_cr80_card_dimensoes_oficiais(self):
        assert "width: 300px;" in self.css
        assert "height: 430px;" in self.css

    def test_cr80_elementos_oficiais_sistema(self):
        assert ".cr80-top-bar" in self.css
        assert ".cr80-gold-stripe" in self.css
        assert ".cr80-valores-footer" in self.css
        assert ".cr80-assinatura-box" in self.css
        assert ".cr80-sys-field" in self.css

    def test_modal_personalizar_styles(self):
        assert ".modal-personalizar-card" in self.css
        assert ".personalizar-opcoes-grid" in self.css
        assert ".personalizar-opcao-item" in self.css

    def test_modal_tipo_grid_tem_3_colunas(self):
        assert "grid-template-columns: repeat(3, 1fr);" in self.css
