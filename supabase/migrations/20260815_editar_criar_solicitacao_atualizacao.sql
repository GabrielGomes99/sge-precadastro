-- Migration: adapta ``criar_solicitacao_atualizacao`` para aceitar
-- ``p_tipo`` ('atleta' | 'instrutor'). Quando ``p_tipo='instrutor'``,
-- valida o cadastro em ``public.instrutores`` em vez de
-- ``public.alunos``, pula a checagem de ``cpf_responsavel`` e grava
-- ``instrutor_id`` no retorno.
--
-- A Edge Function ``validar-atleta`` foi atualizada para enviar
-- ``p_tipo`` (default 'atleta'). Para instrutor, omite
-- ``p_cpf_responsavel``.
--
-- Importante: este CREATE OR REPLACE assume que a função original já
-- existe. Se ela estiver em outro schema, ajustar o ``ALTER FUNCTION``
-- abaixo. Idempotente — re-executar substitui a definição.

CREATE OR REPLACE FUNCTION public.criar_solicitacao_atualizacao(
    p_cpf text,
    p_dados jsonb,
    p_arquivos jsonb,
    p_cpf_responsavel text DEFAULT NULL,
    p_tipo text DEFAULT 'atleta'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- ``aluno_row`` é usada só quando p_tipo='atleta'. Para instrutor,
  -- a row equivalente vem de ``instrutores``.
  aluno_row public.alunos%rowtype;
  instrutor_row public.instrutores%rowtype;
  solicitacao_id bigint;
  cpf_resp_normalizado text;
  cpf_normalizado text;
  eh_instrutor boolean := (coalesce(p_tipo, 'atleta') = 'instrutor');
begin
  if not public.eh_caller_confiavel() then
    raise exception using errcode = '42501', message = 'criacao_nao_autorizada';
  end if;

  cpf_normalizado := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if length(cpf_normalizado) <> 11 then
    raise exception using errcode = '22023', message = 'cpf_invalido';
  end if;

  -- Validação de cpf_responsavel: obrigatória só para atleta.
  if not eh_instrutor then
    if p_cpf_responsavel is null or btrim(p_cpf_responsavel) = '' then
      raise exception using errcode = '22023', message = 'cpf_responsavel_obrigatorio';
    end if;
    cpf_resp_normalizado := regexp_replace(coalesce(p_cpf_responsavel, ''), '\D', '', 'g');
    if length(cpf_resp_normalizado) <> 11 then
      raise exception using errcode = '22023', message = 'cpf_responsavel_invalido';
    end if;
  end if;

  if eh_instrutor then
    select i.* into instrutor_row
    from public.instrutores i
    where regexp_replace(coalesce(i.cpf, ''), '\D', '', 'g') = cpf_normalizado
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'instrutor_nao_encontrado';
    end if;

    insert into public.solicitacoes_atualizacao (
      instrutor_id, cpf, snapshot_anterior, dados_propostos,
      arquivos_propostos, tipo, status
    ) values (
      instrutor_row.id,
      cpf_normalizado,
      public.snapshot_instrutor_atualizacao(instrutor_row.id),
      coalesce(p_dados, '{}'::jsonb),
      coalesce(p_arquivos, '{}'::jsonb),
      'atualizacao',
      'pendente'
    ) returning id into solicitacao_id;

    return jsonb_build_object(
      'id', solicitacao_id,
      'status', 'pendente',
      'instrutor_id', instrutor_row.id
    );
  end if;

  -- Caminho atleta (preservado da versão original)
  select a.* into aluno_row
  from public.alunos a
  where regexp_replace(coalesce(a.cpf, ''), '\D', '', 'g') = cpf_normalizado
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'atleta_nao_encontrado';
  end if;

  if regexp_replace(coalesce(aluno_row.cpf_responsavel, ''), '\D', '', 'g') <> cpf_resp_normalizado then
    raise exception using errcode = 'P0002', message = 'atleta_nao_encontrado';
  end if;

  insert into public.solicitacoes_atualizacao (
    atleta_id, cpf, snapshot_anterior, dados_propostos,
    arquivos_propostos, tipo, status
  ) values (
    aluno_row.id,
    cpf_normalizado,
    public.snapshot_atleta_atualizacao(aluno_row.id),
    coalesce(p_dados, '{}'::jsonb),
    coalesce(p_arquivos, '{}'::jsonb),
    'atualizacao',
    'pendente'
  ) returning id into solicitacao_id;

  return jsonb_build_object(
    'id', solicitacao_id,
    'status', 'pendente',
    'atleta_id', aluno_row.id
  );
end;
$function$;
