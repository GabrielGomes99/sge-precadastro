"""Regression test for consultarAtletaPorCpf Authorization header.

The live portal sends Edge Function calls via raw fetch with an explicit
Authorization header. If this header is removed, the Supabase gateway
returns UNAUTHORIZED_NO_AUTH_HEADER and the consultar flow breaks.
This test is a static-analysis regression guard.
"""
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_JS = REPO_ROOT / 'app.js'


def _read_app_js() -> str:
    return APP_JS.read_text(encoding='utf-8')


def _slice(content: str, start_marker: str, end_marker: str | None = None) -> str:
    """Return content from start_marker to end of file (or end_marker)."""
    start = content.index(start_marker)
    if end_marker is None:
        return content[start:]
    end = content.index(end_marker, start + len(start_marker))
    return content[start:end]


class TestConsultarAtletaPorCpfAuthHeader:
    """Regression guard: Authorization header must be present in fetch."""

    def test_consultar_atleta_por_cpf_usa_fetch_com_authorization_bearer(self):
        body = _read_app_js()
        # Locate the consultar function (or the broader consultarAtletaPorCpf).
        # Match the literal that ships in production today.
        slice_ = _slice(body, 'async function consultarAtletaPorCpf')
        assert "Authorization" in slice_, (
            'consultarAtletaPorCpf must send an Authorization header - '
            'removing it triggers UNAUTHORIZED_NO_AUTH_HEADER at the gateway.'
        )
        assert re.search(
            r"'Authorization'\s*:\s*`Bearer\s+\$\{SUPABASE_ANON_KEY\}`",
            slice_,
        ), (
            "Authorization header must be `Bearer ${SUPABASE_ANON_KEY}`. "
            "If SUPABASE_ANON_KEY was renamed, update this assertion AND the live portal pattern."
        )