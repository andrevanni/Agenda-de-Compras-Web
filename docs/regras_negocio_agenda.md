# Regras de Negócio (Agenda)

## Funções a portar do desktop
- `validar_config_fornecedor`
- `gerar_agenda_inicial`
- `sugerir_proxima_data_ocorrencia`
- `tratar_agenda`
- `listar_agenda_do_dia`
- `listar_atrasados`
- `listar_proximos`

## Contratos sugeridos de API
- `POST /api/v1/agenda/gerar-inicial`
- `GET /api/v1/agenda/proximas?inicio=YYYY-MM-DD&fim=YYYY-MM-DD`
- `GET /api/v1/agenda/atrasadas?data_ref=YYYY-MM-DD`
- `GET /api/v1/agenda/{ocorrencia_id}/sugestao`
- `POST /api/v1/agenda/{ocorrencia_id}/tratar`

## Regras para garantir consistência
- validação de frequência x dias antes de salvar fornecedor
- transação no tratar agenda (atualiza atual e cria próxima)
- idempotência para não duplicar pendência
- tudo filtrado por `tenant_id`
