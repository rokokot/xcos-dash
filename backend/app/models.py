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
