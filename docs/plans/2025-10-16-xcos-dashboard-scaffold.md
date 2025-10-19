# xCoS Dashboard Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Build a complete full-stack scaffold for an interactive, explainable constraint solving dashboard with FastAPI+CPMpy backend and React+TypeScript frontend.

**Architecture:** Modular FastAPI backend with dedicated routers for model management, solving, and explanations. React frontend with component-based architecture for constraint editing, schedule visualization, and explanation display. REST API + WebSocket for real-time updates.

**Tech Stack:** Python 3.12+, FastAPI, CPMpy, Pydantic | Node 18+, React, TypeScript, Vite, Axios

---

## Task 1: Project Structure Setup

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/requirements.txt`
- Create: `frontend/.gitkeep`
- Create: `.gitignore`

**Step 1: Create backend directory structure**

```bash
mkdir -p backend/app/routers
mkdir -p backend/app/utils
```

**Step 2: Create backend __init__.py files**

Create `backend/app/__init__.py`:
```python
"""xCoS Dashboard Backend Application."""
__version__ = "0.1.0"
```

Create `backend/app/routers/__init__.py`:
```python
"""API routers for xCoS Dashboard."""
```

Create `backend/app/utils/__init__.py`:
```python
"""Utility modules for constraint solving and explanations."""
```

**Step 3: Create requirements.txt**

Create `backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
cpmpy==0.9.23
pydantic==2.9.2
pydantic-settings==2.6.0
python-multipart==0.0.17
websockets==13.1
```

**Step 4: Create project .gitignore**

Create `.gitignore`:
```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
backend/.venv/
backend/venv/
backend/env/
*.egg-info/
dist/
build/

# Node
frontend/node_modules/
frontend/dist/
frontend/.vite/
*.log

