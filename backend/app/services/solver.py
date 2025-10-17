"""Solver service for CSP solving using CPMpy."""
import time
from typing import Optional
from app.models import CSPModel, SolveResponse, SolveStatus
from app.services.cpmpy_builder import build_cpmpy_model


class SolverService:
    """Service for solving CSP models using CPMpy."""

    def __init__(self):
        self.models = {}  # Cache of models by ID

    def solve(
        self,
        model: CSPModel,
        timeout: Optional[int] = 30,
        find_all: bool = False
    ) -> SolveResponse:
        """
        Solve a CSP model using CPMpy.

        Args:
            model: Pydantic CSPModel to solve
            timeout: Solver timeout in seconds
            find_all: Whether to find all solutions (vs. first solution)

        Returns:
            SolveResponse with solution and metadata
        """
        try:
            # Build CPMpy model
            start_time = time.time()
            cpm_model, builder = build_cpmpy_model(model)

            # Solve
            is_sat = cpm_model.solve(time_limit=timeout)
            solve_time_ms = (time.time() - start_time) * 1000

            if is_sat:
                # Extract solution
                solution = builder.get_solution()

                return SolveResponse(
                    status=SolveStatus.SATISFIABLE,
                    solution=solution,
                    solve_time_ms=solve_time_ms,
                    message=f"Found solution in {solve_time_ms:.1f}ms"
                )
            else:
                # UNSAT
                return SolveResponse(
                    status=SolveStatus.UNSATISFIABLE,
                    solution=None,
                    solve_time_ms=solve_time_ms,
                    message="No solution exists for this model"
                )

        except Exception as e:
            return SolveResponse(
                status=SolveStatus.ERROR,
                solution=None,
                solve_time_ms=0.0,
                message=f"Solver error: {str(e)}"
            )

    def store_model(self, model: CSPModel) -> None:
        """Store model in cache for later retrieval."""
        self.models[model.id] = model

    def get_model(self, model_id: str) -> Optional[CSPModel]:
        """Retrieve cached model by ID."""
        return self.models.get(model_id)


# Global solver instance
solver_service = SolverService()
