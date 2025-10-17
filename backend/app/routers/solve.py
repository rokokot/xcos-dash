"""API routes for CSP solving."""
from fastapi import APIRouter, HTTPException
from app.models import CSPModel, SolveRequest, SolveResponse
from app.services.solver import solver_service

router = APIRouter(prefix="/api", tags=["solving"])


@router.post("/solve", response_model=SolveResponse)
async def solve_model(request: SolveRequest) -> SolveResponse:
    """
    Solve a CSP model.

    Args:
        request: SolveRequest with model_id, timeout, find_all options

    Returns:
        SolveResponse with status, solution, and timing

    Example:
        POST /api/solve
        {
            "model_id": "model-123",
            "timeout": 30,
            "find_all": false
        }
    """
    # Retrieve model from cache
    model = solver_service.get_model(request.model_id)

    if not model:
        raise HTTPException(status_code=404, detail=f"Model {request.model_id} not found")

    # Solve the model
    response = solver_service.solve(
        model=model,
        timeout=request.timeout,
        find_all=request.find_all
    )

    return response


@router.post("/model", response_model=dict)
async def create_model(model: CSPModel) -> dict:
    """
    Create or update a CSP model.

    Args:
        model: Complete CSPModel with variables and constraints

    Returns:
        Confirmation with model ID

    Example:
        POST /api/model
        {
            "id": "model-123",
            "name": "Exam Scheduling",
            "variables": [...],
            "constraints": [...]
        }
    """
    # Store model
    solver_service.store_model(model)

    return {
        "status": "success",
        "model_id": model.id,
        "message": f"Model '{model.name}' stored successfully"
    }


@router.get("/model/{model_id}", response_model=CSPModel)
async def get_model(model_id: str) -> CSPModel:
    """
    Retrieve a stored CSP model.

    Args:
        model_id: ID of the model to retrieve

    Returns:
        Complete CSPModel

    Raises:
        HTTPException: If model not found
    """
    model = solver_service.get_model(model_id)

    if not model:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    return model
