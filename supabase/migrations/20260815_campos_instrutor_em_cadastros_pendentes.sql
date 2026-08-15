-- Migration: adiciona colunas de instrutor em ``cadastros_pendentes``
-- para que o INSERT do frontend (direto na tabela, via RLS anon)
-- aceite o payload do instrutor.
--
-- O frontend grava primeiro em ``cadastros_pendentes`` (fila de
-- análise); depois a Secretaria move os aprovados para
-- ``public.instrutores``. Ambas as tabelas precisam ter as mesmas
-- colunas de instrutor (mesmo princípio do atleta: ``alunos`` e
-- ``cadastros_pendentes`` têm colunas equivalentes).
--
-- Idempotente.

ALTER TABLE public.cadastros_pendentes
    ADD COLUMN IF NOT EXISTS formacao             text,
    ADD COLUMN IF NOT EXISTS nucleo               text,
    ADD COLUMN IF NOT EXISTS doc_instrutor_url    text;

-- ``nucleo`` tem a mesma CHECK constraint de ``public.instrutores``
-- (NEC / INEC / AMBOS). Idempotente.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cadastros_pendentes_nucleo_check'
    ) THEN
        ALTER TABLE public.cadastros_pendentes
            ADD CONSTRAINT cadastros_pendentes_nucleo_check
            CHECK (nucleo IS NULL OR nucleo IN ('NEC', 'INEC', 'AMBOS'));
    END IF;
END $$;
