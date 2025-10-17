# xCoS Dashboard - Complete System Audit

**Date:** 2025-10-17
**Purpose:** Comprehensive analysis of current functionality, tech stack, and usage patterns

---

## 🏗️ Tech Stack Overview

### **Backend Stack**

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Web Framework** | FastAPI | Latest | Modern async Python API framework with automatic OpenAPI docs |
| **Data Validation** | Pydantic | v2.x | Type-safe data models with automatic validation |
| **Constraint Solver** | CPMpy | Latest | Python interface to CP solvers (OR-Tools, MiniZinc, etc.) |
| **ASGI Server** | Uvicorn | Latest | High-performance async server for FastAPI |
| **Language** | Python | 3.11+ | Required for modern async features |

**Key Backend Dependencies:**
```python
# requirements.txt (inferred from code)
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.0.0
cpmpy>=0.9.0
python-multipart  # For file uploads (future)
```

**Why FastAPI?**
- Automatic OpenAPI/Swagger documentation
- Built-in request validation via Pydantic
- Native async support for scalability
- Type hints throughout (better IDE support)
- WebSocket support (for future real-time updates)

**Why CPMpy?**
- Pythonic constraint programming API
- Supports multiple solvers (OR-Tools, Gurobi, MiniZinc)
- Built-in explanation tools (MUS, MCS, stepwise)
- Active development, research-oriented
- Integrates with scientific Python ecosystem

---

### **Frontend Stack**

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **UI Framework** | React | 18.2.0 | Component-based UI with hooks |
| **Language** | TypeScript | 5.2.2 | Type safety for JavaScript |
| **Build Tool** | Vite | 5.0.8 | Fast dev server and optimized builds |
| **Styling** | Tailwind CSS | 3.4.18 | Utility-first CSS framework |
| **Icons** | Lucide React | 0.546.0 | Modern icon library |
| **HTTP Client** | Axios | 1.6.2 | Promise-based HTTP requests |
| **Notifications** | React Hot Toast | 2.6.0 | Toast notification system |
| **Utilities** | clsx, tailwind-merge | Latest | Conditional styling utilities |

**Key Frontend Dependencies:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.2",
    "lucide-react": "^0.546.0",
    "react-hot-toast": "^2.6.0",
    "tailwind-merge": "^3.3.1",
    "clsx": "^2.1.1",
    "class-variance-authority": "^0.7.1"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "@vitejs/plugin-react": "^4.2.1",
    "tailwindcss": "^3.4.18",
    "@tailwindcss/forms": "^0.5.10",
    "postcss": "^8.5.6",
    "autoprefixer": "^10.4.21",
    "eslint": "^8.55.0",
    "puppeteer": "^24.25.0"
  }
}
```

**Why React + TypeScript?**
- Component reusability (explanation panels, visualizations)
- Type safety prevents runtime errors
- Large ecosystem for data visualization (D3, Recharts)
- Hooks simplify state management

**Why Vite?**
- Instant dev server startup (vs. Create React App)
- Fast HMR (Hot Module Replacement)
- Optimized production builds
- Native ES modules

**Why Tailwind CSS?**
- Rapid prototyping without custom CSS
- Consistent design system
- Responsive by default
- Small bundle size (unused styles purged)

---

## 📡 Backend API - Current Functionality

### **File Structure**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app + CORS + router registration
│   ├── models.py                  # Pydantic data models
│   ├── routers/
│   │   ├── __init__.py
│   │   └── solve.py              # Solve endpoints
│   ├── services/
│   │   ├── __init__.py
│   │   ├── cpmpy_builder.py      # Pydantic → CPMpy conversion
│   │   └── solver.py             # Solving logic
│   └── utils/
│       └── __init__.py
└── tests/
    ├── __init__.py
    ├── test_main.py
    └── test_models.py
```

### **Available Endpoints**

#### 1. **GET /** - Root/Info
```bash
curl http://localhost:8000/

Response:
{
  "name": "xCoS Dashboard API",
  "version": "0.1.0",
  "description": "Explainable Constraint Solving Dashboard",
  "docs": "/api/docs"
}
```

#### 2. **GET /health** - Health Check
```bash
curl http://localhost:8000/health

Response:
{"status": "healthy"}
```

