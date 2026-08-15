-- Migration: adiciona coluna discriminadora `tipo` em `cadastros_pendentes`
-- para suportar pré-cadastro de instrutor na mesma tabela.
--
-- Pré-requisito: rodar via Supabase CLI (`supabase db push`) ou colar no
-- SQL Editor do Dashboard. Idempotente — pode rodar mais de uma vez sem
-- efeito colateral após a primeira execução.
--
-- Compatibilidade: registros existentes recebem `tipo = 'atleta'` (default).
-- A coluna é NOT NULL com CHECK restrito aos dois valores conhecidos;
-- qualquer outro valor será rejeitado pelo banco.

ALTER TABLE public.cadastros_pendentes
    ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'atleta';

-- CHECK só pode ser adicionado uma vez — IF NOT EXISTS evita erro em
-- re-execuções. PostgreSQL não tem "ADD CONSTRAINT IF NOT EXISTS" antes
-- do PG 16 com sintaxe específica, então usamos DO $$ ... $$.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cadastros_pendentes_tipo_check'
    ) THEN
        ALTER TABLE public.cadastros_pendentes
            ADD CONSTRAINT cadastros_pendentes_tipo_check
            CHECK (tipo IN ('atleta', 'instrutor'));
    END IF;
END $$;

-- Opcional mas recomendado: índice por (tipo, cpf) para acelerar
-- buscas da Edge Function (consulta por cpf filtrada por tipo).
CREATE INDEX IF NOT EXISTS cadastros_pendentes_tipo_cpf_idx
    ON public.cadastros_pendentes (tipo, cpf);

-- Atualiza RLS anon_insert_cadastros_pendentes para aceitar 'instrutor'.
-- A policy original provavelmente tem WITH CHECK parecido com:
--   WITH CHECK ( length(protocolo) = 36 )
-- Não precisa mudar nada — protocolo continua sendo UUIDv4.
-- Mas se houver CHECK de algum campo específico de atleta (ex:
-- exigir cpf_responsavel), ajustar aqui para liberar instrutor.
-- Exemplo seguro (substitui policy existente):
--
-- DROP POLICY IF EXISTS anon_insert_cadastros_pendentes
--     ON public.cadastros_pendentes;
-- CREATE POLICY anon_insert_cadastros_pendentes
--     ON public.cadastros_pendentes
--     FOR INSERT
--     TO anon
--     WITH CHECK (
--         length(protocolo) = 36
--         AND tipo IN ('atleta', 'instrutor')
--         AND (
--             (tipo = 'atleta'   AND cpf_responsavel IS NOT NULL)
--             OR
--             (tipo = 'instrutor' AND cpf_responsavel IS NULL)
--         )
--     );
