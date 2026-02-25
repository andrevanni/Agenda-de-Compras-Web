from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agenda import (
    AgendaItem,
    AgendaSugestaoResponse,
    AgendaTratarRequest,
    AgendaTratarResponse,
)

DIAS_SEMANA_ORDEM = [
    "SEGUNDA",
    "TERCA",
    "QUARTA",
    "QUINTA",
    "SEXTA",
    "SABADO",
    "DOMINGO",
]
DIAS_PYTHON = {nome: idx for idx, nome in enumerate(DIAS_SEMANA_ORDEM)}
DIAS_POR_FREQUENCIA = {1: 1, 2: 1, 4: 1, 8: 2, 12: 3}
INTERVALO_DIAS_FREQUENCIA = {1: 28, 2: 14, 4: 7}


def listar_proximas(db: Session, tenant_id: str, data_inicio: date, data_fim: date) -> list[AgendaItem]:
    query = text(
        """
        select
          ao.id::text as id,
          ao.fornecedor_id::text as fornecedor_id,
          f.codigo_fornecedor,
          f.nome_fornecedor,
          coalesce(c.nome_comprador, 'Sem Comprador') as comprador,
          ao.data_prevista,
          ao.status,
          (
            select string_agg(fd.dia_semana, ', ' order by
              case fd.dia_semana
                when 'SEGUNDA' then 1
                when 'TERCA' then 2
                when 'QUARTA' then 3
                when 'QUINTA' then 4
                when 'SEXTA' then 5
                when 'SABADO' then 6
                when 'DOMINGO' then 7
              end
            )
            from fornecedor_dias_compra fd
            where fd.fornecedor_id = f.id and fd.tenant_id = ao.tenant_id
          ) as dias_compra
        from agenda_ocorrencias ao
        join fornecedores f on f.id = ao.fornecedor_id and f.tenant_id = ao.tenant_id
        left join compradores c on c.id = ao.comprador_id and c.tenant_id = ao.tenant_id
        where ao.tenant_id = :tenant_id::uuid
          and ao.status = 'PENDENTE'
          and ao.data_prevista between :data_inicio and :data_fim
        order by ao.data_prevista, comprador, f.nome_fornecedor
        """
    )
    rows = db.execute(
        query,
        {
            "tenant_id": tenant_id,
            "data_inicio": data_inicio,
            "data_fim": data_fim,
        },
    ).mappings().all()
    return [AgendaItem(**row) for row in rows]


def listar_atrasadas(db: Session, tenant_id: str, data_ref: date) -> list[AgendaItem]:
    query = text(
        """
        select
          ao.id::text as id,
          ao.fornecedor_id::text as fornecedor_id,
          f.codigo_fornecedor,
          f.nome_fornecedor,
          coalesce(c.nome_comprador, 'Sem Comprador') as comprador,
          ao.data_prevista,
          ao.status,
          null::text as dias_compra
        from agenda_ocorrencias ao
        join fornecedores f on f.id = ao.fornecedor_id and f.tenant_id = ao.tenant_id
        left join compradores c on c.id = ao.comprador_id and c.tenant_id = ao.tenant_id
        where ao.tenant_id = :tenant_id::uuid
          and ao.status = 'PENDENTE'
          and ao.data_prevista < :data_ref
        order by ao.data_prevista, comprador, f.nome_fornecedor
        """
    )
    rows = db.execute(query, {"tenant_id": tenant_id, "data_ref": data_ref}).mappings().all()
    return [AgendaItem(**row) for row in rows]


def _ordered_dias_semana(db: Session, tenant_id: str, fornecedor_id: str) -> list[str]:
    query = text(
        """
        select dia_semana
        from fornecedor_dias_compra
        where tenant_id = :tenant_id::uuid
          and fornecedor_id = :fornecedor_id::uuid
        order by case dia_semana
            when 'SEGUNDA' then 1
            when 'TERCA' then 2
            when 'QUARTA' then 3
            when 'QUINTA' then 4
            when 'SEXTA' then 5
            when 'SABADO' then 6
            when 'DOMINGO' then 7
        end
        """
    )
    rows = db.execute(query, {"tenant_id": tenant_id, "fornecedor_id": fornecedor_id}).fetchall()
    return [r[0] for r in rows]


