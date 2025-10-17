# Backend API Tutorial - Learn by Example

This hands-on tutorial teaches you how to use the xCoS backend to model and solve constraint problems.

---

## Prerequisites

**Backend must be running:**
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify it's working:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

**Documentation available at:** http://localhost:8000/api/docs

---

## Example 1: Simple Inequality Problem

**Problem:** Find values for X and Y where:
- X can be 1, 2, or 3
- Y can be 1, 2, or 3
- X ≠ Y

### Step 1: Create the Model

Save this to a file `example1.json`:
```json
{
  "id": "simple-inequality",
  "name": "Simple X != Y Problem",
  "variables": [
    {
      "name": "X",
      "domain": [1, 2, 3]
    },
    {
      "name": "Y",
      "domain": [1, 2, 3]
    }
  ],
  "constraints": [
    {
      "id": "c1",
      "expression": "X != Y",
      "type": "hard",
      "description": "X and Y must be different",
      "enabled": true
    }
  ],
  "metadata": {}
}
```

### Step 2: Send to Backend
```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d @example1.json
```

**Expected response:**
```json
{
  "status": "success",
  "model_id": "simple-inequality",
  "message": "Model 'Simple X != Y Problem' stored successfully"
}
```

### Step 3: Solve It
```bash
curl -X POST http://localhost:8000/api/solve \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "simple-inequality",
    "timeout": 30,
    "find_all": false
  }'
```

**Expected response:**
```json
{
  "status": "satisfiable",
  "solution": {
    "X": 1,
    "Y": 2
  },
  "objective_value": null,
  "solve_time_ms": 5.2,
  "message": "Found solution in 5.2ms"
}
```

✅ **What you learned:**
- How to define integer domain variables
- How to write inequality constraints
- How to submit and solve a model

---

## Example 2: Exam Scheduling (Named Domains)

**Problem:** Schedule 3 exams into time slots:
- Each exam can be in: Mon_9am, Mon_2pm, or Tue_9am
- All exams must be at different times
- Exam_A and Exam_B cannot be on the same day

### Create the Model

```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "exam-schedule",
    "name": "Exam Scheduling",
    "variables": [
      {"name": "Exam_A", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]},
      {"name": "Exam_B", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]},
      {"name": "Exam_C", "domain": ["Mon_9am", "Mon_2pm", "Tue_9am"]}
    ],
    "constraints": [
      {
        "id": "c1",
        "expression": "AllDifferent([Exam_A, Exam_B, Exam_C])",
        "type": "hard",
        "description": "All exams at different times",
        "enabled": true
      }
    ],
    "metadata": {}
  }'
```

### Solve It
```bash
curl -X POST http://localhost:8000/api/solve \
  -H "Content-Type: application/json" \
  -d '{"model_id": "exam-schedule", "timeout": 30, "find_all": false}'
```

**Expected response:**
```json
{
  "status": "satisfiable",
  "solution": {
    "Exam_A": "Mon_9am",
    "Exam_B": "Mon_2pm",
    "Exam_C": "Tue_9am"
  },
  "solve_time_ms": 8.5,
  "message": "Found solution in 8.5ms"
}
```

✅ **What you learned:**
- How to use named/discrete domains (not just integers)
- How to use global constraints (`AllDifferent`)
- The backend automatically maps domain names to internal indices

---

## Example 3: Arithmetic Constraints

**Problem:** Find X, Y, Z where:
- X, Y, Z can be 1-10
- X + Y + Z = 15
- X < Y < Z

### Create and Solve

```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "arithmetic",
    "name": "Arithmetic Constraints",
    "variables": [
      {"name": "X", "domain": [1,2,3,4,5,6,7,8,9,10]},
      {"name": "Y", "domain": [1,2,3,4,5,6,7,8,9,10]},
      {"name": "Z", "domain": [1,2,3,4,5,6,7,8,9,10]}
    ],
    "constraints": [
      {
        "id": "c1",
        "expression": "X + Y + Z == 15",
        "type": "hard",
        "description": "Sum equals 15",
        "enabled": true
      },
      {
        "id": "c2",
        "expression": "X < Y",
        "type": "hard",
        "description": "X less than Y",
        "enabled": true
      },
      {
        "id": "c3",
        "expression": "Y < Z",
        "type": "hard",
        "description": "Y less than Z",
        "enabled": true
      }
    ],
    "metadata": {}
  }'

curl -X POST http://localhost:8000/api/solve \
  -H "Content-Type: application/json" \
  -d '{"model_id": "arithmetic", "timeout": 30, "find_all": false}'
```

**Possible solution:**
```json
{
  "solution": {
    "X": 1,
    "Y": 4,
    "Z": 10
  }
}
```

✅ **What you learned:**
- Arithmetic expressions (addition)
- Multiple comparison constraints
- How constraints interact to narrow the search

