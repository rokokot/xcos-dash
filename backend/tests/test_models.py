"""Tests for Pydantic data models."""
import pytest
from app.models import (
    Constraint, ConstraintType, CSPModel, SolveRequest,
    Variable, SolveResponse, SolveStatus
)


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
