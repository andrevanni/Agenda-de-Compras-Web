# Projeto: Auditoria Ativa com IA

## Objetivo

Evoluir a auditoria atual da Agenda de Compras Web para uma camada ativa, preditiva e explicavel, sem remover o que ja existe hoje.

A nova auditoria deve:

- preservar os indicadores, filtros e agrupamentos atuais
- produzir alertas operacionais acionaveis
- gerar recomendacoes priorizadas por comprador, fornecedor e tenant
- explicar o motivo de cada conclusao
- ajudar o cliente a agir antes do problema aparecer na operacao

## Base atual do projeto

Hoje o sistema ja possui uma fundacao importante:

- Supabase como base multi-tenant
- `agenda_ocorrencias` como trilha principal de eventos
- auditoria por periodo, comprador e eventos tratados
- resumo sintetico e bloco de recomendacoes no frontend
- backend Python com FastAPI e acesso SQL ao PostgreSQL

## Leitura do estado atual

O que a auditoria atual faz bem:

- mostra eventos do periodo
- consolida metricas como cumpridas, postergadas, aumentos e reducoes
- organiza leitura por comprador
- entrega uma primeira camada gerencial no proprio portal

O que ainda limita valor percebido pelo cliente:

- a recomendacao ainda e majoritariamente baseada em regras locais e texto fixo
- nao existe pontuacao de risco por fornecedor ou comprador
- nao existe previsao de pressao de estoque, reincidencia de postergação ou desvio operacional
- nao ha trilha de recomendacao com prioridade, impacto esperado e proxima acao sugerida
- a auditoria reage ao historico; ela ainda nao atua como copiloto da operacao

## Visao de produto

Transformar a auditoria em quatro camadas complementares:

### 1. Auditoria descritiva

Manter o que ja existe:

- filtros por periodo
- KPIs de eventos
- agrupamento por comprador
- detalhamento por fornecedor e historico

### 2. Auditoria diagnostica

Responder "por que isso aconteceu?":

- fornecedores com maior recorrencia de postergação
- compradores com maior carga critica
- combinacoes de fornecedor + frequencia + dia de compra que mais geram ajuste
- comparacao entre parametro base, parametro ajustado e lead time

### 3. Auditoria preditiva

Responder "o que tende a acontecer?":

- risco de novo aumento de parametro
- risco de atraso por fornecedor
- tendencia de instabilidade por comprador
- previsao de concentracao de agendas criticas na semana seguinte

### 4. Auditoria prescritiva

Responder "o que fazer agora?":

- recomendar aumento estrutural do parametro base
- sugerir revisao de lead time
- redistribuir carteira entre compradores
- revisar frequencia e dias de compra de fornecedores reincidentes
- abrir plano de acao para o cliente com prioridade e justificativa

## Arquitetura recomendada

### Camada 1: dados operacionais

Manter as tabelas atuais e ampliar a qualidade do evento auditavel.

Campos e derivacoes recomendados para `agenda_ocorrencias` ou para uma view analitica:

- `tipo_evento_auditavel`
- `dias_postergacao`
- `dias_antecipacao`
- `incremento_parametro_dias`
- `ajuste_proxima_data_dias`
- `lead_time_vigente`
- `frequencia_vigente`
- `dias_compra_vigentes`
- `motivo_operacional`
- `canal_origem`
- `usuario_responsavel`
- `criticidade_evento`

### Camada 2: mart analitico no Supabase

Criar views e materialized views para nao deixar a inteligencia depender do frontend:

- `vw_auditoria_eventos`
- `vw_auditoria_fornecedor`
- `vw_auditoria_comprador`
- `mv_auditoria_diaria`
- `mv_risco_fornecedor`
- `mv_risco_comprador`

Essa camada deve entregar:

- features prontas para ranking
- historico consolidado por janela de tempo
- base unica para dashboard, IA e futuras APIs

### Camada 3: motor de recomendacao

Separar em dois trilhos:

- trilho deterministico
- trilho probabilistico

Trilho deterministico:

- regras de negocio explicaveis
- thresholds por tenant
- alertas do tipo "3 postergações nos ultimos 30 dias"
- recomendacoes objetivas e auditaveis

Trilho probabilistico:

- score de risco por fornecedor
- score de sobrecarga por comprador
- score de instabilidade operacional
- tendencia de aumento de parametro e atraso futuro

### Camada 4: IA generativa explicativa

Usar IA generativa apenas depois da camada estruturada estar pronta.

A IA deve:

- resumir fatos, nao inventar fatos
- converter achados estruturados em linguagem executiva
- propor plano de acao por prioridade
- adaptar tom para comprador, gestor e dono do cliente

## Stack tecnica recomendada

### O que eu recomendo adotar

#### 1. Polars

Uso recomendado:

- engenharia de features
- agregacoes mais pesadas
- preparacao de datasets para modelos e relatorios

Motivo:

- excelente desempenho para transformacoes tabulares
- boa aderencia a pipelines analiticos em Python

#### 2. DuckDB

Uso recomendado:

- laboratorio analitico local
- validacao rapida de hipoteses
- consolidacao de snapshots e datasets historicos

Motivo:

- SQL muito forte para exploracao analitica
- ideal para prototipar sem criar peso operacional no app transacional