# IDE
.vscode/*
!.vscode/launch.json
!.vscode/settings.json
*.code-workspace
.idea/

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
```

**Step 5: Verify structure**

Run: `tree -L 3 -a backend/`
Expected: Should show proper directory hierarchy

**Step 6: Initialize git repository**

```bash
git init
git add .gitignore backend/
git commit -m "chore: initialize project structure"
```

---

## Task 2: Backend Core - Pydantic Models

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_models.py`

**Step 1: Write test for Constraint model**

Create `backend/tests/__init__.py`:
```python
"""Tests for xCoS Dashboard backend."""
```

Create `backend/tests/test_models.py`:
```python
"""Tests for Pydantic data models."""
import pytest
from app.models import Constraint, ConstraintType, CSPModel, SolveRequest


def test_constraint_creation():
    """Test creating a basic constraint."""
    constraint = Constraint(
        id="c1",
        expression="x + y <= 10",
        type=ConstraintType.HARD,
        description="Sum constraint"
    )
    assert constraint.id == "c1"
    assert constraint.type == ConstraintType.HARD
    assert constraint.weight is None


def test_soft_constraint_with_weight():
    """Test creating a soft constraint with weight."""
    constraint = Constraint(
        id="c2",
        expression="x > 5",
        type=ConstraintType.SOFT,
        weight=0.8,
        description="Preference constraint"
    )
    assert constraint.type == ConstraintType.SOFT
    assert constraint.weight == 0.8
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_models.py::test_constraint_creation -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.models'"

**Step 3: Implement Pydantic models**

Create `backend/app/models.py`:
```python
"""Pydantic models for API requests and responses."""
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ConstraintType(str, Enum):
    """Type of constraint: hard (must satisfy) or soft (preference)."""
    HARD = "hard"
    SOFT = "soft"


class Constraint(BaseModel):
    """Represents a single constraint in the CSP."""
    id: str = Field(..., description="Unique identifier for the constraint")
    expression: str = Field(..., description="Constraint expression (CPMpy-compatible)")
    type: ConstraintType = Field(default=ConstraintType.HARD, description="Hard or soft constraint")
    weight: Optional[float] = Field(None, description="Weight for soft constraints (0-1)")
    description: Optional[str] = Field(None, description="Human-readable description")
    enabled: bool = Field(default=True, description="Whether constraint is active")


class Variable(BaseModel):
    """Represents a decision variable."""
    name: str = Field(..., description="Variable name")
    domain: List[Any] = Field(..., description="Possible values for the variable")
    value: Optional[Any] = Field(None, description="Assigned value (if solved)")


class CSPModel(BaseModel):
    """Complete CSP model with variables and constraints."""
    id: str = Field(..., description="Unique model identifier")
    name: str = Field(..., description="Human-readable model name")
    variables: List[Variable] = Field(default_factory=list, description="Decision variables")
    constraints: List[Constraint] = Field(default_factory=list, description="Model constraints")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional model information")


class SolveRequest(BaseModel):
    """Request to solve a CSP model."""
    model_id: str = Field(..., description="ID of the model to solve")
    timeout: Optional[int] = Field(30, description="Solver timeout in seconds")
    find_all: bool = Field(False, description="Find all solutions vs. first solution")


class SolveStatus(str, Enum):
    """Possible solver outcomes."""
    SATISFIABLE = "satisfiable"
    UNSATISFIABLE = "unsatisfiable"
    OPTIMAL = "optimal"
    TIMEOUT = "timeout"
    ERROR = "error"


class SolveResponse(BaseModel):
    """Response from solving a CSP."""
    status: SolveStatus = Field(..., description="Solver outcome")
    solution: Optional[Dict[str, Any]] = Field(None, description="Variable assignments if SAT")
    objective_value: Optional[float] = Field(None, description="Objective value if optimization")
    solve_time_ms: float = Field(..., description="Time taken to solve in milliseconds")
    message: Optional[str] = Field(None, description="Additional information or error message")


class ExplanationRequest(BaseModel):
    """Request for explanation of unsatisfiability."""
    model_id: str = Field(..., description="ID of the unsatisfiable model")
    explanation_type: str = Field("mus", description="Type: mus, mcs, or ocus")


class ExplanationResponse(BaseModel):
    """Response containing explanation of unsatisfiability."""
    explanation_type: str = Field(..., description="Type of explanation provided")
    constraint_ids: List[str] = Field(..., description="IDs of constraints in the explanation")
    description: str = Field(..., description="Human-readable explanation")
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS - both tests should succeed

**Step 5: Add more model tests**

Add to `backend/tests/test_models.py`:
```python
def test_csp_model_creation():
    """Test creating a complete CSP model."""
    model = CSPModel(
        id="model1",
        name="Simple CSP",
        variables=[
            Variable(name="x", domain=[1, 2, 3]),
            Variable(name="y", domain=[1, 2, 3])
        ],
        constraints=[
            Constraint(id="c1", expression="x != y", type=ConstraintType.HARD)
        ]
    )
    assert model.id == "model1"
    assert len(model.variables) == 2
    assert len(model.constraints) == 1


def test_solve_response_creation():
    """Test creating a solve response."""
    response = SolveResponse(
        status=SolveStatus.SATISFIABLE,
        solution={"x": 1, "y": 2},
        solve_time_ms=45.2
    )
    assert response.status == SolveStatus.SATISFIABLE
    assert response.solution["x"] == 1
```

**Step 6: Run all model tests**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS - all 4 tests pass

**Step 7: Commit**

```bash
git add backend/app/models.py backend/tests/
git commit -m "feat: add Pydantic models for CSP domain"
```

---

## Task 3: Backend Core - FastAPI Application Setup

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/tests/test_main.py`

**Step 1: Write test for FastAPI app creation**

Create `backend/tests/test_main.py`:
```python
"""Tests for main FastAPI application."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_root_endpoint(client):
    """Test root endpoint returns API info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data


def test_health_endpoint(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_main.py::test_root_endpoint -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.main'"

**Step 3: Implement FastAPI application**

Create `backend/app/main.py`:
```python
"""Main FastAPI application for xCoS Dashboard."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import __version__

# Create FastAPI app
app = FastAPI(
    title="xCoS Dashboard API",
    description="Explainable Constraint Solving Dashboard - Backend API",
    version=__version__,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default + React default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - API information."""
    return {
        "name": "xCoS Dashboard API",
        "version": __version__,
        "description": "Explainable Constraint Solving Dashboard",
        "docs": "/api/docs"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_main.py -v`
Expected: PASS - both tests pass

**Step 5: Manually test server startup**

Run: `cd backend && python -m app.main`
Expected: Server starts on http://0.0.0.0:8000

**Step 6: Test endpoints manually** (in another terminal)

Run: `curl http://localhost:8000/`
Expected: JSON response with API info

Run: `curl http://localhost:8000/health`
Expected: `{"status":"healthy"}`

**Step 7: Stop server and commit**

```bash
git add backend/app/main.py backend/tests/test_main.py
git commit -m "feat: add FastAPI application with CORS"
```

---

## Task 4: Backend Router - Model Management

**Files:**
- Create: `backend/app/routers/model.py`
- Create: `backend/tests/test_router_model.py`

**Step 1: Write test for model creation endpoint**

Create `backend/tests/test_router_model.py`:
```python
"""Tests for model management router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import CSPModel, Variable, Constraint, ConstraintType


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_create_model(client):
    """Test creating a new CSP model."""
    model_data = {
        "id": "test-model-1",
        "name": "Test Model",
        "variables": [
            {"name": "x", "domain": [1, 2, 3]},
            {"name": "y", "domain": [1, 2, 3]}
        ],
        "constraints": [
            {
                "id": "c1",
                "expression": "x != y",
                "type": "hard",
                "description": "X and Y must differ"
            }
        ]
    }
    response = client.post("/api/model", json=model_data)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "test-model-1"
    assert data["name"] == "Test Model"


def test_get_model(client):
    """Test retrieving a model by ID."""
    # First create a model
    model_data = {
        "id": "test-model-2",
        "name": "Test Model 2",
        "variables": [],
        "constraints": []
    }
    client.post("/api/model", json=model_data)

    # Then retrieve it
    response = client.get("/api/model/test-model-2")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-model-2"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_router_model.py::test_create_model -v`
Expected: FAIL with 404 (endpoint doesn't exist)

**Step 3: Implement model router**

Create `backend/app/routers/model.py`:
```python
"""Router for CSP model management."""
from typing import Dict
from fastapi import APIRouter, HTTPException, status
from app.models import CSPModel

router = APIRouter(prefix="/api/model", tags=["model"])

# In-memory storage (replace with database in production)
models_db: Dict[str, CSPModel] = {}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CSPModel)
async def create_model(model: CSPModel) -> CSPModel:
    """
    Create a new CSP model.

    Args:
        model: CSPModel with variables and constraints

    Returns:
        Created model with assigned ID

    Raises:
        HTTPException: If model ID already exists
    """
    if model.id in models_db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Model with ID '{model.id}' already exists"
        )
    models_db[model.id] = model
    return model


@router.get("/{model_id}", response_model=CSPModel)
async def get_model(model_id: str) -> CSPModel:
    """
    Retrieve a CSP model by ID.

    Args:
        model_id: Unique identifier of the model

    Returns:
        CSPModel if found

    Raises:
        HTTPException: If model not found
    """
    if model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{model_id}' not found"
        )
    return models_db[model_id]


@router.get("", response_model=list[CSPModel])
async def list_models() -> list[CSPModel]:
    """
    List all CSP models.

    Returns:
        List of all stored models
    """
    return list(models_db.values())


@router.put("/{model_id}", response_model=CSPModel)
async def update_model(model_id: str, model: CSPModel) -> CSPModel:
    """
    Update an existing CSP model.

    Args:
        model_id: ID of model to update
        model: Updated model data

    Returns:
        Updated model

    Raises:
        HTTPException: If model not found
    """
    if model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{model_id}' not found"
        )
    model.id = model_id  # Ensure ID consistency
    models_db[model_id] = model
    return model


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: str) -> None:
    """
    Delete a CSP model.

    Args:
        model_id: ID of model to delete

    Raises:
        HTTPException: If model not found
    """
    if model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{model_id}' not found"
        )
    del models_db[model_id]
```

**Step 4: Register router in main app**

Modify `backend/app/main.py` - add after CORS middleware:
```python
from app.routers import model

# Include routers
app.include_router(model.router)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_router_model.py -v`
Expected: PASS - both tests pass

**Step 6: Add test for listing models**

Add to `backend/tests/test_router_model.py`:
```python
def test_list_models(client):
    """Test listing all models."""
    # Create two models
    for i in range(2):
        model_data = {
            "id": f"list-test-{i}",
            "name": f"List Test {i}",
            "variables": [],
            "constraints": []
        }
        client.post("/api/model", json=model_data)

    # List all models
    response = client.get("/api/model")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
```

**Step 7: Run all tests**

Run: `cd backend && python -m pytest tests/test_router_model.py -v`
Expected: PASS - all tests pass

**Step 8: Commit**

```bash
git add backend/app/routers/model.py backend/app/main.py backend/tests/test_router_model.py
git commit -m "feat: add model management router with CRUD operations"
```

---

## Task 5: Backend Router - Solve Endpoint

**Files:**
- Create: `backend/app/routers/solve.py`
- Create: `backend/app/utils/solver.py`
- Create: `backend/tests/test_router_solve.py`

**Step 1: Write test for solve endpoint**

Create `backend/tests/test_router_solve.py`:
```python
"""Tests for solve router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def simple_model(client):
    """Create a simple satisfiable model."""
    model_data = {
        "id": "solve-test-1",
        "name": "Simple SAT Model",
        "variables": [
            {"name": "x", "domain": [1, 2, 3]},
            {"name": "y", "domain": [1, 2, 3]}
        ],
        "constraints": [
            {"id": "c1", "expression": "x != y", "type": "hard"}
        ]
    }
    response = client.post("/api/model", json=model_data)
    assert response.status_code == 201
    return response.json()


def test_solve_satisfiable_model(client, simple_model):
    """Test solving a satisfiable model."""
    solve_request = {
        "model_id": simple_model["id"],
        "timeout": 30
    }
    response = client.post("/api/solve", json=solve_request)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "satisfiable"
    assert "solution" in data
    assert "solve_time_ms" in data
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_router_solve.py::test_solve_satisfiable_model -v`
Expected: FAIL with 404 (endpoint doesn't exist)

**Step 3: Implement solver utility**

Create `backend/app/utils/solver.py`:
```python
"""CPMpy solver utilities."""
import time
from typing import Optional, Dict, Any, Tuple
from cpmpy import Model, SolverLookup
from cpmpy.expressions.variables import intvar
from app.models import CSPModel, SolveStatus


class SolverError(Exception):
    """Raised when solver encounters an error."""
    pass


def build_cpmpy_model(csp_model: CSPModel) -> Tuple[Model, Dict[str, Any]]:
    """
    Build a CPMpy Model from CSPModel.

    Args:
        csp_model: CSPModel to convert

    Returns:
        Tuple of (CPMpy Model, variable mapping dict)

    Raises:
        SolverError: If model construction fails
    """
    try:
        # Create CPMpy variables
        var_map = {}
        for var in csp_model.variables:
            if isinstance(var.domain, list) and len(var.domain) > 0:
                # Integer domain
                min_val = min(var.domain)
                max_val = max(var.domain)
                var_map[var.name] = intvar(min_val, max_val, name=var.name)
            else:
                raise SolverError(f"Invalid domain for variable {var.name}")

        # Build constraints (placeholder - parse expressions in production)
        cpm_constraints = []
        for constraint in csp_model.constraints:
            if not constraint.enabled:
                continue
            # Placeholder: For now, we'll handle simple expressions
            # In production, parse constraint.expression properly
            # This is where you'd use exec or a parser
            pass

        # Create CPMpy model
        model = Model(cpm_constraints)
        return model, var_map

    except Exception as e:
        raise SolverError(f"Failed to build CPMpy model: {str(e)}")


def solve_model(csp_model: CSPModel, timeout: int = 30) -> Tuple[SolveStatus, Optional[Dict[str, Any]], float]:
    """
    Solve a CSP model using CPMpy.

    Args:
        csp_model: The CSP model to solve
        timeout: Solver timeout in seconds

    Returns:
        Tuple of (status, solution dict, solve time in ms)

    Raises:
        SolverError: If solver fails unexpectedly
    """
    start_time = time.time()

    try:
        # Build CPMpy model
        cpm_model, var_map = build_cpmpy_model(csp_model)

        # Solve
        result = cpm_model.solve(time_limit=timeout)

        solve_time_ms = (time.time() - start_time) * 1000

        if result:
            # Extract solution
            solution = {}
            for var_name, cpm_var in var_map.items():
                solution[var_name] = int(cpm_var.value())
            return SolveStatus.SATISFIABLE, solution, solve_time_ms
        else:
            return SolveStatus.UNSATISFIABLE, None, solve_time_ms

    except Exception as e:
        solve_time_ms = (time.time() - start_time) * 1000
        raise SolverError(f"Solver error: {str(e)}")


def solve_model_simple(csp_model: CSPModel) -> Tuple[SolveStatus, Optional[Dict[str, Any]], float]:
    """
    Simplified solver for testing - returns mock solution.

    This is a placeholder that returns a valid solution for any model.
    Replace with solve_model() once constraint parsing is implemented.
    """
    start_time = time.time()

    # Mock solution - assign first domain value to each variable
    solution = {}
    for var in csp_model.variables:
        if var.domain and len(var.domain) > 0:
            solution[var.name] = var.domain[0]

    solve_time_ms = (time.time() - start_time) * 1000

    if solution:
        return SolveStatus.SATISFIABLE, solution, solve_time_ms
    else:
        return SolveStatus.UNSATISFIABLE, None, solve_time_ms
```

**Step 4: Implement solve router**

Create `backend/app/routers/solve.py`:
```python
"""Router for solving CSP models."""
from fastapi import APIRouter, HTTPException, status
from app.models import SolveRequest, SolveResponse, SolveStatus
from app.routers.model import models_db
from app.utils.solver import solve_model_simple, SolverError

router = APIRouter(prefix="/api/solve", tags=["solve"])


@router.post("", response_model=SolveResponse)
async def solve(request: SolveRequest) -> SolveResponse:
    """
    Solve a CSP model.

    Args:
        request: SolveRequest with model_id and options

    Returns:
        SolveResponse with status and solution

    Raises:
        HTTPException: If model not found or solver fails
    """
    # Get model
    if request.model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{request.model_id}' not found"
        )

    model = models_db[request.model_id]

    # Solve
    try:
        solve_status, solution, solve_time_ms = solve_model_simple(model)

        return SolveResponse(
            status=solve_status,
            solution=solution,
            solve_time_ms=solve_time_ms,
            message="Solved successfully" if solve_status == SolveStatus.SATISFIABLE else "No solution found"
        )

    except SolverError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
```

**Step 5: Register solve router**

Modify `backend/app/main.py` - add after model router:
```python
from app.routers import model, solve

app.include_router(model.router)
app.include_router(solve.router)
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_router_solve.py -v`
Expected: PASS - test passes

**Step 7: Add test for unsatisfiable model**

Add to `backend/tests/test_router_solve.py`:
```python
def test_solve_nonexistent_model(client):
    """Test solving a model that doesn't exist."""
    solve_request = {
        "model_id": "nonexistent",
        "timeout": 30
    }
    response = client.post("/api/solve", json=solve_request)
    assert response.status_code == 404
```

**Step 8: Run all tests**

Run: `cd backend && python -m pytest tests/test_router_solve.py -v`
Expected: PASS - all tests pass

**Step 9: Commit**

```bash
git add backend/app/routers/solve.py backend/app/utils/solver.py backend/app/main.py backend/tests/test_router_solve.py
git commit -m "feat: add solve endpoint with CPMpy integration"
```

---

## Task 6: Backend Router - Explanation Endpoints (Placeholder)

**Files:**
- Create: `backend/app/routers/explain.py`
- Create: `backend/app/utils/explain_tools.py`
- Create: `backend/tests/test_router_explain.py`

**Step 1: Write test for MUS explanation endpoint**

Create `backend/tests/test_router_explain.py`:
```python
"""Tests for explanation router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_explain_mus_placeholder(client):
    """Test MUS explanation endpoint returns placeholder."""
    request_data = {
        "model_id": "test-model",
        "explanation_type": "mus"
    }
    response = client.post("/api/explain/mus", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert data["explanation_type"] == "mus"
    assert "constraint_ids" in data
    assert "description" in data
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_router_explain.py::test_explain_mus_placeholder -v`
Expected: FAIL with 404

**Step 3: Implement explanation tools utility**

Create `backend/app/utils/explain_tools.py`:
```python
"""Explanation tools for MUS, MCS, OCUS."""
from typing import List
from app.models import CSPModel


def compute_mus(model: CSPModel) -> List[str]:
    """
    Compute Minimal Unsatisfiable Subset (MUS).

    Placeholder implementation - returns all constraint IDs.
    In production, implement actual MUS algorithm.

    Args:
        model: The unsatisfiable CSP model

    Returns:
        List of constraint IDs in the MUS
    """
    # Placeholder: return all enabled constraint IDs
    return [c.id for c in model.constraints if c.enabled]


def compute_mcs(model: CSPModel) -> List[str]:
    """
    Compute Minimal Correction Subset (MCS).

    Placeholder implementation.

    Args:
        model: The unsatisfiable CSP model

    Returns:
        List of constraint IDs that could be removed to satisfy model
    """
    # Placeholder
    return [c.id for c in model.constraints if c.enabled][:1]


def compute_ocus(model: CSPModel) -> List[str]:
    """
    Compute Optimal Correction Subset (OCUS).

    Placeholder implementation.

    Args:
        model: The unsatisfiable CSP model

    Returns:
        List of constraint IDs in optimal correction set
    """
    # Placeholder
    return []
```

**Step 4: Implement explain router**

Create `backend/app/routers/explain.py`:
```python
"""Router for explanation endpoints (MUS, MCS, OCUS)."""
from fastapi import APIRouter, HTTPException, status
from app.models import ExplanationRequest, ExplanationResponse
from app.routers.model import models_db
from app.utils.explain_tools import compute_mus, compute_mcs, compute_ocus

router = APIRouter(prefix="/api/explain", tags=["explain"])


@router.post("/mus", response_model=ExplanationResponse)
async def explain_mus(request: ExplanationRequest) -> ExplanationResponse:
    """
    Get Minimal Unsatisfiable Subset (MUS) explanation.

    Args:
        request: ExplanationRequest with model_id

    Returns:
        ExplanationResponse with MUS constraint IDs

    Raises:
        HTTPException: If model not found
    """
    if request.model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{request.model_id}' not found"
        )

    model = models_db[request.model_id]
    mus_ids = compute_mus(model)

    return ExplanationResponse(
        explanation_type="mus",
        constraint_ids=mus_ids,
        description=f"MUS contains {len(mus_ids)} constraint(s) that cannot be satisfied together."
    )


@router.post("/mcs", response_model=ExplanationResponse)
async def explain_mcs(request: ExplanationRequest) -> ExplanationResponse:
    """
    Get Minimal Correction Subset (MCS) explanation.

    Args:
        request: ExplanationRequest with model_id

    Returns:
        ExplanationResponse with MCS constraint IDs
    """
    if request.model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{request.model_id}' not found"
        )

    model = models_db[request.model_id]
    mcs_ids = compute_mcs(model)

    return ExplanationResponse(
        explanation_type="mcs",
        constraint_ids=mcs_ids,
        description=f"Remove {len(mcs_ids)} constraint(s) to make the model satisfiable."
    )


@router.post("/ocus", response_model=ExplanationResponse)
async def explain_ocus(request: ExplanationRequest) -> ExplanationResponse:
    """
    Get Optimal Correction Subset (OCUS) explanation.

    Args:
        request: ExplanationRequest with model_id

    Returns:
        ExplanationResponse with OCUS constraint IDs
    """
    if request.model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{request.model_id}' not found"
        )

    model = models_db[request.model_id]
    ocus_ids = compute_ocus(model)

    return ExplanationResponse(
        explanation_type="ocus",
        constraint_ids=ocus_ids,
        description=f"OCUS: Optimal correction involves {len(ocus_ids)} constraint(s)."
    )
```

**Step 5: Register explain router**

Modify `backend/app/main.py`:
```python
from app.routers import model, solve, explain

app.include_router(model.router)
app.include_router(solve.router)
app.include_router(explain.router)
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_router_explain.py -v`
Expected: PASS

**Step 7: Add tests for MCS and OCUS**

Add to `backend/tests/test_router_explain.py`:
```python
def test_explain_mcs_placeholder(client):
    """Test MCS explanation endpoint."""
    request_data = {
        "model_id": "test-model",
        "explanation_type": "mcs"
    }
    response = client.post("/api/explain/mcs", json=request_data)
    assert response.status_code == 200
    assert response.json()["explanation_type"] == "mcs"


def test_explain_ocus_placeholder(client):
    """Test OCUS explanation endpoint."""
    request_data = {
        "model_id": "test-model",
        "explanation_type": "ocus"
    }
    response = client.post("/api/explain/ocus", json=request_data)
    assert response.status_code == 200
    assert response.json()["explanation_type"] == "ocus"
```

**Step 8: Run all tests**

Run: `cd backend && python -m pytest tests/test_router_explain.py -v`
Expected: PASS - all tests pass

**Step 9: Commit**

```bash
git add backend/app/routers/explain.py backend/app/utils/explain_tools.py backend/tests/test_router_explain.py backend/app/main.py
git commit -m "feat: add explanation endpoints (MUS/MCS/OCUS) with placeholders"
```

---

## Task 7: Backend Router - What-If Endpoint (Placeholder)

**Files:**
- Create: `backend/app/routers/whatif.py`
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_router_whatif.py`

**Step 1: Add what-if models**

Add to `backend/app/models.py`:
```python
class WhatIfRequest(BaseModel):
    """Request for what-if counterfactual analysis."""
    model_id: str = Field(..., description="ID of the model")
    desired_outcome: Dict[str, Any] = Field(..., description="Desired variable assignments")
    max_changes: int = Field(3, description="Maximum constraint changes to suggest")


class WhatIfResponse(BaseModel):
    """Response with what-if suggestions."""
    feasible: bool = Field(..., description="Whether desired outcome is achievable")
    suggestions: List[Dict[str, Any]] = Field(..., description="Suggested constraint modifications")
    explanation: str = Field(..., description="Human-readable explanation")
```

**Step 2: Write test for what-if endpoint**

Create `backend/tests/test_router_whatif.py`:
```python
"""Tests for what-if router."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_whatif_endpoint_placeholder(client):
    """Test what-if analysis endpoint."""
    request_data = {
        "model_id": "test-model",
        "desired_outcome": {"x": 5, "y": 5},
        "max_changes": 2
    }
    response = client.post("/api/whatif", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert "feasible" in data
    assert "suggestions" in data
    assert "explanation" in data
```

**Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_router_whatif.py::test_whatif_endpoint_placeholder -v`
Expected: FAIL with 404

**Step 4: Implement what-if router**

Create `backend/app/routers/whatif.py`:
```python
"""Router for what-if counterfactual analysis."""
from fastapi import APIRouter, HTTPException, status
from app.models import WhatIfRequest, WhatIfResponse
from app.routers.model import models_db

router = APIRouter(prefix="/api/whatif", tags=["whatif"])


@router.post("", response_model=WhatIfResponse)
async def whatif_analysis(request: WhatIfRequest) -> WhatIfResponse:
    """
    Perform what-if counterfactual analysis.

    Placeholder implementation that returns mock suggestions.

    Args:
        request: WhatIfRequest with desired outcome

    Returns:
        WhatIfResponse with feasibility and suggestions

    Raises:
        HTTPException: If model not found
    """
    if request.model_id not in models_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{request.model_id}' not found"
        )

    model = models_db[request.model_id]

    # Placeholder logic
    suggestions = [
        {
            "constraint_id": "c1",
            "action": "relax",
            "description": "Relax constraint c1 to allow desired outcome"
        }
    ]

    return WhatIfResponse(
        feasible=True,
        suggestions=suggestions,
        explanation=f"To achieve desired outcome, consider relaxing {len(suggestions)} constraint(s)."
    )
```

**Step 5: Register whatif router**

Modify `backend/app/main.py`:
```python
from app.routers import model, solve, explain, whatif

app.include_router(model.router)
app.include_router(solve.router)
app.include_router(explain.router)
app.include_router(whatif.router)
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_router_whatif.py -v`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/app/routers/whatif.py backend/app/models.py backend/tests/test_router_whatif.py backend/app/main.py
git commit -m "feat: add what-if counterfactual analysis endpoint"
```

---

## Task 8: Backend - Run All Tests and Verify

**Step 1: Run complete test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass

**Step 2: Check test coverage** (optional)

Run: `cd backend && pip install pytest-cov && python -m pytest tests/ --cov=app --cov-report=term-missing`
Expected: Coverage report showing tested modules

**Step 3: Verify backend runs**

Run: `cd backend && python -m app.main`
Expected: Server starts without errors at http://localhost:8000

**Step 4: Check API docs**

Open browser: `http://localhost:8000/api/docs`
Expected: Swagger UI showing all endpoints

**Step 5: Stop server and commit checkpoint**

```bash
git add -A
git commit -m "chore: verify backend tests and API documentation"
```

---

## Task 9: Frontend - Initialize Vite + React + TypeScript

**Files:**
- Create: `frontend/` directory with Vite scaffold
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`

**Step 1: Initialize Vite project**

Run:
```bash
cd frontend
npm create vite@latest . -- --template react-ts
```

When prompted:
- Package name: `xcos-dashboard-frontend`
- Select framework: `React`
- Select variant: `TypeScript`

**Step 2: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully

**Step 3: Install additional dependencies**

Run: `npm install axios`
Expected: axios added to package.json

**Step 4: Configure Vite for backend proxy**

Modify `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 5: Test dev server**

Run: `npm run dev`
Expected: Vite dev server starts at http://localhost:5173

**Step 6: Verify default app loads**

Open browser: `http://localhost:5173`
Expected: Default Vite + React page displays

**Step 7: Stop dev server and commit**

```bash
git add frontend/
git commit -m "feat: initialize Vite + React + TypeScript frontend"
```

---

## Task 10: Frontend - TypeScript Types

**Files:**
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/types/index.ts`

**Step 1: Create API types**

Create `frontend/src/types/api.ts`:
```typescript
/**
 * TypeScript types matching backend Pydantic models.
 */

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
  metadata?: Record<string, any>;
}

