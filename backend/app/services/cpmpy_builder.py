"""Build CPMpy models from Pydantic data structures."""
import cpmpy as cp
from typing import Dict, List, Any
from app.models import CSPModel, Constraint, Variable, ConstraintType


class CPMpyModelBuilder:
    """Converts Pydantic CSPModel to executable CPMpy model."""

    def __init__(self):
        self.var_map: Dict[str, cp.intvar] = {}

    def build(self, model: CSPModel) -> cp.Model:
        """
        Build a CPMpy model from Pydantic CSPModel.

        Args:
            model: Pydantic CSPModel with variables and constraints

        Returns:
            cp.Model: Executable CPMpy model

        Example:
            builder = CPMpyModelBuilder()
            cpm_model = builder.build(pydantic_model)
            is_sat = cpm_model.solve()
        """
        # Step 1: Create CPMpy variables
        self._create_variables(model.variables)

        # Step 2: Build constraints
        constraints = self._build_constraints(model.constraints)

        # Step 3: Create CPMpy model
        cpm_model = cp.Model(constraints)

        return cpm_model

    def _create_variables(self, variables: List[Variable]) -> None:
        """
        Create CPMpy variables from Pydantic Variable definitions.

        Handles different domain types:
        - Integer ranges: domain=[1,2,3,4,5] → intvar with bounds
        - Discrete values: domain=['a','b','c'] → intvar with index mapping
        - Named slots: domain=['Mon_9am', 'Mon_2pm'] → intvar(0, len(domain)-1)
        """
        for var in variables:
            domain = var.domain

            if not domain:
                raise ValueError(f"Variable {var.name} has empty domain")

            # Check if domain is all integers
            if all(isinstance(v, int) for v in domain):
                # Integer domain - create intvar with min/max bounds
                lb = min(domain)
                ub = max(domain)
                self.var_map[var.name] = cp.intvar(lb, ub, name=var.name)
            else:
                # Discrete/named domain - create intvar as index into domain
                # We'll map 0..(len-1) to the actual domain values
                self.var_map[var.name] = cp.intvar(0, len(domain)-1, name=var.name)
                # Store mapping for later retrieval
                self.var_map[f"{var.name}_domain"] = domain

    def _build_constraints(self, constraints: List[Constraint]) -> List:
        """
        Build CPMpy constraints from Pydantic Constraint definitions.

        Parses constraint expressions like:
        - "Exam_A != Exam_B" → var_map['Exam_A'] != var_map['Exam_B']
        - "Exam_A + Exam_B <= 5" → var_map['Exam_A'] + var_map['Exam_B'] <= 5
        - "AllDifferent([Exam_A, Exam_B, Exam_C])" → cp.AllDifferent([...])
        """
        cpm_constraints = []

        for constraint in constraints:
            if not constraint.enabled:
                continue  # Skip disabled constraints

            try:
                # Parse and evaluate constraint expression
                cpm_constraint = self._parse_expression(constraint.expression)

                # Handle soft constraints (will be penalties later)
                if constraint.type == ConstraintType.SOFT:
                    # For now, add as hard constraint
                    # TODO: Implement soft constraint handling with penalties
                    cpm_constraints.append(cpm_constraint)
                else:
                    # Hard constraint
                    cpm_constraints.append(cpm_constraint)

            except Exception as e:
                raise ValueError(f"Failed to parse constraint '{constraint.expression}': {e}")

        return cpm_constraints

    def _parse_expression(self, expression: str):
        """
        Parse constraint expression string into CPMpy constraint.

        Supports:
        - Comparison operators: !=, ==, <, >, <=, >=
        - Arithmetic: +, -, *, /
        - Global constraints: AllDifferent, Sum, etc.
        - Logical: &, |, ~

        Security: Uses safe evaluation with limited namespace
        """
        # Create safe namespace with CPMpy functions and our variables
        namespace = {
            'AllDifferent': cp.AllDifferent,
            'AllEqual': cp.AllEqual,
            'Sum': sum,  # Python built-in
            **self.var_map  # Add all our variables
        }

        try:
            # Safe evaluation of expression
            constraint = eval(expression, {"__builtins__": {}}, namespace)
            return constraint
        except Exception as e:
            raise ValueError(f"Invalid constraint expression: {e}")

    def get_solution(self) -> Dict[str, Any]:
        """
        Extract solution from solved CPMpy variables.

        Returns:
            Dict mapping variable names to their assigned values
            For discrete domains, returns the actual domain value (not the index)
        """
        solution = {}

        for var_name, cpm_var in self.var_map.items():
            # Skip domain mappings
            if var_name.endswith('_domain'):
                continue

            if cpm_var.value() is not None:
                # Check if this variable has a discrete domain
                domain_key = f"{var_name}_domain"
                if domain_key in self.var_map:
                    # Map index back to actual domain value
                    domain = self.var_map[domain_key]
                    idx = cpm_var.value()
                    solution[var_name] = domain[idx]
                else:
                    # Integer domain - use value directly
                    solution[var_name] = int(cpm_var.value())

        return solution


def build_cpmpy_model(model: CSPModel) -> tuple[cp.Model, CPMpyModelBuilder]:
    """
    Helper function to build CPMpy model and return builder for solution extraction.

    Args:
        model: Pydantic CSPModel

    Returns:
        tuple: (CPMpy model, builder instance for solution extraction)
    """
    builder = CPMpyModelBuilder()
    cpm_model = builder.build(model)
    return cpm_model, builder