def _validar_config_fornecedor(db: Session, tenant_id: str, fornecedor_id: str) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            select frequencia_revisao, comprador_id::text as comprador_id, data_primeiro_pedido
            from fornecedores
            where tenant_id = :tenant_id::uuid
              and id = :fornecedor_id::uuid
            """
        ),
        {"tenant_id": tenant_id, "fornecedor_id": fornecedor_id},
    ).mappings().first()

    if not row:
        raise ValueError("Fornecedor não encontrado para o tenant.")

    frequencia = row["frequencia_revisao"]
    comprador_id = row["comprador_id"]
    data_primeiro_pedido = row["data_primeiro_pedido"]

    if data_primeiro_pedido is None:
        raise ValueError("Fornecedor sem data_primeiro_pedido.")

    dias = _ordered_dias_semana(db, tenant_id, fornecedor_id)
    esperado = DIAS_POR_FREQUENCIA.get(frequencia)
    if esperado is None:
        raise ValueError(f"Frequência inválida: {frequencia}.")
    if len(dias) != esperado:
        raise ValueError(
            f"Configuração inválida: frequência {frequencia} exige {esperado} dia(s), mas possui {len(dias)}."
        )

    return {
        "frequencia": frequencia,
        "comprador_id": comprador_id,
        "dias_semana": dias,
        "data_primeiro_pedido": data_primeiro_pedido,
    }


def _proxima_data_no_calendario(data_base: date, dias_semana: list[str], incluir_base: bool) -> date:
    dias_alvo = {DIAS_PYTHON[d] for d in dias_semana}
    atual = data_base if incluir_base else data_base + timedelta(days=1)
    while atual.weekday() not in dias_alvo:
        atual += timedelta(days=1)
    return atual


def _proxima_data_por_frequencia(data_base: date, frequencia: int, dias_semana: list[str]) -> date:
    if frequencia in INTERVALO_DIAS_FREQUENCIA:
        return _proxima_data_no_calendario(
            data_base + timedelta(days=INTERVALO_DIAS_FREQUENCIA[frequencia]),
            dias_semana,
            incluir_base=True,
        )
    return _proxima_data_no_calendario(data_base, dias_semana, incluir_base=False)


def sugerir_proxima_data_ocorrencia(db: Session, tenant_id: str, ocorrencia_id: str) -> AgendaSugestaoResponse:
    row = db.execute(
        text(
            """
            select id::text as id, fornecedor_id::text as fornecedor_id, data_prevista, status
            from agenda_ocorrencias
            where tenant_id = :tenant_id::uuid
              and id = :ocorrencia_id::uuid
            """
        ),
        {"tenant_id": tenant_id, "ocorrencia_id": ocorrencia_id},
    ).mappings().first()

    if not row:
        raise ValueError("Ocorrência não encontrada.")
    if row["status"] != "PENDENTE":
        raise ValueError("Ocorrência não está pendente.")

    config = _validar_config_fornecedor(db, tenant_id, row["fornecedor_id"])
    sugerida = _proxima_data_por_frequencia(
        row["data_prevista"],
        config["frequencia"],
        config["dias_semana"],
    )
    return AgendaSugestaoResponse(proxima_data_sugerida=sugerida, dias_semana=config["dias_semana"])


def tratar_ocorrencia(db: Session, ocorrencia_id: str, payload: AgendaTratarRequest) -> AgendaTratarResponse:
    row = db.execute(
        text(
            """
            select id::text as id, fornecedor_id::text as fornecedor_id, data_prevista, status
            from agenda_ocorrencias
            where id = :ocorrencia_id::uuid
              and tenant_id = :tenant_id::uuid
            """
        ),
        {
            "ocorrencia_id": ocorrencia_id,
            "tenant_id": payload.tenant_id,
        },
    ).mappings().first()

    if not row:
        raise ValueError("Ocorrência não encontrada para o tenant.")
    if row["status"] != "PENDENTE":
        raise ValueError("Ocorrência não está pendente.")

    fornecedor_id = row["fornecedor_id"]
    data_prevista_atual = row["data_prevista"]
    config = _validar_config_fornecedor(db, payload.tenant_id, fornecedor_id)

    proxima_data_final = (
        payload.proxima_data
        if payload.proxima_data is not None
        else _proxima_data_por_frequencia(
            data_prevista_atual,
            config["frequencia"],
            config["dias_semana"],
        )
    )

    db.execute(
        text(
            """
            update agenda_ocorrencias
            set status = 'REALIZADA',
                data_realizacao = :data_realizacao,
                observacao = :observacao,
                updated_at = now()
            where id = :ocorrencia_id::uuid
              and tenant_id = :tenant_id::uuid
            """
        ),
        {
            "ocorrencia_id": ocorrencia_id,
            "tenant_id": payload.tenant_id,
            "data_realizacao": payload.data_realizacao,
            "observacao": payload.observacao,
        },
    )

    existe = db.execute(
        text(
            """
            select id::text as id
            from agenda_ocorrencias
            where tenant_id = :tenant_id::uuid
              and fornecedor_id = :fornecedor_id::uuid
              and data_prevista = :proxima_data
              and status = 'PENDENTE'
            limit 1
            """
        ),
        {
            "tenant_id": payload.tenant_id,
            "fornecedor_id": fornecedor_id,
            "proxima_data": proxima_data_final,
        },
    ).mappings().first()

    nova_ocorrencia_id = None
    if not existe:
        comprador_id = config["comprador_id"] or payload.comprador_id
        nova = db.execute(
            text(
                """
                insert into agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status)
                values (:tenant_id::uuid, :fornecedor_id::uuid, :comprador_id::uuid, :proxima_data, 'PENDENTE')
                returning id::text as id
                """
            ),
            {
                "tenant_id": payload.tenant_id,
                "fornecedor_id": fornecedor_id,
                "comprador_id": comprador_id,
                "proxima_data": proxima_data_final,
            },
        ).mappings().first()
        if nova:
            nova_ocorrencia_id = nova["id"]

    db.commit()

    return AgendaTratarResponse(
        ocorrencia_tratada_id=ocorrencia_id,
        fornecedor_id=fornecedor_id,
        proxima_data=proxima_data_final,
        nova_ocorrencia_id=nova_ocorrencia_id,
    )