export interface SolveRequest {
  model_id: string;
  timeout?: number;
  find_all?: boolean;
}

export type SolveStatus = 'satisfiable' | 'unsatisfiable' | 'optimal' | 'timeout' | 'error';

export interface SolveResponse {
  status: SolveStatus;
  solution?: Record<string, any>;
  objective_value?: number;
  solve_time_ms: number;
  message?: string;
}

export interface ExplanationRequest {
  model_id: string;
  explanation_type: 'mus' | 'mcs' | 'ocus';
}

export interface ExplanationResponse {
  explanation_type: string;
  constraint_ids: string[];
  description: string;
}

export interface WhatIfRequest {
  model_id: string;
  desired_outcome: Record<string, any>;
  max_changes?: number;
}

export interface WhatIfResponse {
  feasible: boolean;
  suggestions: Array<{
    constraint_id: string;
    action: string;
    description: string;
  }>;
  explanation: string;
}
```

**Step 2: Create index file**

Create `frontend/src/types/index.ts`:
```typescript
/**
 * Central export for all TypeScript types.
 */
export * from './api';
```

**Step 3: Commit**

```bash
git add frontend/src/types/
git commit -m "feat: add TypeScript types matching backend API"
```

---

## Task 11: Frontend - API Service

**Files:**
- Create: `frontend/src/services/api.ts`

**Step 1: Create API service**

Create `frontend/src/services/api.ts`:
```typescript
/**
 * API service for backend communication.
 */
