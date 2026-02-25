# Migração Desktop -> Web (Mapeamento)

## Tabelas do Desktop aproveitadas
- compradores
- fornecedores
- fornecedor_dias_compra
- agenda_ocorrencias
- regras_agenda_fornecedor

## Ajuste obrigatório para Web multi-cliente
- adicionar `tenant_id` em todas as tabelas de negócio
- aplicar isolamento por tenant (RLS no Supabase)

## Telas Desktop mapeadas para Web
- Login
- Agenda Próximas
- Agenda Atrasadas
- Agenda Detalhe + Tratar
- Fornecedores sem comprador
- Cadastro de compradores (listar/criar/editar/excluir)
- Cadastro de fornecedores (listar/criar/editar/excluir/importar CSV)

## Fluxos principais
1. Login do comprador
2. Geração de pendências (`gerar_agenda_inicial`)
3. Tratamento da agenda (`tratar_agenda`) criando próxima pendente
4. Consulta por período (`proximos`) e atrasados

## Regras de negócio críticas (do algoritmo atual)
- Frequências válidas: 1, 2, 4, 8, 12
- Quantidade de dias por frequência:
  - 1/2/4 => 1 dia
  - 8 => 2 dias
  - 12 => 3 dias
- Para frequência 1/2/4: intervalo fixo de 28/14/7 dias + ajuste para dia permitido
- Para frequência 8/12: próxima data por calendário em um dos dias configurados
- Nunca manter mais de uma pendência duplicada do mesmo fornecedor na mesma data

## Decisão de implementação Web
- Backend centraliza regra (não deixar só no frontend)
- Frontend chama API para sugerir e tratar agenda
- Banco Supabase com PostgreSQL e RLS