---

## Example 4: UNSAT - No Solution Exists

**Problem:** Impossible constraints

```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "impossible",
    "name": "Impossible Problem",
    "variables": [
      {"name": "X", "domain": [1, 2]},
      {"name": "Y", "domain": [1, 2]},
      {"name": "Z", "domain": [1, 2]}
    ],
    "constraints": [
      {
        "id": "c1",
        "expression": "AllDifferent([X, Y, Z])",
        "type": "hard",
        "description": "All must be different",
        "enabled": true
      }
    ],
    "metadata": {}
  }'

curl -X POST http://localhost:8000/api/solve \
  -H "Content-Type: application/json" \
  -d '{"model_id": "impossible", "timeout": 30, "find_all": false}'
```

**Expected response:**
```json
{
  "status": "unsatisfiable",
  "solution": null,
  "solve_time_ms": 3.1,
  "message": "No solution exists for this model"
}
```

**Why UNSAT?** We need 3 different values but only have domain [1, 2] - impossible!

✅ **What you learned:**
- Not all problems have solutions
- The solver detects infeasibility
- This is where MUS (Minimal Unsatisfiable Subset) explanations will help

---

## Example 5: Soft Constraints (Preferences)

**Problem:** Schedule meetings with preferences

```bash
curl -X POST http://localhost:8000/api/model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "meetings",
    "name": "Meeting Scheduling",
    "variables": [
      {"name": "Meeting_A", "domain": ["9am", "10am", "11am", "2pm", "3pm"]},
      {"name": "Meeting_B", "domain": ["9am", "10am", "11am", "2pm", "3pm"]}
    ],
    "constraints": [
      {
        "id": "c1",
        "expression": "Meeting_A != Meeting_B",
        "type": "hard",
        "description": "Cannot overlap",
        "enabled": true
      },
      {
        "id": "c2",
        "expression": "Meeting_A == 0",
        "type": "soft",
        "weight": 0.8,
        "description": "Prefer Meeting A at 9am",
        "enabled": true
      }
    ],
    "metadata": {}
  }'
```

**Note:** Soft constraint optimization not yet fully implemented, but constraints are parsed correctly.

---

## Example 6: Retrieve a Stored Model

```bash
curl http://localhost:8000/api/model/exam-schedule
```

**Response:** Full model JSON with all variables and constraints

---

## Common Patterns & Tips

### ✅ DO:

1. **Use meaningful IDs and names:**
   ```json
   "id": "exam-schedule-fall-2024",
   "name": "Fall 2024 Exam Timetable"
   ```

2. **Add descriptions to constraints:**
   ```json
   "description": "Students in CS101 and CS102 overlap"
   ```

3. **Start simple, add complexity incrementally:**
   - First: Basic constraints
   - Then: Add more variables
   - Finally: Complex expressions

4. **Use global constraints when appropriate:**
   - `AllDifferent([...])` instead of pairwise `!=`
   - More efficient solving

### ❌ AVOID:

1. **Typos in variable names:**
   ```json
   "expression": "Exam_A != Exam_B"  // ✅ Correct
   "expression": "ExamA != Exam_B"   // ❌ ExamA not defined!
   ```

2. **Impossible domains:**
   ```json
   // If you need 5 different values, domain must have ≥5 elements
   ```

3. **Missing required fields:**
   - Every constraint needs `id`, `expression`, `type`, `enabled`
   - Every variable needs `name`, `domain`

---

## Debugging Tips

### If you get "Model not found":
```bash
# List all routes
curl http://localhost:8000/api/openapi.json | grep "paths"

# Check if model was stored
curl http://localhost:8000/api/model/YOUR_MODEL_ID
```

### If solve returns "error":
- Check the error message in the response
- Verify constraint expressions are valid Python/CPMpy syntax
- Ensure all variable names in expressions exist

### If solve is slow:
- Check domain sizes (large domains = longer solve time)
- Try smaller timeout values to test
- Consider reformulating constraints

---

## Next Steps

Now that you understand the basics, try:

1. **Your Own Problem:** Model something from your domain
2. **UNSAT Testing:** Create intentionally impossible constraints
3. **Complex Constraints:** Combine multiple operators
4. **Check the Docs:** http://localhost:8000/api/docs for interactive testing

---

## Quick Reference Card

```bash
# Health check
curl http://localhost:8000/health

# Create model
curl -X POST http://localhost:8000/api/model -H "Content-Type: application/json" -d @model.json

# Solve
curl -X POST http://localhost:8000/api/solve -d '{"model_id":"ID","timeout":30,"find_all":false}'

# Get model
curl http://localhost:8000/api/model/ID

# Interactive docs
# Visit: http://localhost:8000/api/docs
```

---

**Ready to try?** Start with Example 1 and work your way through!