#### 3. **POST /api/model** - Create/Store CSP Model
**Purpose:** Store a constraint model in memory for later solving

**Request Body:**
```json
{
  "id": "my-model-123",
  "name": "Human-readable name",
  "variables": [
    {
      "name": "Exam_A",
      "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]
    }
  ],
  "constraints": [
    {
      "id": "c1",
      "expression": "Exam_A != Exam_B",
      "type": "hard",
      "weight": null,
      "description": "Different time slots",
      "enabled": true
    }
  ],
  "metadata": {}
}
```

**Response:**
```json
{
  "status": "success",
  "model_id": "my-model-123",
  "message": "Model 'Human-readable name' stored successfully"
}
```

**Variable Domain Types:**
- **Integer domains:** `[1, 2, 3, 4, 5]` → CPMpy intvar with bounds
- **Discrete/named domains:** `["Mon_9am", "Tue_9am"]` → intvar (0..n-1) with mapping

#### 4. **GET /api/model/{model_id}** - Retrieve Stored Model
```bash
curl http://localhost:8000/api/model/my-model-123

Response: (Full CSPModel JSON)
```

#### 5. **POST /api/solve** - Solve a Model
**Purpose:** Execute CPMpy solver on a stored model

**Request Body:**
```json
{
  "model_id": "my-model-123",
  "timeout": 30,        // seconds
  "find_all": false     // true = enumerate all solutions
}
```

**Response (Satisfiable):**
```json
{
  "status": "satisfiable",
  "solution": {
    "Exam_A": "Mon_9am",
    "Exam_B": "Mon_2pm",
    "Exam_C": "Tue_9am"
  },
  "objective_value": null,
  "solve_time_ms": 45.3,
  "message": "Found solution in 45.3ms"
}
```

**Response (Unsatisfiable):**
```json
{
  "status": "unsatisfiable",
  "solution": null,
  "solve_time_ms": 120.5,
  "message": "No solution exists for this model"
}
```

**Possible Status Values:**
- `satisfiable` - Solution found
- `unsatisfiable` - No solution exists (UNSAT)
- `optimal` - Optimal solution found (for optimization problems)
- `timeout` - Solver exceeded time limit
- `error` - Internal error

---

### **Constraint Expression Language**

The `expression` field in constraints supports:

**Comparison Operators:**
- `!=`, `==`, `<`, `>`, `<=`, `>=`

**Arithmetic:**
- `+`, `-`, `*`, `/` (on variables and constants)

**Global Constraints (CPMpy built-ins):**
- `AllDifferent([Exam_A, Exam_B, Exam_C])` - All must have different values
- `AllEqual([X, Y, Z])` - All must be equal
- `Sum([X, Y, Z]) <= 10` - Sum constraint

**Logical Operators:**
- `&` (and), `|` (or), `~` (not) - Python style
- Parentheses for grouping

**Examples:**
```python
"Exam_A != Exam_B"                           # Different values
"Exam_A + Exam_B <= 5"                       # Arithmetic constraint
"AllDifferent([Exam_A, Exam_B, Exam_C])"     # Global constraint
"(Exam_A == 0) | (Exam_B == 1)"              # Logical OR
```

**Security:** Expressions are evaluated in a restricted namespace (no arbitrary code execution)

---

### **CPMpy Model Builder - How It Works**

**File:** `backend/app/services/cpmpy_builder.py`

**Flow:**
1. **Variable Creation:**
   - Integer domains → `cp.intvar(min, max)`
   - Named domains → `cp.intvar(0, n-1)` + mapping dict

2. **Constraint Parsing:**
   - Parse expression string with Python `eval()`
   - Restricted namespace (only CPMpy functions + variables)
   - Creates CPMpy constraint objects

3. **Model Building:**
   - Collects all constraints
   - Creates `cp.Model(constraints)`
   - Returns model + builder (for solution extraction)

4. **Solution Extraction:**
   - Read `.value()` from CPMpy variables
   - Map indices back to named domain values
   - Return dict: `{"Exam_A": "Mon_9am", ...}`

