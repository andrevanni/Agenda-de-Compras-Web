"""Espelho em Python do array VERSOES de frontend/script_state.js.

Mantenha SINCRONIZADO com o JS — toda nova entrada precisa ser adicionada
nos DOIS arquivos. O endpoint /api/v1/admin/versoes-list serve esta lista
para o painel admin (que usa pra disparar notificações por email).

NUNCA citar nome real de cliente, fornecedor ou pessoa nas notas.
"""

VERSOES = [
    {
        "versao": "v69",
        "dataHora": "10/07/2026 — tarde",
        "notas": [
            "Novo relatório semanal por e-mail para gestores, toda segunda de manhã.",
            "Ele consolida a semana útil anterior (segunda a sexta) num PDF com dois panoramas: a Agenda de Compras (realizadas, atrasadas, pedidos, valor e taxa de pedido) e as Outras Atividades (tarefas gerais: concluídas, pendentes, atrasadas e taxa de conclusão).",
            "Traz tabelas por comprador e por categoria, além de gráficos, para acompanhar o desempenho da equipe na semana.",
            "Vai para os mesmos destinatários do relatório diário; gestores recebem o consolidado de todos os compradores.",
        ],
    },
    {
        "versao": "v68",
        "dataHora": "10/07/2026 — tarde",
        "notas": [
            "Novidade na Auditoria: agora ela tem duas abas — \"Agenda de Compras\" (a de sempre) e a nova \"Outras Atividades\".",
            "A aba \"Outras Atividades\" dá uma visão gerencial das tarefas que não são de fornecedores (os compromissos gerais da operação): total, concluídas, pendentes, atrasadas e a taxa de conclusão.",
            "Traz gráficos por categoria, por comprador (mostrando o status de cada um) e a evolução de tarefas concluídas por semana — ótimo para acompanhar a produtividade da equipe.",
            "Permite abrir o detalhe por comprador e por categoria até cada tarefa, e exportar tudo para Excel para relatórios e reuniões.",
            "Fica no mesmo lugar e com a mesma senha da Auditoria; a aba de fornecedores continua exatamente igual.",
        ],
    },
    {
        "versao": "v67",
        "dataHora": "26/06/2026 — manhã",
        "notas": [
            "Agenda de Compras: ao tratar uma agenda muito antes da data prevista, o sistema agora pede uma confirmação antes de prosseguir.",
            "O aviso mostra quantos dias faltam para a data prevista, para qual data a próxima agenda será gerada e qual será o novo parâmetro de compra — assim fica claro o efeito de tratar adiantado.",
            "Objetivo: evitar que um fornecedor seja tratado cedo demais por engano e acabe não aparecendo para revisão no período seguinte. Antecipações pequenas continuam passando direto, sem interrupção.",
        ],
    },
    {
        "versao": "v65",
        "dataHora": "25/06/2026 — tarde",
        "notas": [
            "Eficiência da Agenda: o período passa a ser 90 dias por padrão, com opções de 30, 60, 90, 120 e 180 dias (ou entre datas).",
            "Correção no indicador '% no ritmo': agora considera TODOS os fornecedores do comprador (antes ignorava os sem pedido e os com poucos dados, o que podia mostrar 100% indevidamente). A tabela e o resumo passam a exibir a fração (ex.: 2 de 6).",
            "Fornecedor com apenas 1 pedido num período em que deveria ter vários agora é classificado como 'Abaixo do esperado' (antes ficava como 'Dados limitados').",
        ],
    },
    {
        "versao": "v64",
        "dataHora": "25/06/2026 — tarde",
        "notas": [
            "Eficiência da Agenda — análise reformulada: agora valida se a frequência de cada fornecedor está realmente funcionando, comparando o intervalo real entre os pedidos com o intervalo que a frequência determina (semanal = a cada 7 dias, quinzenal = 14, mensal = 28, etc.).",
            "Cada fornecedor mostra a frequência cadastrada, o intervalo real × alvo e um status: No ritmo, Abaixo do esperado (pedidos mais espaçados que o previsto — acima de 10% já alerta, pois o estoque de segurança não cobre), Acima do esperado, Vencido (passou do prazo sem novo pedido) ou Sem pedido.",
            "Fornecedores com baixa conversão (agenda gerada mas sem pedido) também são sinalizados, pois indicam que a frequência pode não estar funcionando.",
            "Quando o ritmo real difere do cadastrado, o sistema sugere a frequência mais adequada.",
        ],
    },
    {
        "versao": "v63",
        "dataHora": "25/06/2026 — tarde",
        "notas": [
            "Correção: em alguns acessos o portal abria sem carregar os dados (compradores, fornecedores, calendário) por causa da ordem de carregamento dos arquivos do novo menu Eficiência — resolvido.",
            "O número da versão atual agora aparece no rodapé do portal (antes mostrava sempre 'versão inicial').",
            "Melhoria técnica: as atualizações do app passam a chegar automaticamente, sem precisar limpar o cache do navegador.",
        ],
    },
    {
        "versao": "v60",
        "dataHora": "25/06/2026 — tarde",
        "notas": [
            "Auditoria da Operação: corrigido um problema em que compromissos genéricos concluídos (sem fornecedor) apareciam na 'Auditoria por comprador' como 'Fornecedor não localizado', inflando a contagem de eventos. A Auditoria volta a considerar apenas a Agenda de Compras.",
        ],
    },
    {
        "versao": "v59",
        "dataHora": "25/06/2026 — tarde",
        "notas": [
            "Novo menu 📈 Eficiência da Agenda (disponível para todos os usuários): avalia se a Agenda de Compras está funcionando bem.",
            "Destaca fornecedores em que a frequência cadastrada não condiz com a realidade — ex.: configurado para gerar pedido toda semana mas, na prática, só rende pedido 3 vezes no mês — e já sugere a frequência mais adequada.",
            "Mostra a taxa de conversão (quantas agendas viraram pedido), o valor médio dos pedidos e o quanto eles variam entre si, além do desvio entre a data programada e a data em que o pedido foi feito de fato.",
            "Tudo detalhado por comprador e por fornecedor, com a opção de abrir cada pedido individualmente, gráficos de pizza e colunas, e exportação para Excel.",
        ],
    },
    {
        "versao": "v58",
        "dataHora": "01/06/2026 — tarde",
        "notas": [
            "Ajuda do portal: a seção 'Fornecedores' agora explica a importância do campo Comprador — um fornecedor salvo sem comprador não aparece na lista (que abre filtrada por comprador) e parece ter sumido, e o mesmo código não pode ser recriado ('já existe cadastrado'); nesse caso, use 'Mostrar todos', edite o registro e reatribua o comprador.",
        ],
    },
    {
        "versao": "v57",
        "dataHora": "01/06/2026 — manhã",
        "notas": [
            "Fornecedores: ao editar um fornecedor, o comprador selecionado agora é sempre preservado ao salvar. Foi reportado que, em algumas situações, o cadastro podia ser salvo sem comprador sem aviso — fazendo o fornecedor desaparecer da lista (que abre filtrada por comprador) e impedir a recriação com o mesmo código ('já existe cadastrado').",
            "Como rede de segurança, ao salvar um fornecedor que tinha comprador e ficar sem nenhum selecionado, o sistema agora pede confirmação antes de tirá-lo da carteira.",
        ],
    },
    {
        "versao": "v56",
        "dataHora": "29/05/2026 — manhã",
        "notas": [
            "Cadastro de compradores: os textos das opções de notificação por e-mail ficaram mais claros. Agora explicam que marcar 'Gestor' apenas amplia o conteúdo do relatório (mostra todos os compradores), enquanto são as opções 'Receber e-mail' que de fato ligam o envio — basta marcar ao menos uma delas para a pessoa passar a receber o relatório diário.",
            "Ajuda do portal: a seção 'Compradores — Cadastro e Acesso' ganhou uma explicação sobre as notificações por e-mail do relatório diário.",
        ],
    },
    {
        "versao": "v53",
        "dataHora": "28/05/2026 — tarde",
        "notas": [
            "Fornecedores: a tela agora abre por padrão mostrando apenas os fornecedores do comprador ativo. Para ver a base completa, basta clicar em 'Mostrar todos' ao lado do campo de busca.",
        ],
    },
    {
        "versao": "v52",
        "dataHora": "28/05/2026 — manhã",
        "notas": [
            "Novo (painel admin): botão '🔑 Trocar senha' no topo permite que o administrador logado altere a própria senha sem precisar de reset por SQL.",
        ],
    },
    {
        "versao": "v51",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Novo (painel admin): seção 'Notas de Versão' permite cadastrar destinatários e enviar o changelog de cada versão por email.",
        ],
    },
    {
        "versao": "v50",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Novo: menu 'Versões' na barra lateral com o histórico das mudanças do sistema.",
        ],
    },
    {
        "versao": "v49",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Atualização do menu de Ajuda cobrindo as novas funcionalidades de Painel de Notas, Compromissos e edição de série recorrente no Calendário.",
        ],
    },
    {
        "versao": "v48",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Novo: botões ✓ Concluir e ↩ Desfazer em Compromissos.",
            "Novo: toggle 'Mostrar concluídos' no topo da seção Compromissos.",
            "Novo: compromissos concluídos aparecem riscados no calendário (com ✓ no título e cor mais clara).",
        ],
    },
    {
        "versao": "v47",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Correção: o calendário e a lista de pendências agora atualizam imediatamente após tratar uma agenda — sem precisar fechar e reabrir a tela.",
        ],
    },
    {
        "versao": "v46",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Novo: post-it livre direto no Painel de Notas (botão '+ Nova nota').",
            "Edição inline ao clicar no card: blur ou Ctrl+Enter salva, Esc descarta, texto vazio exclui.",
            "Coexiste com a nota de ocorrência (a antiga, que fica grudada num compromisso).",
        ],
    },
    {
        "versao": "v45",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Correção: novo botão '💾 Salvar nota' no modal de detalhe da Agenda — agora é possível registrar a nota sem precisar tratar a agenda.",
            "A correção vale também para corrigir a nota de uma agenda já tratada.",
        ],
    },
    {
        "versao": "v44",
        "dataHora": "27/05/2026 — tarde",
        "notas": [
            "Novo: edição e exclusão de série de recorrência em massa.",
            "Ao editar um evento que pertence a uma série, aparece o seletor 'Aplicar mudanças a' com três opções: Só esta / Esta e as próximas / Toda a série (com a contagem ao lado).",
            "Em massa muda: título, horário, categoria e observação. Não muda: data, nota e comprador (esses ficam preservados em cada ocorrência).",
        ],
    },
]
