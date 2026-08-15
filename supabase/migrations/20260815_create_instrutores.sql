-- Migration: adiciona colunas faltantes em `instrutores` para suportar
-- o pré-cadastro de instrutor.
--
-- Schema original (fornecido pelo usuário):
--   id, nome, rg, cpf, data_nascimento, endereco, telefone, formacao,
--   modalidades, nucleo (NEC/INEC/AMBOS), data_admissao, foto_url
--
-- O frontend envia mais campos do que existem hoje. Esta migration
-- adiciona colunas para cobrir email, telefone já existente (re-confirma),
-- período, endereço decomposto (rua/numero/bairro/cidade/cep) e o
-- documento do instrutor.
--
-- Idempotente — cada ``ADD COLUMN IF NOT EXISTS`` é seguro re-executar.

ALTER TABLE public.instrutores
    ADD COLUMN IF NOT EXISTS email              text,
    ADD COLUMN IF NOT EXISTS periodo            text,
    ADD COLUMN IF NOT EXISTS rua                text,
    ADD COLUMN IF NOT EXISTS numero             text,
    ADD COLUMN IF NOT EXISTS bairro             text,
    ADD COLUMN IF NOT EXISTS cidade             text,
    ADD COLUMN IF NOT EXISTS cep                text,
    ADD COLUMN IF NOT EXISTS doc_instrutor_url  text;

-- ``cpf`` já existe como nullable; garantimos unicidade para a Edge
-- poder buscar pelo par (cpf). Idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS instrutores_cpf_key
    ON public.instrutores (cpf)
    WHERE cpf IS NOT NULL;

-- RLS já existe (a tabela é servida internamente). A Edge Function usa
-- service-role que bypassa RLS, então nenhuma policy pública é necessária
-- aqui. Mantemos o índice e as novas colunas apenas.

-- Trigger ``updated_at`` — espelha padrão do SGE. Se já existir
-- trigger, IF NOT EXISTS evita erro.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'instrutores_set_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION public.set_updated_at()
        RETURNS trigger AS $func$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;

        CREATE TRIGGER instrutores_set_updated_at
            BEFORE UPDATE ON public.instrutores
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;