import axios, { AxiosInstance } from 'axios';
import type {
  CSPModel,
  SolveRequest,
  SolveResponse,
  ExplanationRequest,
  ExplanationResponse,
  WhatIfRequest,
  WhatIfResponse,
} from '../types';

class ApiService {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Model Management
  async createModel(model: CSPModel): Promise<CSPModel> {
    const response = await this.client.post<CSPModel>('/model', model);
    return response.data;
  }

  async getModel(modelId: string): Promise<CSPModel> {
    const response = await this.client.get<CSPModel>(`/model/${modelId}`);
    return response.data;
  }

  async listModels(): Promise<CSPModel[]> {
    const response = await this.client.get<CSPModel[]>('/model');
    return response.data;
  }

  async updateModel(modelId: string, model: CSPModel): Promise<CSPModel> {
    const response = await this.client.put<CSPModel>(`/model/${modelId}`, model);
    return response.data;
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.client.delete(`/model/${modelId}`);
  }

  // Solving
  async solve(request: SolveRequest): Promise<SolveResponse> {
    const response = await this.client.post<SolveResponse>('/solve', request);
    return response.data;
  }

  // Explanations
  async explainMUS(request: ExplanationRequest): Promise<ExplanationResponse> {
    const response = await this.client.post<ExplanationResponse>('/explain/mus', request);
    return response.data;
  }

  async explainMCS(request: ExplanationRequest): Promise<ExplanationResponse> {
    const response = await this.client.post<ExplanationResponse>('/explain/mcs', request);
    return response.data;
  }

  async explainOCUS(request: ExplanationRequest): Promise<ExplanationResponse> {
    const response = await this.client.post<ExplanationResponse>('/explain/ocus', request);
    return response.data;
  }

  // What-If Analysis
  async whatIf(request: WhatIfRequest): Promise<WhatIfResponse> {
    const response = await this.client.post<WhatIfResponse>('/whatif', request);
    return response.data;
  }
}

// Export singleton instance
export const api = new ApiService();
export default api;
```

**Step 2: Commit**

```bash
git add frontend/src/services/
git commit -m "feat: add API service with axios client"
```

---

## Task 12: Frontend - Component: ConstraintList

**Files:**
- Create: `frontend/src/components/ConstraintList.tsx`
- Create: `frontend/src/components/ConstraintList.module.css`

**Step 1: Create ConstraintList component**

Create `frontend/src/components/ConstraintList.tsx`:
```typescript
/**
 * ConstraintList - Display and manage constraints.
 */
import React from 'react';
import type { Constraint } from '../types';
import './ConstraintList.module.css';

interface ConstraintListProps {
  constraints: Constraint[];
  onToggle?: (constraintId: string) => void;
  onDelete?: (constraintId: string) => void;
}

