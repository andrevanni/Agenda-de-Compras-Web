"""Espelho em Python do array VERSOES de frontend/script_state.js.

Mantenha SINCRONIZADO com o JS — toda nova entrada precisa ser adicionada
nos DOIS arquivos. O endpoint /api/v1/admin/versoes-list serve esta lista
para o painel admin (que usa pra disparar notificações por email).

NUNCA citar nome real de cliente, fornecedor ou pessoa nas notas.
"""

VERSOES = [
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
