"""Testes de integridade e regressão para a Página de Veracidade do QR Code (verificar.html)
e Responsividade Mobile do Portal (Drawer / Sidebar e Navbar).

Verifica estaticamente que:
  1. verificar.html possui estrutura semântica oficial (Tailwind, Material Symbols, fonts);
  2. verificar.html implementa os banners de status (Ativa, Perto de Vencer, Vencida, Inativa);
  3. verificar.html possui o card de credencial oficial com foto, dados do atleta e selo digital;
  4. verificar.html contém a função calcularStatusValidade e o pipeline de consulta da Edge Function;
  5. verificar.html trata a leitura de QR Code via parâmetros de URL (?cpf=...&val=...);
  6. index.html possui navegação desktop sem quebra (whitespace-nowrap) e botão de menu mobile;
  7. index.html implementa a gaveta lateral (mobile-sidebar) com todos os links e suporte WhatsApp;
  8. app.js expõe toggleMobileSidebar e navegarMobile;
  9. app.js gera QR Code dinâmico apontando para verificar.html;
  10. style.css define as classes de gaveta móvel e breakpoints responsivos.
"""
from __future__ import annotations

import re
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT / "index.html"
VERIFICAR_HTML = ROOT / "verificar.html"
APP_JS = ROOT / "app.js"
STYLE_CSS = ROOT / "style.css"


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class TestVerificarHTMLStructure:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.html = read_file(VERIFICAR_HTML)

    def test_arquivo_verificar_html_existe(self):
        assert VERIFICAR_HTML.exists(), "verificar.html deve existir na raiz de sge-precadastro"

    def test_verificar_html_meta_e_tags_principais(self):
        assert "<!DOCTYPE html>" in self.html
        assert "Veracidade da Carteirinha" in self.html
        assert "tailwindcss.com" in self.html
        assert "Material+Symbols+Outlined" in self.html
        assert "viewport" in self.html

    def test_verificar_html_header_e_link_voltar(self):
        assert 'href="index.html"' in self.html
        assert "INEC &amp; NEC" in self.html or "INEC & NEC" in self.html
        assert "Verificação de Carteirinha" in self.html

    def test_verificar_html_form_busca_manual(self):
        assert 'id="inp-verificar-cpf"' in self.html
        assert 'id="btn-verificar-submit"' in self.html
        assert 'id="err-verificar-cpf"' in self.html
        assert 'realizarConsultaManual' in self.html

    def test_verificar_html_loading_e_resultado_containers(self):
        assert 'id="verificar-loading"' in self.html
        assert 'id="verificar-resultado-container"' in self.html

    def test_verificar_html_status_banner_e_alerta_renovacao(self):
        assert 'id="verificar-status-banner"' in self.html
        assert 'id="status-banner-icon"' in self.html
        assert 'id="status-banner-badge"' in self.html
        assert 'id="status-banner-dias"' in self.html
        assert 'id="status-banner-titulo"' in self.html
        assert 'id="status-banner-mensagem"' in self.html
        assert 'id="box-renovacao-alerta"' in self.html
        assert 'id="link-renovar-cadastro"' in self.html

    def test_verificar_html_ficha_dados_atleta(self):
        campos_esperados = [
            'id="atleta-nome"',
            'id="atleta-matricula"',
            'id="atleta-cpf"',
            'id="atleta-categoria"',
            'id="atleta-modalidades"',
            'id="atleta-polo"',
            'id="atleta-turno"',
            'id="atleta-emissao"',
            'id="atleta-validade"',
            'id="atleta-responsavel"',
            'id="atleta-foto-img"',
            'id="atleta-foto-fallback"',
            'id="timestamp-consulta"',
        ]
        for campo in campos_esperados:
            assert campo in self.html, f"Campo {campo} ausente em verificar.html"


class TestVerificarHTMLScriptLogic:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.html = read_file(VERIFICAR_HTML)

    def test_endpoint_edge_function_configurado(self):
        assert "validar-atleta" in self.html
        assert "SUPABASE_URL" in self.html
        assert "SUPABASE_ANON_KEY" in self.html

    def test_funcao_calcular_status_validade(self):
        assert "function calcularStatusValidade" in self.html
        assert "perto_vencer" in self.html
        assert "vencida" in self.html
        assert "valida" in self.html
        assert "inativa" in self.html

    def test_funcao_consultar_veracidade_usa_action_carteirinha(self):
        assert "action: 'carteirinha'" in self.html or 'action: "carteirinha"' in self.html
        assert "consultarVeracidade" in self.html

    def test_leitura_parametros_qr_code(self):
        assert "urlParams.get('cpf')" in self.html
        assert "urlParams.get('val')" in self.html
        assert "DOMContentLoaded" in self.html

    def test_mascaramento_cpf_lgpd(self):
        assert "mascararCPFLGPD" in self.html
        assert "***.***-" in self.html