export const ConstraintList: React.FC<ConstraintListProps> = ({
  constraints,
  onToggle,
  onDelete,
}) => {
  return (
    <div className="constraint-list">
      <h2>Constraints</h2>
      {constraints.length === 0 ? (
        <p className="empty-state">No constraints defined yet.</p>
      ) : (
        <ul>
          {constraints.map((constraint) => (
            <li
              key={constraint.id}
              className={`constraint-item ${constraint.type} ${!constraint.enabled ? 'disabled' : ''}`}
            >
              <div className="constraint-header">
                <span className="constraint-id">{constraint.id}</span>
                <span className={`constraint-type ${constraint.type}`}>
                  {constraint.type.toUpperCase()}
                </span>
              </div>
              <div className="constraint-expression">{constraint.expression}</div>
              {constraint.description && (
                <div className="constraint-description">{constraint.description}</div>
              )}
              {constraint.type === 'soft' && constraint.weight !== undefined && (
                <div className="constraint-weight">Weight: {constraint.weight}</div>
              )}
              <div className="constraint-actions">
                {onToggle && (
                  <button onClick={() => onToggle(constraint.id)}>
                    {constraint.enabled ? 'Disable' : 'Enable'}
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(constraint.id)} className="danger">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

**Step 2: Create CSS module**

Create `frontend/src/components/ConstraintList.module.css`:
```css
.constraint-list {
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.constraint-list h2 {
  margin-top: 0;
  color: #333;
}

.empty-state {
  color: #666;
  font-style: italic;
}

.constraint-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.constraint-item {
  padding: 1rem;
  margin-bottom: 0.5rem;
  background: white;
  border-left: 4px solid #3498db;
  border-radius: 4px;
  transition: opacity 0.2s;
}

.constraint-item.hard {
  border-left-color: #e74c3c;
}

.constraint-item.soft {
  border-left-color: #3498db;
}

.constraint-item.disabled {
  opacity: 0.5;
}

.constraint-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.constraint-id {
  font-weight: bold;
  color: #333;
}

.constraint-type {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-weight: bold;
}

.constraint-type.hard {
  background: #e74c3c;
  color: white;
}

.constraint-type.soft {
  background: #3498db;
  color: white;
}

.constraint-expression {
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: #555;
}

.constraint-description {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.constraint-weight {
  font-size: 0.85rem;
  color: #3498db;
  margin-bottom: 0.5rem;
}

.constraint-actions {
  display: flex;
  gap: 0.5rem;
}

.constraint-actions button {
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background-color 0.2s;
}

.constraint-actions button {
  background: #3498db;
  color: white;
}

.constraint-actions button:hover {
  background: #2980b9;
}

.constraint-actions button.danger {
  background: #e74c3c;
}

.constraint-actions button.danger:hover {
  background: #c0392b;
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/ConstraintList.*
git commit -m "feat: add ConstraintList component"
```

---

## Task 13: Frontend - Component: ScheduleGrid (Placeholder)

**Files:**
- Create: `frontend/src/components/ScheduleGrid.tsx`

**Step 1: Create ScheduleGrid placeholder**

Create `frontend/src/components/ScheduleGrid.tsx`:
```typescript
/**
 * ScheduleGrid - Visual schedule editor (placeholder).
 */
import React from 'react';

interface ScheduleGridProps {
  solution?: Record<string, any>;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ solution }) => {
  return (
    <div style={{ padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
      <h2>Schedule Grid</h2>
      {solution ? (
        <div>
          <p>Solution:</p>
          <pre style={{ background: 'white', padding: '1rem', borderRadius: '4px' }}>
            {JSON.stringify(solution, null, 2)}
          </pre>
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No solution to display. Run solver first.
        </p>
      )}
      <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '1rem' }}>
        Future: Interactive grid for exam scheduling visualization
      </p>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/components/ScheduleGrid.tsx
git commit -m "feat: add ScheduleGrid placeholder component"
```

---

## Task 14: Frontend - Component: ExplanationPanel (Placeholder)

**Files:**
- Create: `frontend/src/components/ExplanationPanel.tsx`

**Step 1: Create ExplanationPanel placeholder**

Create `frontend/src/components/ExplanationPanel.tsx`:
```typescript
/**
 * ExplanationPanel - Display MUS/MCS/OCUS explanations.
 */
import React from 'react';
import type { ExplanationResponse } from '../types';

interface ExplanationPanelProps {
  explanation?: ExplanationResponse;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({ explanation }) => {
  return (
    <div style={{ padding: '1rem', background: '#fff3cd', borderRadius: '8px' }}>
      <h2>Explanation</h2>
      {explanation ? (
        <div>
          <p>
            <strong>Type:</strong> {explanation.explanation_type.toUpperCase()}
          </p>
          <p>
            <strong>Description:</strong> {explanation.description}
          </p>
          <p>
            <strong>Constraint IDs:</strong> {explanation.constraint_ids.join(', ')}
          </p>
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No explanation available. Request MUS/MCS/OCUS for unsatisfiable models.
        </p>
      )}
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/components/ExplanationPanel.tsx
git commit -m "feat: add ExplanationPanel component"
```

---

## Task 15: Frontend - Component: TradeoffExplorer (Placeholder)

**Files:**
- Create: `frontend/src/components/TradeoffExplorer.tsx`

**Step 1: Create TradeoffExplorer placeholder**

Create `frontend/src/components/TradeoffExplorer.tsx`:
```typescript
/**
 * TradeoffExplorer - Visualize Pareto frontiers and soft constraint trade-offs.
 */
import React from 'react';

interface TradeoffExplorerProps {
  solutions?: Array<Record<string, any>>;
}

export const TradeoffExplorer: React.FC<TradeoffExplorerProps> = ({ solutions }) => {
  return (
    <div style={{ padding: '1rem', background: '#e7f3ff', borderRadius: '8px' }}>
      <h2>Trade-off Explorer</h2>
      {solutions && solutions.length > 0 ? (
        <div>
          <p>Found {solutions.length} alternative solution(s)</p>
          {/* Future: Pareto frontier visualization */}
        </div>
      ) : (
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          No alternative solutions yet. Use diverse solution enumeration.
        </p>
      )}
      <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '1rem' }}>
        Future: Interactive Pareto frontier chart
      </p>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add frontend/src/components/TradeoffExplorer.tsx
git commit -m "feat: add TradeoffExplorer placeholder component"
```

---

## Task 16: Frontend - Main App Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Step 1: Replace App.tsx with integrated version**

Replace `frontend/src/App.tsx`:
```typescript
import React, { useState } from 'react';
import './App.css';
import { ConstraintList } from './components/ConstraintList';
import { ScheduleGrid } from './components/ScheduleGrid';
import { ExplanationPanel } from './components/ExplanationPanel';
import { TradeoffExplorer } from './components/TradeoffExplorer';
import api from './services/api';
import type { CSPModel, SolveResponse, ExplanationResponse } from './types';

function App() {
  const [model, setModel] = useState<CSPModel | null>(null);
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load demo model
  const loadDemoModel = async () => {
    const demoModel: CSPModel = {
      id: 'demo-1',
      name: 'Demo CSP',
      variables: [
        { name: 'x', domain: [1, 2, 3] },
        { name: 'y', domain: [1, 2, 3] },
      ],
      constraints: [
        {
          id: 'c1',
          expression: 'x != y',
          type: 'hard',
          description: 'X and Y must be different',
          enabled: true,
        },
        {
          id: 'c2',
          expression: 'x > 1',
          type: 'soft',
          weight: 0.8,
          description: 'Prefer X greater than 1',
          enabled: true,
        },
      ],
    };

    try {
      setLoading(true);
      setError(null);
      const created = await api.createModel(demoModel);
      setModel(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create model');
    } finally {
      setLoading(false);
    }
  };

  // Solve model
  const handleSolve = async () => {
    if (!model) return;

    try {
      setLoading(true);
      setError(null);
      const result = await api.solve({ model_id: model.id });
      setSolveResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to solve model');
    } finally {
      setLoading(false);
    }
  };

  // Get explanation
  const handleExplain = async () => {
    if (!model) return;

    try {
      setLoading(true);
      setError(null);
      const result = await api.explainMUS({
        model_id: model.id,
        explanation_type: 'mus',
      });
      setExplanation(result);
    } catch (err: any) {
      setError(err.message || 'Failed to get explanation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>xCoS Dashboard</h1>
        <p>Explainable Constraint Solving</p>
      </header>

      <div className="controls">
        <button onClick={loadDemoModel} disabled={loading}>
          Load Demo Model
        </button>
        <button onClick={handleSolve} disabled={!model || loading}>
          Solve
        </button>
        <button onClick={handleExplain} disabled={!model || loading}>
          Explain (MUS)
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && <div className="loading">Processing...</div>}

      <div className="dashboard">
        <div className="left-panel">
          {model && (
            <ConstraintList
              constraints={model.constraints}
              onToggle={(id) => console.log('Toggle', id)}
              onDelete={(id) => console.log('Delete', id)}
            />
          )}
        </div>

        <div className="center-panel">
          <ScheduleGrid solution={solveResult?.solution} />
          {solveResult && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <h3>Solve Result</h3>
              <p>
                <strong>Status:</strong> {solveResult.status}
              </p>
              <p>
                <strong>Time:</strong> {solveResult.solve_time_ms.toFixed(2)} ms
              </p>
              {solveResult.message && <p>{solveResult.message}</p>}
            </div>
          )}
        </div>

        <div className="right-panel">
          <ExplanationPanel explanation={explanation} />
          <div style={{ marginTop: '1rem' }}>
            <TradeoffExplorer />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
```

**Step 2: Update App.css**

Replace `frontend/src/App.css`:
```css
.App {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem;
}

.App-header {
  text-align: center;
  margin-bottom: 2rem;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
}

.App-header h1 {
  margin: 0;
  font-size: 2rem;
}

.App-header p {
  margin: 0.5rem 0 0 0;
  font-size: 1rem;
  opacity: 0.9;
}

.controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  justify-content: center;
}

.controls button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
  background: #667eea;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

.controls button:hover:not(:disabled) {
  background: #5568d3;
}

.controls button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fee;
  color: #c00;
  border-left: 4px solid #c00;
  border-radius: 4px;
}

.loading {
  padding: 1rem;
  margin-bottom: 1rem;
  background: #e7f3ff;
  color: #0066cc;
  border-left: 4px solid #0066cc;
  border-radius: 4px;
  text-align: center;
}

.dashboard {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 1rem;
}

.left-panel,
.center-panel,
.right-panel {
  min-height: 300px;
}

@media (max-width: 1024px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
}
```

**Step 3: Test the application**

Run: `cd frontend && npm run dev`
Expected: App loads at http://localhost:5173

**Step 4: Verify functionality**
- Click "Load Demo Model" - should create model via API
- Click "Solve" - should call solve endpoint
- Click "Explain" - should get MUS explanation

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: integrate all components in main App"
```

---

## Task 17: VS Code Workspace Configuration

**Files:**
- Create: `xcos-dashboard.code-workspace`
- Create: `.vscode/launch.json`
- Create: `.vscode/settings.json`

**Step 1: Create workspace file**

Create `xcos-dashboard.code-workspace`:
```json
{
  "folders": [
    {
      "name": "Backend",
      "path": "backend"
    },
    {
      "name": "Frontend",
      "path": "frontend"
    },
    {
      "name": "Root",
      "path": "."
    }
  ],
  "settings": {
    "python.defaultInterpreterPath": "${workspaceFolder:Backend}/.venv/bin/python",
    "python.testing.pytestEnabled": true,
    "python.testing.pytestArgs": [
      "tests"
    ],
    "typescript.tsdk": "frontend/node_modules/typescript/lib",
    "editor.formatOnSave": true,
    "files.exclude": {
      "**/__pycache__": true,
      "**/*.pyc": true,
      "**/node_modules": true
    }
  },
  "extensions": {
    "recommendations": [
      "ms-python.python",
      "ms-python.vscode-pylance",
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "ms-vscode.vscode-typescript-next"
    ]
  }
}
```

**Step 2: Create launch configurations**

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "app.main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000"
      ],
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/backend"
      },
      "console": "integratedTerminal",
      "justMyCode": false
    },
    {
      "name": "Backend: Tests",
      "type": "python",
      "request": "launch",
      "module": "pytest",
      "args": [
        "tests/",
        "-v"
      ],
      "cwd": "${workspaceFolder}/backend",
      "console": "integratedTerminal"
    },
    {
      "name": "Frontend: Dev Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": [
        "run",
        "dev"
      ],
      "cwd": "${workspaceFolder}/frontend",
      "console": "integratedTerminal"
    }
  ],
  "compounds": [
    {
      "name": "Full Stack",
      "configurations": [
        "Backend: FastAPI",
        "Frontend: Dev Server"
      ],
      "presentation": {
        "order": 1
      }
    }
  ]
}
```

**Step 3: Create workspace settings**

Create `.vscode/settings.json`:
```json
{
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": false,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "editor.rulers": [88, 120],
  "files.trimTrailingWhitespace": true,
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.formatOnSave": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

**Step 4: Commit**

```bash
git add xcos-dashboard.code-workspace .vscode/
git commit -m "chore: add VS Code workspace configuration"
```

---

## Task 18: Documentation - README.md

**Files:**
- Create: `README.md`

**Step 1: Create comprehensive README**

Create `README.md`:
```markdown
# xCoS Dashboard

**Explainable Constraint Solving Dashboard**

An interactive full-stack application for modeling, solving, and explaining constraint satisfaction problems (CSPs) with transparency and human-centered design.

## 🎯 Features

- **Model CSPs** with hard and soft constraints
- **Solve** using CPMpy solver integration
- **Explain** unsatisfiability with MUS/MCS/OCUS
- **What-if** analysis for counterfactual reasoning
- **Interactive UI** with real-time updates
- **Modular architecture** for extensibility

## 🏗️ Architecture

### Backend
- **FastAPI** - Modern async web framework
- **CPMpy** - Constraint programming in Python
- **Pydantic** - Data validation and serialization
- **RESTful API** with automatic OpenAPI docs

### Frontend
- **React** with TypeScript
- **Vite** - Fast build tool and dev server
- **Axios** - HTTP client
- **Component-based** architecture

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- pip and npm

### Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
```

### Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload
```

Backend runs at: http://localhost:8000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Frontend runs at: http://localhost:5173

**Or use VS Code:**
- Open `xcos-dashboard.code-workspace`
- Press F5 and select "Full Stack"
- Both servers start automatically

## 📚 API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

## 🧪 Testing

### Backend Tests
```bash
cd backend
python -m pytest tests/ -v
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 📂 Project Structure

```
xcos-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── models.py         # Pydantic models
│   │   ├── routers/          # API endpoints
│   │   └── utils/            # Solver & explanation tools
│   ├── tests/                # Backend tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── services/         # API service
│   │   ├── types/            # TypeScript types
│   │   └── App.tsx           # Main app
│   └── package.json
├── docs/                     # Documentation
├── .vscode/                  # VS Code configuration
└── README.md
```

## 🛠️ Development

### Backend Development
- Code is in `backend/app/`
- Add tests in `backend/tests/`
- Run tests: `pytest tests/ -v`
- Format code: `black app/`

### Frontend Development
- Components in `frontend/src/components/`
- API calls in `frontend/src/services/api.ts`
- Types in `frontend/src/types/`
- Run dev server: `npm run dev`

## 📖 Further Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture details
- [SETUP.md](SETUP.md) - Detailed setup instructions
- [MILESTONES.md](MILESTONES.md) - Development roadmap

## 🤝 Contributing

This is a research project. For questions or contributions, please contact the project maintainers.

## 📄 License

[Add your license here]

## 🔗 Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [CPMpy Documentation](https://cpmpy.readthedocs.io/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 19: Documentation - ARCHITECTURE.md

**Files:**
- Create: `ARCHITECTURE.md`

**Step 1: Create architecture documentation**

Create `ARCHITECTURE.md`:
```markdown
# xCoS Dashboard Architecture

## System Overview

xCoS Dashboard is a full-stack web application for interactive constraint solving with explainability features.

## High-Level Architecture

```
┌─────────────────┐          ┌──────────────────┐
│                 │   HTTP   │                  │
│  React Frontend │◄────────►│  FastAPI Backend │
│  (TypeScript)   │   REST   │    (Python)      │
│                 │          │                  │
└─────────────────┘          └────────┬─────────┘
                                      │
                                      ▼
                             ┌─────────────────┐
                             │                 │
                             │  CPMpy Solver   │
                             │                 │
                             └─────────────────┘
```

## Backend Architecture

### Layer Structure

```
┌─────────────────────────────────────┐
│         API Layer (Routers)         │
│  model.py | solve.py | explain.py   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Business Logic Layer          │
│    solver.py | explain_tools.py     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Data Layer (Models)         │
│     Pydantic Models & Validation    │
└─────────────────────────────────────┘
```

### Key Components

#### 1. FastAPI Application (`main.py`)
- Application initialization
- CORS configuration
- Router registration
- Middleware setup

#### 2. Pydantic Models (`models.py`)
- Request/response schemas
- Data validation
- Type safety
- Serialization/deserialization

#### 3. API Routers (`routers/`)
- **model.py**: CRUD operations for CSP models
- **solve.py**: Solver invocation
- **explain.py**: MUS/MCS/OCUS explanations
- **whatif.py**: Counterfactual analysis

#### 4. Utilities (`utils/`)
- **solver.py**: CPMpy integration
- **explain_tools.py**: Explanation algorithms

### Data Flow

```
1. Client Request
   ↓
2. Router receives request
   ↓
3. Pydantic validates input
   ↓
4. Business logic processes
   ↓
5. CPMpy solves/explains
   ↓
6. Response serialized
   ↓
7. Client receives JSON
```

## Frontend Architecture

### Component Hierarchy

```
App
├── ConstraintList
├── ScheduleGrid
├── ExplanationPanel
└── TradeoffExplorer
```

### State Management

Currently uses React `useState` hooks. For complex state:
- Consider Context API
- Or Redux/Zustand for global state

### API Service Layer

`services/api.ts` provides:
- Centralized API calls
- Type-safe requests
- Error handling
- Axios client configuration

### Type System

`types/api.ts` mirrors backend Pydantic models:
- Ensures type consistency
- Compile-time checks
- IDE autocomplete

## Communication Patterns

### REST API
- **Create Model**: `POST /api/model`
- **Solve**: `POST /api/solve`
- **Explain**: `POST /api/explain/{type}`
- **What-If**: `POST /api/whatif`

### Future: WebSocket
- Real-time solver progress
- Streaming partial solutions
- Live updates during search

## Data Models

### Core Entities

**CSPModel**
- Variables with domains
- Hard/soft constraints
- Metadata

**Constraint**
- Expression (string)
- Type (hard/soft)
- Weight (for soft)
- Enabled flag

**SolveResponse**
- Status (SAT/UNSAT/OPTIMAL)
- Solution values
- Solve time
- Message

### Explanation Models

**MUS** - Minimal Unsatisfiable Subset
**MCS** - Minimal Correction Subset
**OCUS** - Optimal Correction Subset

## Solver Integration

### CPMpy Workflow

```python
# 1. Build CPMpy model
variables = [intvar(domain) for domain in domains]
constraints = [parse(expr) for expr in constraint_exprs]
model = Model(constraints)

# 2. Solve
result = model.solve()

# 3. Extract solution
solution = {var.name: var.value() for var in variables}
```

## Extensibility Points

### Adding New Solvers
1. Implement solver adapter in `utils/solver.py`
2. Maintain same interface
3. Update configuration

### Adding Explanation Types
1. Add algorithm to `utils/explain_tools.py`
2. Create router endpoint in `routers/explain.py`
3. Add Pydantic models if needed

### Adding Visualizations
1. Create React component
2. Add to component tree
3. Wire up API calls

## Performance Considerations

### Backend
- Use async/await for I/O
- Consider caching for repeated solves
- Profile solver performance
- Add timeout handling

### Frontend
- Lazy load components
- Debounce API calls
- Use React.memo for expensive renders
- Consider virtualization for large lists

## Security

### CORS
- Configured for localhost development
- Update origins for production

### Input Validation
- Pydantic validates all inputs
- Type checking prevents injection
- Sanitize constraint expressions

### Future Enhancements
- Authentication/authorization
- Rate limiting
- Input sanitization for expressions

## Deployment Architecture

### Development
```
Frontend (Vite dev server :5173) ──► Backend (Uvicorn :8000)
```

### Production
```
Frontend (Nginx/static) ──► Backend (Gunicorn + Uvicorn workers)
                                      │
                                      ▼
                            PostgreSQL (model storage)
```

## Technology Choices

### Why FastAPI?
- Modern async support
- Automatic API documentation
- Type hints and validation
- High performance

### Why CPMpy?
- Python-native CSP modeling
- Multiple solver backends
- Declarative syntax
- Research-friendly

### Why React + TypeScript?
- Component reusability
- Type safety
- Rich ecosystem
- Developer experience

### Why Vite?
- Fast HMR (Hot Module Replacement)
- Modern build tool
- ESM-first
- Optimized production builds

## Future Architecture Enhancements

1. **Database Layer**
   - PostgreSQL for persistence
   - Model versioning
   - User sessions

2. **Caching Layer**
   - Redis for solver results
   - Reduce redundant computations

3. **Message Queue**
   - Celery for long-running solves
   - Background task processing

4. **WebSocket Integration**
   - Real-time progress updates
   - Collaborative editing

5. **Microservices**
   - Separate solver service
   - Explanation service
   - Scaling independent components
```

**Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: add architecture documentation"
```

---

## Task 20: Documentation - SETUP.md and MILESTONES.md

**Files:**
- Create: `SETUP.md`
- Create: `MILESTONES.md`

**Step 1: Create setup guide**

Create `SETUP.md`:
```markdown
# xCoS Dashboard Setup Guide

Detailed setup instructions for Linux Mint 22.2 (Ubuntu 24.04 base) and other platforms.

## Prerequisites

### System Requirements
- Linux Mint 22.2 or Ubuntu 24.04+ (primary target)
- Python 3.12 or higher
- Node.js 18 or higher
- 4GB RAM minimum
- 1GB disk space

### Software Installation

#### Python 3.12
```bash
# Usually pre-installed on Linux Mint 22.2
python3 --version

# If not installed:
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

#### Node.js 18+
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version
npm --version
```

#### Git
```bash
sudo apt install git
```

## Project Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd xcos-dashboard
```

Or if starting from scratch, navigate to the project directory.

### 2. Backend Setup

#### Create Virtual Environment
```bash
cd backend
python3 -m venv .venv
```

#### Activate Virtual Environment
```bash
# Linux/Mac
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

You should see `(.venv)` in your terminal prompt.

#### Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### Verify Installation
```bash
python -c "import fastapi, cpmpy; print('Success!')"
```

#### Run Tests
```bash
python -m pytest tests/ -v
```

All tests should pass.

### 3. Frontend Setup

#### Navigate to Frontend
```bash
cd ../frontend
```

#### Install Dependencies
```bash
npm install
```

This will install all packages from `package.json`.

#### Verify Installation
```bash
npm list axios react
```

### 4. VS Code Setup (Recommended)

#### Install VS Code
```bash
# If not already installed
sudo snap install code --classic
```

#### Open Workspace
```bash
# From project root
code xcos-dashboard.code-workspace
```

#### Install Recommended Extensions
VS Code will prompt to install recommended extensions:
- Python
- Pylance
- ESLint
- Prettier
- TypeScript

Click "Install All" when prompted.

#### Configure Python Interpreter
1. Open Command Palette (Ctrl+Shift+P)
2. Type "Python: Select Interpreter"
3. Choose `./backend/.venv/bin/python`

## Running the Application

### Method 1: Manual (Two Terminals)

#### Terminal 1: Backend
```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload
```

Backend starts at http://localhost:8000

#### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

Frontend starts at http://localhost:5173

### Method 2: VS Code Launch (Recommended)

1. Open workspace in VS Code
2. Press F5
3. Select "Full Stack" from dropdown
4. Both servers start automatically

### Method 3: Using Scripts (Future Enhancement)

Create `start.sh`:
```bash
#!/bin/bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload &
cd frontend && npm run dev &
wait
```

## Verification

### 1. Backend Health Check
```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy"}
```

### 2. API Documentation
Open browser: http://localhost:8000/api/docs

### 3. Frontend Access
Open browser: http://localhost:5173

### 4. Test End-to-End Flow
1. Click "Load Demo Model"
2. Click "Solve"
3. Click "Explain (MUS)"
4. Verify results display correctly

## Common Issues

### Python Version Mismatch
```bash
# Check version
python3 --version

# If < 3.12, install:
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.12 python3.12-venv
```

### Permission Errors
```bash
# If pip fails
pip install --user -r requirements.txt

# Or use sudo (not recommended for venv)
```

### Node Module Errors
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Port Already in Use
```bash
# Find process using port 8000
sudo lsof -i :8000
# Kill it
kill -9 <PID>

# Or use different port
uvicorn app.main:app --reload --port 8001
```

### CORS Errors
Check `backend/app/main.py`:
```python
allow_origins=["http://localhost:5173", "http://localhost:3000"]
```

Add your frontend URL if different.

## Development Workflow

### Daily Workflow
1. Activate backend venv: `source backend/.venv/bin/activate`
2. Start backend: `uvicorn app.main:app --reload`
3. Start frontend: `npm run dev` (in separate terminal)
4. Code, test, commit

### Before Committing
```bash
# Backend tests
cd backend
python -m pytest tests/ -v

# Frontend build check
cd frontend
npm run build

# Lint check
npm run lint
```

### Updating Dependencies

#### Backend
```bash
cd backend
source .venv/bin/activate
pip install <package>
pip freeze > requirements.txt
```

#### Frontend
```bash
cd frontend
npm install <package>
# package.json updates automatically
```

## Production Deployment (Future)

### Backend
```bash
# Use Gunicorn with Uvicorn workers
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Frontend
```bash
# Build production bundle
npm run build

# Serve with Nginx or similar
```

## Additional Tools

### Python Linting
```bash
pip install flake8 black
flake8 app/
black app/ --check
```

### TypeScript Checking
```bash
cd frontend
npm run type-check
```

## Getting Help

- Check logs in terminal
- Review API docs: http://localhost:8000/api/docs
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- See [README.md](README.md) for quick reference
```

**Step 2: Create milestones document**

Create `MILESTONES.md`:
```markdown
# xCoS Dashboard Development Milestones

Development roadmap from initial scaffold to production-ready system.

## ✅ Milestone 1: Core Scaffold (COMPLETE)

**Goal**: Working full-stack application with basic functionality

**Backend Tasks**:
- [x] Project structure setup
- [x] Pydantic models for CSP domain
- [x] FastAPI application with CORS
- [x] Model management router (CRUD)
- [x] Solve endpoint with CPMpy integration
- [x] Explanation endpoints (MUS/MCS/OCUS placeholders)
- [x] What-if endpoint (placeholder)
- [x] Test suite with pytest

**Frontend Tasks**:
- [x] Vite + React + TypeScript setup
- [x] TypeScript types matching backend
- [x] API service with axios
- [x] ConstraintList component
- [x] ScheduleGrid component (placeholder)
- [x] ExplanationPanel component
- [x] TradeoffExplorer component (placeholder)
- [x] Main App integration

**DevOps Tasks**:
- [x] VS Code workspace configuration
- [x] Launch configurations for debugging
- [x] Project documentation (README, ARCHITECTURE, SETUP)

**Deliverables**:
- Working backend API at http://localhost:8000
- Working frontend UI at http://localhost:5173
- API documentation at http://localhost:8000/api/docs
- End-to-end demo flow functional

---

## 🚧 Milestone 2: Explanation Core

**Goal**: Implement actual MUS/MCS/OCUS algorithms

**Backend Tasks**:
- [ ] Implement constraint expression parser
- [ ] Integrate CPMpy constraint building from expressions
- [ ] Implement MUS algorithm (QuickXplain or MARCO)
- [ ] Implement MCS algorithm
- [ ] Implement OCUS algorithm
- [ ] Add explanation caching
- [ ] Performance optimization for large models
- [ ] Add tests for explanation algorithms

**Frontend Tasks**:
- [ ] Enhanced ExplanationPanel with visualization
- [ ] Constraint highlighting in ConstraintList
- [ ] Interactive explanation exploration
- [ ] Explanation comparison view

**Deliverables**:
- Accurate MUS/MCS/OCUS for unsatisfiable models
- Visual explanation workflow in UI
- Performance < 700ms for small models
- Test coverage > 80%

**Estimated Time**: 2-3 weeks

---

## 🚧 Milestone 3: Interactive Editing

**Goal**: Enable constraint editing and real-time updates

**Backend Tasks**:
- [ ] WebSocket endpoint for live updates
- [ ] Incremental solving for constraint changes
- [ ] Constraint suggestion system
- [ ] Validation for constraint syntax
- [ ] Undo/redo support

**Frontend Tasks**:
- [ ] Inline constraint editor
- [ ] Add/delete constraint UI
- [ ] Weight slider for soft constraints
- [ ] Enable/disable toggle with live updates
- [ ] WebSocket integration for real-time feedback
- [ ] Undo/redo buttons

**Deliverables**:
- Interactive constraint editing
- Real-time solver feedback
- What-if suggestions integrated
- Smooth UX with < 200ms response

**Estimated Time**: 2-3 weeks

---

## 🚧 Milestone 4: Visualization & Trade-offs

**Goal**: Visualize solutions and Pareto frontiers

**Backend Tasks**:
- [ ] Diverse solution enumeration
- [ ] Pareto frontier computation
- [ ] Alternative solution ranking
- [ ] Objective value tracking
- [ ] Solution comparison API

**Frontend Tasks**:
- [ ] Implement ScheduleGrid for exam scheduling
- [ ] Pareto frontier chart (D3.js or Chart.js)
- [ ] Solution comparison view
- [ ] Trade-off explorer with sliders
- [ ] Export solutions to CSV/JSON

**Deliverables**:
- Interactive schedule grid
- Pareto frontier visualization
- Solution comparison tools
- Export functionality

**Estimated Time**: 3-4 weeks

---

## 🚧 Milestone 5: Optimization & Polish

**Goal**: Production-ready performance and UX

**Backend Tasks**:
- [ ] Database integration (PostgreSQL)
- [ ] Model versioning and history
- [ ] Solver timeout handling
- [ ] Rate limiting and security
- [ ] API key authentication (optional)
- [ ] Logging and monitoring

**Frontend Tasks**:
- [ ] Loading states and progress bars
- [ ] Error handling and user feedback
- [ ] Keyboard shortcuts
- [ ] Accessibility (ARIA labels)
- [ ] Mobile responsive design
- [ ] Dark mode support

**DevOps Tasks**:
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Deployment scripts
- [ ] Environment configuration
- [ ] Performance monitoring

**Deliverables**:
- Dockerized application
- CI/CD pipeline
- Production deployment guide
- Performance benchmarks
- Security audit

**Estimated Time**: 2-3 weeks

---

## 🚧 Milestone 6: Evaluation & Research

**Goal**: Validate system effectiveness for HCI research

**Tasks**:
- [ ] User study protocol
- [ ] Task scenarios for evaluation
- [ ] Comprehension questions
- [ ] SUS (System Usability Scale) questionnaire
- [ ] Data collection infrastructure
- [ ] Statistical analysis scripts
- [ ] Research paper draft

**Metrics**:
- Task success rate
- Time to solution
- Explanation comprehension score
- SUS score ≥ 80
- User feedback qualitative analysis

**Deliverables**:
- Evaluation results
- Research paper
- Demo video
- Conference presentation

**Estimated Time**: 4-6 weeks

---

## Future Enhancements

### Advanced Features
- [ ] Constraint templates library
- [ ] Natural language constraint input
- [ ] Collaborative multi-user editing
- [ ] Machine learning for constraint suggestions
- [ ] Integration with external data sources

### Domain Extensions
- [ ] Exam scheduling domain
- [ ] Resource allocation problems
- [ ] Vehicle routing problems
- [ ] Job shop scheduling
- [ ] Nurse rostering

### Research Extensions
- [ ] Counterfactual explanation generation
- [ ] Interactive repair strategies
- [ ] Trust calibration mechanisms
- [ ] Cognitive load measurement
- [ ] Explainability metrics

---

## Progress Tracking

**Current Milestone**: Milestone 1 (Core Scaffold) - COMPLETE
**Next Milestone**: Milestone 2 (Explanation Core)
**Overall Progress**: 16% (1/6 milestones)

**Update this document** as milestones are completed and new tasks are discovered.
```

**Step 3: Commit**

```bash
git add SETUP.md MILESTONES.md
git commit -m "docs: add SETUP and MILESTONES documentation"
```

---

## Task 21: Final Integration Test

**Step 1: Verify backend tests pass**

Run: `cd backend && python -m pytest tests/ -v --tb=short`
Expected: All tests pass

**Step 2: Verify backend runs**

Run: `cd backend && source .venv/bin/activate && python -m uvicorn app.main:app --reload`
Expected: Server starts without errors

**Step 3: Verify API documentation**

Open: http://localhost:8000/api/docs
Expected: All endpoints visible (model, solve, explain, whatif)

**Step 4: Test API endpoints manually**

Run in separate terminal:
```bash
# Create model
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{"id":"test","name":"Test","variables":[],"constraints":[]}'

# List models
curl http://localhost:8000/api/model

# Health check
curl http://localhost:8000/health
```

Expected: All return valid JSON

**Step 5: Verify frontend runs**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts

**Step 6: Test frontend in browser**

Open: http://localhost:5173
- Click "Load Demo Model" - should succeed
- Click "Solve" - should show solution
- Click "Explain" - should show explanation
Expected: All work without console errors

**Step 7: Verify full stack communication**

- Open browser DevTools (F12)
- Go to Network tab
- Click "Load Demo Model"
- Verify POST to /api/model succeeds (201)
- Click "Solve"
- Verify POST to /api/solve succeeds (200)

**Step 8: Create final checkpoint**

```bash
git add -A
git commit -m "chore: final integration test and verification complete"
git tag v0.1.0-scaffold
```

---

## Implementation Plan Complete

**Total Tasks**: 21
**Estimated Time**: 3-5 days for experienced developer

**Next Steps**:
1. Execute this plan task-by-task
2. Run tests after each task
3. Commit frequently
4. Verify full stack works at end
5. Proceed to Milestone 2 (Explanation Core)

**Plan saved to**: `docs/plans/2025-10-16-xcos-dashboard-scaffold.md`