**Example Internal Flow:**
```python
# Input Pydantic model
Variable(name="Exam_A", domain=["Mon_9am", "Mon_2pm", "Tue_9am"])

# Creates CPMpy variable
Exam_A_cpm = cp.intvar(0, 2, name="Exam_A")
domain_mapping = {0: "Mon_9am", 1: "Mon_2pm", 2: "Tue_9am"}

# After solving
if Exam_A_cpm.value() == 1:
    solution["Exam_A"] = domain_mapping[1]  # "Mon_2pm"
```

---

## 🎨 Frontend - Current Functionality

### **File Structure**
```
frontend/
├── src/
│   ├── App.tsx                    # Main application component
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Tailwind imports
│   ├── types/
│   │   └── api.ts                # TypeScript types (mirrors backend)
│   ├── hooks/
│   │   └── useApi.ts             # API client hooks
│   └── components/               # (Currently minimal)
├── public/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── tsconfig.json
```

### **Current UI Components**

**App.tsx** - Main Dashboard (Single Page)

**Layout Structure:**
```
┌─────────────────────────────────────────────────────┐
│ Header (sticky)                                     │
│ ┌─────────────┐           ┌──────────────────────┐ │
│ │ xCoS        │           │ [Solve Button]       │ │
│ │ Dashboard   │           └──────────────────────┘ │
│ └─────────────┘                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌────────────────────┬────────────────────────────┐│
│ │ Schedule Grid (8)  │  Controls Sidebar (4)      ││
│ │                    │                            ││
│ │ [Time Slots Grid]  │  ┌─────────────────────┐  ││
│ │ or                 │  │ Constraints         │  ││
│ │ "No solution yet"  │  │ [List + Add]        │  ││
│ │                    │  └─────────────────────┘  ││
│ │                    │                            ││
│ │                    │  ┌─────────────────────┐  ││
│ │                    │  │ Variables           │  ││
│ │                    │  │ [Color-coded list]  │  ││
│ │                    │  └─────────────────────┘  ││
│ └────────────────────┴────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Features Implemented:**
1. ✅ **Model Initialization** - Creates demo exam scheduling model on load
2. ✅ **Constraint Management** - Add/edit/delete/toggle constraints
3. ✅ **Schedule Display** - 5-column time slot grid
4. ✅ **Variable Visualization** - Color-coded exam cards
5. ✅ **Solve Button** - Triggers solver (via API hook)
6. ✅ **Toast Notifications** - Success/error feedback

**Features NOT Implemented:**
- ❌ Actual API integration (hooks defined but not connected)
- ❌ Solution visualization (grid shows placeholder)
- ❌ Conflict highlighting
- ❌ MUS/MCS display
- ❌ Repair suggestions

---

### **TypeScript Types**

**File:** `frontend/src/types/api.ts`

Mirrors backend Pydantic models:

```typescript
export type ConstraintType = 'hard' | 'soft';

export interface Constraint {
  id: string;
  expression: string;
  type: ConstraintType;
  weight?: number;
  description?: string;
  enabled: boolean;
}

export interface Variable {
  name: string;
  domain: any[];
  value?: any;
}

export interface CSPModel {
  id: string;
  name: string;
  variables: Variable[];
  constraints: Constraint[];
  metadata: Record<string, any>;
}

export type SolveStatus = 'satisfiable' | 'unsatisfiable' | 'optimal' | 'timeout' | 'error';

export interface SolveResponse {
  status: SolveStatus;
  solution?: Record<string, any>;
  objective_value?: number;
  solve_time_ms: number;
  message?: string;
}
```

---

### **API Hooks**

**File:** `frontend/src/hooks/useApi.ts`

**Current State:** Functions defined but **NOT connected to backend**

```typescript
export function useApi() {
  const baseURL = 'http://localhost:8000';

  return {
    checkHealth: async () => {
      const response = await axios.get(`${baseURL}/health`);
      return response.data;
    },

    solveModel: async (request: SolveRequest) => {
      // NOT IMPLEMENTED - Returns null
      return null;
    },

    getExplanation: async (modelId: string) => {
      // NOT IMPLEMENTED
      return null;
    },

    getAlternatives: async (modelId: string) => {
      // NOT IMPLEMENTED
      return null;
    },
  };
}