class TestMobileNavigationAndSidebar:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.index_html = read_file(INDEX_HTML)
        self.app_js = read_file(APP_JS)
        self.style_css = read_file(STYLE_CSS)

    def test_index_desktop_nav_tem_whitespace_nowrap(self):
        # A barra desktop não deve quebrar texto em 2 linhas
        assert "whitespace-nowrap" in self.index_html, "Nav desktop deve ter whitespace-nowrap"
        assert "xl:flex" in self.index_html, "Nav desktop deve exibir em telas >= xl"

    def test_index_header_tem_botao_hamburguer(self):
        assert 'id="btn-toggle-mobile-menu"' in self.index_html
        assert "toggleMobileSidebar(true)" in self.index_html

    def test_index_gaveta_lateral_mobile_sidebar(self):
        assert 'id="mobile-sidebar"' in self.index_html
        assert 'id="mobile-sidebar-overlay"' in self.index_html
        assert "mobile-sidebar-drawer" in self.index_html
        assert "navegarMobile('inicio')" in self.index_html
        assert "navegarMobile('atleta')" in self.index_html
        assert "navegarMobile('instrutor')" in self.index_html
        assert "navegarMobile('carteirinha')" in self.index_html
        assert 'href="verificar.html"' in self.index_html

    def test_app_js_implementa_toggle_mobile_sidebar(self):
        assert "function toggleMobileSidebar" in self.app_js
        assert "function navegarMobile" in self.app_js
        assert "mobile-sidebar" in self.app_js
        assert "mobile-sidebar-overlay" in self.app_js

    def test_app_js_qr_code_aponta_para_verificar_html(self):
        assert "verificar.html" in self.app_js
        assert "val=" in self.app_js

    def test_style_css_regras_mobile_sidebar(self):
        assert ".mobile-sidebar-drawer" in self.style_css
        assert ".mobile-sidebar-overlay" in self.style_css
        assert ".mobile-nav-item" in self.style_css
        assert "transform: translateX(100%)" in self.style_css
        assert "transform: translateX(0)" in self.style_css

    def test_style_css_responsividade_viewports(self):
        assert "@media (max-width: 768px)" in self.style_css
        assert "@media (max-width: 480px)" in self.style_css
        assert "@media (max-width: 360px)" in self.style_css

    def test_index_navbar_dropdowns_file_tree(self):
        assert 'id="btn-dropdown-precadastro"' in self.index_html
        assert 'id="menu-dropdown-precadastro"' in self.index_html
        assert 'id="btn-dropdown-carteirinha"' in self.index_html
        assert 'id="menu-dropdown-carteirinha"' in self.index_html
        assert "├─" in self.index_html
        assert "└─" in self.index_html
        assert "selecionarSubMenu('atleta')" in self.index_html
        assert "selecionarSubMenu('instrutor')" in self.index_html
        assert "selecionarSubMenu('carteirinha')" in self.index_html

    def test_index_mobile_accordion_file_tree(self):
        assert 'id="btn-mobile-tree-precadastro"' in self.index_html
        assert 'id="sub-mobile-tree-precadastro"' in self.index_html
        assert 'id="btn-mobile-tree-carteirinha"' in self.index_html
        assert 'id="sub-mobile-tree-carteirinha"' in self.index_html
        assert "toggleMobileAccordion('precadastro')" in self.index_html
        assert "toggleMobileAccordion('carteirinha')" in self.index_html

    def test_index_hero_foto_futebol_sem_texto_sobreposto(self):
        assert "img/imagem_futebol.jpg" in self.index_html
        # Confirma que a imagem existe no disco
        assert (ROOT / "img" / "imagem_futebol.jpg").exists()
        # Confirma que o texto antigo "Núcleos de Iniciação & Alto Rendimento" foi removido de cima da imagem
        assert "Núcleos de Iniciação &amp; Alto Rendimento" not in self.index_html

    def test_app_js_dropdown_e_accordion_funcoes(self):
        assert "function toggleNavDropdown" in self.app_js
        assert "function fecharTodosDropdowns" in self.app_js
        assert "function selecionarSubMenu" in self.app_js
        assert "function toggleMobileAccordion" in self.app_js

    def test_style_css_dropdown_e_tree_styles(self):
        assert ".nav-dropdown-root" in self.style_css
        assert ".nav-dropdown-menu" in self.style_css
        assert ".mobile-tree-group" in self.style_css
        assert ".mobile-tree-header" in self.style_css
        assert ".mobile-tree-leaf" in self.style_css

    def test_header_logo_inec_e_nec(self):
        """Header principal exibe 'INEC & NEC' de forma consistente."""
        assert "INEC &amp; NEC" in self.index_html
        # Garante que não ficou apenas 'INEC' isolado no header
        assert '<span class="font-headline font-bold text-base sm:text-lg text-primary tracking-tight leading-none">INEC &amp; NEC</span>' in self.index_html

    def test_icones_atleta_e_instrutor(self):
        """Atleta usa bola (sports_soccer) e Instrutor usa apito (sports)."""
        # Dropdown
        assert 'sports_soccer</span>' in self.index_html
        assert 'Pré-Cadastro Atleta' in self.index_html
        assert 'Pré-Cadastro Instrutor' in self.index_html
        # Modal Seleção de Tipo
        assert 'data-tipo="atleta"' in self.index_html
        assert 'data-tipo="instrutor"' in self.index_html
        # Verifica que o modal usa sports_soccer para atleta e sports para instrutor
        assert '<span class="material-symbols-outlined text-[32px]">sports_soccer</span>' in self.index_html
        assert '<span class="material-symbols-outlined text-[32px]">sports</span>' in self.index_html

    def test_modal_selecao_tipo_scroll_e_compact_mobile(self):
        """Modal de seleção possui scroll e suporte compacto em telas móveis."""
        # CSS scrollable overlay
        assert "overflow-y: auto" in self.style_css
        assert "-webkit-overflow-scrolling: touch" in self.style_css
        # Mobile rules
        assert "@media (max-width: 640px)" in self.style_css
        assert ".tipo-card-content" in self.style_css

    def test_banner_instrutor_alinhado_e_centralizado(self):
        """Banner de instrutor centralizado com badge e subtítulo equilibrados."""
        assert "items-center justify-center text-center" in self.index_html
        assert "Pré-Cadastro de Instrutores &amp; Educadores" in self.index_html
        assert "Corpo Docente &amp; Comissão Técnica • INEC &amp; NEC" in self.index_html