#### 3. scikit-learn

Uso recomendado:

- baseline de classificacao de risco
- clusterizacao de fornecedores
- deteccao de anomalias simples

Motivo:

- stack madura
- boa para comecar com modelos pequenos e explicaveis

#### 4. OpenAI API

Uso recomendado:

- gerar conclusoes executivas
- transformar achados estruturados em recomendacoes praticas
- priorizar plano de acao
- criar camada de copiloto gerencial

Motivo:

- excelente para raciocinio e sintese profissional
- bom encaixe para explainability quando a entrada e estruturada

#### 5. Supabase Edge Functions

Uso recomendado:

- disparo agendado de analises
- rotinas de fechamento diario
- processamento de alertas e resumos por tenant

Motivo:

- aproxima a inteligencia da base atual
- reduz dependencia de infraestrutura separada nas fases iniciais

### O que eu nao recomendo entrar no inicio

- stack pesada de MLOps
- modelo custom treinado do zero
- RAG sem problema real de busca semantica
- vetorizar tudo antes de estruturar os dados

## Backlog funcional recomendado

### Fase 1: fortalecer a trilha auditavel

- padronizar taxonomia dos eventos
- enriquecer observacoes com metadados estruturados
- criar views analiticas no Supabase
- registrar motivo de ajuste e tipo de decisao operacional

Entrega:

- auditoria atual mais confiavel
- base pronta para recomendacao de verdade

### Fase 2: auditoria ativa por regras

- score de risco por fornecedor
- score de pressao por comprador
- alertas de reincidencia
- recomendacoes deterministicas com justificativa
- ranking de prioridades da semana

Entrega:

- primeira versao comercial forte
- ganho real de valor sem dependencia de IA generativa

### Fase 3: auditoria preditiva

- modelo simples de propensao a postergação
- modelo de tendencia de aumento de parametro
- previsao semanal de concentracao critica
- deteccao de comportamento fora do padrao

Entrega:

- auditoria passa a antecipar risco

### Fase 4: IA executiva e copiloto gerencial

- resumo automatico por tenant
- conclusoes por comprador e fornecedor
- plano de acao sugerido
- narrativa adaptada para gestor
- destaque de oportunidade, risco e impacto financeiro estimado

Entrega:

- auditoria premium
- experiencia acima da expectativa do cliente

## Casos de uso que realmente elevam o produto

### 1. Radar de fornecedores em deterioracao

Exemplo de saida:

- fornecedor com 4 ajustes nos ultimos 21 dias
- tendencia de aumento de parametro
- recomendacao: revisar parametro base e lead time em ate 48h

### 2. Mapa de sobrecarga por comprador

Exemplo de saida:

- comprador com crescimento de eventos criticos acima da media da carteira
- recomendacao: redistribuir 12 fornecedores de baixa recorrencia

### 3. Agenda da proxima semana com risco antecipado

Exemplo de saida:

- previsao de concentracao em dois dias especificos
- recomendacao: antecipar tratativas de fornecedores com maior risco

### 4. Relatorio executivo mensal

Exemplo de saida:

- o que piorou
- o que melhorou
- onde agir
- qual ganho esperado se o plano for executado

## Regras de ouro para nao decepcionar o cliente

- toda recomendacao precisa mostrar evidencia
- toda conclusao precisa apontar a proxima acao
- IA nunca deve substituir as regras criticas do negocio
- score sem explicacao reduz confianca
- recomendacao sem prioridade vira texto bonito sem uso

## Sugestao de implementacao no projeto atual

### Backend

Criar novos modulos:

- `backend/app/services/auditoria_ativa_service.py`
- `backend/app/services/auditoria_features_service.py`
- `backend/app/services/auditoria_recomendacao_service.py`
- `backend/app/services/auditoria_ai_service.py`

Criar novos endpoints:

- `GET /api/v1/auditoria/resumo`
- `GET /api/v1/auditoria/riscos`
- `GET /api/v1/auditoria/recomendacoes`
- `GET /api/v1/auditoria/compradores/{id}`
- `GET /api/v1/auditoria/fornecedores/{id}`

### Banco

Criar scripts SQL novos para:

- view de eventos enriquecidos
- materialized views de risco
- tabela de configuracao de thresholds por tenant
- tabela de snapshots gerenciais

### Frontend

Sem remover a auditoria atual, adicionar:

- bloco "Prioridades da semana"
- bloco "Risco por fornecedor"
- bloco "Risco por comprador"
- bloco "Plano de acao recomendado"
- bloco "Conclusao executiva"

## ROI esperado

Se bem implementada, essa evolucao muda o produto de:

- painel que mostra historico

para:

- sistema que orienta decisao, antecipa risco e ajuda o cliente a operar melhor

Esse salto aumenta valor percebido, reduz comoditizacao e cria argumento comercial premium.

## Recomendacao final

A melhor estrategia nao e comecar pela IA generativa.

A melhor estrategia e:

1. estruturar eventos e features
2. criar recomendacao deterministica forte
3. adicionar score preditivo simples
4. usar IA para explicar, priorizar e transformar analise em plano de acao

Assim, a auditoria fica mais inteligente sem perder confianca, rastreabilidade e aderencia ao negocio.