export function useCSPModel() {
  const [model, setModel] = useState<CSPModel | null>(null);
  const [solution, setSolution] = useState<SolveResponse | null>(null);

  return { model, setModel, solution, setSolution };
}
```

---

## 🔄 How to Use the System (Current State)

### **Backend Usage**

#### **1. Start the Backend**
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Access docs: http://localhost:8000/api/docs

#### **2. Create a Model**
```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "exam-schedule-1",
    "name": "Exam Scheduling",
    "variables": [
      {"name": "Exam_A", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]},
      {"name": "Exam_B", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]},
      {"name": "Exam_C", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]}
    ],
    "constraints": [
      {
        "id": "c1",
        "expression": "Exam_A != Exam_B",
        "type": "hard",
        "description": "A and B must be different slots",
        "enabled": true
      },
      {
        "id": "c2",
        "expression": "Exam_B != Exam_C",
        "type": "hard",
        "description": "B and C must be different slots",
        "enabled": true
      },
      {
        "id": "c3",
        "expression": "AllDifferent([Exam_A, Exam_B, Exam_C])",
        "type": "hard",
        "description": "All exams at different times",
        "enabled": true
      }
    ],
    "metadata": {}
  }'
```

#### **3. Solve the Model**
```bash
curl -X POST http://localhost:8000/api/solve \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "exam-schedule-1",
    "timeout": 30,
    "find_all": false
  }'
```

**Expected Response:**
```json
{
  "status": "satisfiable",
  "solution": {
    "Exam_A": "Mon_9am",
    "Exam_B": "Mon_2pm",
    "Exam_C": "Tue_9am"
  },
  "solve_time_ms": 42.7,
  "message": "Found solution in 42.7ms"
}
```

---

### **Frontend Usage**

#### **1. Start the Frontend**
```bash
cd frontend
npm run dev
```

Access UI: http://localhost:5173

#### **2. Current User Flow**
1. Page loads → Demo model initialized in React state
2. User can:
   - Add constraints (input expression manually)
   - Toggle constraints on/off (power icon)
   - Delete constraints (X button)
   - Click "Solve" button (currently does nothing - API not connected)
3. Schedule grid shows placeholder "No solution yet"

---

## 📊 Integration Status

### **What's Connected:**
- ✅ Frontend and backend running on different ports
- ✅ CORS configured (backend accepts requests from localhost:5173)
- ✅ TypeScript types match Pydantic models

### **What's NOT Connected:**
- ❌ Frontend doesn't send model to backend
- ❌ Frontend doesn't call `/api/solve`
- ❌ Solution data doesn't display on schedule grid
- ❌ No error handling for failed solves

### **Missing Pieces:**

**Backend:**
- ❌ MUS endpoint (`/api/explain/mus`)
- ❌ MCS endpoint (`/api/repair/mcs`)
- ❌ Optimization/objective support
- ❌ Model persistence (currently in-memory, lost on restart)
- ❌ WebSocket for real-time updates

**Frontend:**
- ❌ Implement `solveModel()` in `useApi.ts`
- ❌ Create model on backend when initialized
- ❌ Display solution on schedule grid
- ❌ Explanation panel (MUS/MCS visualization)
- ❌ Repair suggestions UI
- ❌ Conflict overlays on schedule
- ❌ Loading states during solve

---

## 🎯 Immediate Next Steps

### **Priority 1: Connect Frontend to Backend**
1. Implement `POST /api/model` call in `useApi.ts`
2. Implement `POST /api/solve` call
3. Update `handleSolve()` in App.tsx to use real API
4. Display solution on schedule grid

### **Priority 2: Add MUS Endpoint**
1. Create `/api/explain/mus` in backend
2. Integrate CPMpy's MUS function
3. Return conflicting constraint IDs

### **Priority 3: Explanation Panel**
1. Create `ExplanationPanel.tsx` component
2. Show MUS when UNSAT
3. Show violated soft constraints when SAT

---

## 📝 Dependencies Summary

**Install Backend:**
```bash
cd backend
pip install fastapi uvicorn[standard] pydantic cpmpy
```

**Install Frontend:**
```bash
cd frontend
npm install
```

**System Requirements:**
- Python 3.11+
- Node.js 18+
- Git (for version control)

---

**End of Audit**
