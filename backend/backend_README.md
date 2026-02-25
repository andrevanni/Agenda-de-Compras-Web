# Backend - Agenda de Compras Web

## Executar local

```powershell
cd "C:\Users\andre\OneDrive\Área de Trabalho\Agenda de Compras Web\backend"
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

## Endpoints iniciais
- `GET /health`
- `GET /api/v1/agenda/proximas`
- `GET /api/v1/agenda/atrasadas`
- `GET /api/v1/agenda/{ocorrencia_id}/sugestao`
- `POST /api/v1/agenda/{ocorrencia_id}/tratar`

## Observação
`tratar` já foi portado com a lógica de criar próxima pendência (evitando duplicidade), alinhado ao desktop.
