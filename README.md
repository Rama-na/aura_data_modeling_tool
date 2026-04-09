# Schema Transformer

AI-powered SQL Server → Star Schema / Microsoft Fabric tool.

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in your Azure OpenAI + Redis credentials
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Redis

```bash
redis-server  # or: docker run -p 6379:6379 redis:alpine
```

## Architecture

- **Backend**: FastAPI + CrewAI agents + Azure OpenAI (GPT-4o)
- **Frontend**: React 19 + Vite + Tailwind v4 + Zustand
- **Session state**: Redis
- **File storage**: Local `uploads/` and `outputs/` directories

## The Six Agents

| # | Agent | Type | Purpose |
|---|---|---|---|
| 1 | Schema Parser | Deterministic | Parses CSV files into structured schema |
| 2 | Relation Mapper | LLM | Infers implicit FK relationships |
| 3 | Domain Classifier | LLM | Classifies tables as fact / dimension / ignore |
| 4 | Schema Designer | LLM | Designs the full star schema |
| 5 | ER Generator | LLM | Generates Mermaid erDiagram + data dictionary |
| 6 | Notebook Writer | LLM | Generates PySpark .ipynb notebooks per domain |

## Refinement Loop

After the initial ER diagram is shown, the user can:
1. Add a comment describing changes → "Refine Model"
2. The pipeline re-runs Agents 4+5 → a new iteration is created
3. Repeat until satisfied
4. Click "Generate Notebooks →" to run Agent 6

Each iteration is stored immutably in Redis with full input snapshots for debugging.
