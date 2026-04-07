from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.admin_clientes import (
    ClienteAdminCreateRequest,
    ClienteAdminDetalhe,
    ClienteAdminResumo,
    ClienteAdminUpdateRequest,
)


def listar_clientes(db: Session) -> list[ClienteAdminResumo]:
    rows = db.execute(
        text(
            """
            select
              t.id::text as id,
              t.nome,
              t.slug,
              t.status,
              t.plano,
              t.contato_nome,
              t.contato_email,
              t.created_at,
              t.updated_at,
              (
                select count(*)
                from compradores c
                where c.tenant_id = t.id
              ) as total_compradores,
              (
                select count(*)
                from fornecedores f
                where f.tenant_id = t.id
              ) as total_fornecedores,
              (
                select count(*)
                from agenda_ocorrencias ao
                where ao.tenant_id = t.id
                  and ao.status = 'PENDENTE'
              ) as total_pendencias
            from tenants t
            order by t.nome
            """
        )
    ).mappings().all()
    return [ClienteAdminResumo(**row) for row in rows]


def obter_cliente(db: Session, tenant_id: str) -> ClienteAdminDetalhe:
    row = db.execute(
        text(
            """
            select
              t.id::text as id,
              t.nome,
              t.slug,
              t.status,
              t.plano,
              t.contato_nome,
              t.contato_email,
              t.observacoes,
              t.created_at,
              t.updated_at,
              (
                select count(*)
                from compradores c
                where c.tenant_id = t.id
              ) as total_compradores,
              (
                select count(*)
                from fornecedores f
                where f.tenant_id = t.id
              ) as total_fornecedores,
              (
                select count(*)
                from agenda_ocorrencias ao
                where ao.tenant_id = t.id
                  and ao.status = 'PENDENTE'
              ) as total_pendencias
            from tenants t
            where t.id = cast(:tenant_id as uuid)
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().first()

    if not row:
        raise ValueError("Cliente nao encontrado.")

    return ClienteAdminDetalhe(**row)


def criar_cliente(db: Session, payload: ClienteAdminCreateRequest) -> ClienteAdminDetalhe:
    existente = db.execute(
        text(
            """
            select id
            from tenants
            where slug = :slug
            limit 1
            """
        ),
        {"slug": payload.slug},
    ).first()
    if existente:
        raise ValueError("Ja existe um cliente com esse slug.")

    row = db.execute(
        text(
            """
            insert into tenants (
              nome,
              slug,
              status,
              plano,
              contato_nome,
              contato_email,
              observacoes
            )
            values (
              :nome,
              :slug,
              :status,
              :plano,
              :contato_nome,
              :contato_email,
              :observacoes
            )
            returning id::text as id
            """
        ),
        payload.model_dump(),
    ).mappings().first()
    db.commit()
    return obter_cliente(db, row["id"])


def atualizar_cliente(db: Session, tenant_id: str, payload: ClienteAdminUpdateRequest) -> ClienteAdminDetalhe:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise ValueError("Nenhum campo informado para atualizacao.")

    if "slug" in updates:
        existente = db.execute(
            text(
                """
                select id::text as id
                from tenants
                where slug = :slug
                  and id <> cast(:tenant_id as uuid)
                limit 1
                """
            ),
            {"slug": updates["slug"], "tenant_id": tenant_id},
        ).mappings().first()
        if existente:
            raise ValueError("Ja existe um cliente com esse slug.")

    sets = [f"{campo} = :{campo}" for campo in updates]
    sets.append("updated_at = now()")
    params = {"tenant_id": tenant_id, **updates}

    result = db.execute(
        text(
            f"""
            update tenants
            set {", ".join(sets)}
            where id = cast(:tenant_id as uuid)
            """
        ),
        params,
    )

    if result.rowcount == 0:
        db.rollback()
        raise ValueError("Cliente nao encontrado.")

    db.commit()
    return obter_cliente(db, tenant_id)
