
## 🌐 xCoS System Implementation Blueprint

**Goal:** Operationalize the *Model–Solve–Explain* loop into an interactive, human-centered dashboard for constraint solving.

---

### **1. Input and Model Initialization**

**Objective:** Gather and structure domain data (e.g., exam scheduling, nurse rostering) into a valid CPMpy model.

**Rules:**
1.1. Load domain data (exams, rooms, preferences) → normalize into CPMpy-compatible tables.
1.2. Initialize decision variables (`cp.intvar`, `cp.boolvar`) and domain bounds.
1.3. Construct constraint sets:

* `HARD`: domain and structural constraints
* `SOFT`: preference-based or weighted constraints
  1.4. Add optional objective functions:
* single-objective (maximize satisfaction, minimize penalty)
* multi-objective (trade-off scores between satisfaction, fairness, utilization)

**Artifacts produced:**
`model`, `variables`, `constraints`, `objective`

**Data type produced:** *Constraint sets, variable domains, objectives*

---

### **2. Solve Phase**

**Objective:** Run the solver, capture results and metadata.
(Backbone: CPMpy + FastAPI backend)

**Rules:**
2.1. Call `model.solve()` or `solver.solve()` with metadata logging enabled.
2.2. Record:

* `status()` → SAT / UNSAT
* `objective_value()` → if applicable
* `var.value()` → variable assignments
* search statistics (time, branches, conflicts)
  2.3. If incremental solving is enabled → push intermediate results via WebSocket.

**Artifacts produced:**
`solution`, `solver_state`, `log_trace`

**Data type produced:** *Assignments, constraint satisfaction state, solver progress*

---

### **3. Feasibility & Conflict Diagnosis**

**Objective:** Provide first-line explanations for SAT/UNSAT outcomes.

**Rules:**
3.1. If **UNSAT**, compute and store:

* `MUS()` → minimal unsatisfiable subsets
* `quickxplain()` → preferred or lexicographically ordered MUS
* `smus()` / `optimal_mus()` → minimal cost MUS (if weighted)
  3.2. If **SAT**, compute:
* satisfaction report (which constraints violated, by how much)
* soft constraint violation scores
* constraint dependency graph
  3.3. Store conflict data for visualization modules.

**Artifacts produced:**
`MUS`, `MCS`, `MSS`, `conflict_graph`, `violation_map`

**Data type produced:** *Constraint-level status & relational data*

---

### **4. Repair and Restoration**

**Objective:** Suggest minimal changes to restore feasibility or improve quality.

**Rules:**
4.1. For each MUS, compute corresponding MCS:
→ `mcs()` or enumerator (`MARCO`)
4.2. Derive **repair options**:

* constraint relaxations (drop, reweight, toggle)
* slack model introduction (`cp.sum(slacks)`)
  4.3. Rank repairs by:
* minimal disruption (fewest constraints removed)
* lowest cost
* user preference weight (from feedback history)
  4.4. Push repair options to frontend for preview.

**Artifacts produced:**
`repair_options`, `relaxation_scenarios`, `impact_scores`

**Data type produced:** *Repair graphs, MCS sets, weighted rankings*

---

### **5. Exploration and Optimization**

**Objective:** Enable interactive exploration of the solution space.

**Rules:**
5.1. If optimization → compute Pareto frontiers via repeated solve calls.

* `pareto_solutions = multi_objective(model, objectives)`
  5.2. For trade-off exploration:
* display 2D scatter or radar plots (solution quality dimensions)
* allow user to adjust weights dynamically → recompute frontier
  5.3. Generate counterfactual scenarios:
* `what_if(X→Y)` → minimally adjust model for new goals
* compute delta via MUS/MCS difference set

**Artifacts produced:**
`pareto_front`, `scenario_deltas`, `counterfactuals`

**Data type produced:** *Solution-space relations, sensitivity analyses*

---

### **6. Visualization Layer**

**Objective:** Translate solver artifacts into interactive, human-readable forms.

**Rules (data→viz mapping):**

| Data Type                | Visualization Primitive    | Interaction                             |
| ------------------------ | -------------------------- | --------------------------------------- |
| Constraints & violations | Table + heatmap            | Click to expand MUS                     |
| Conflict sets (MUS/MCS)  | UpSet or node-link diagram | Select constraint to highlight overlaps |
| Trade-offs / Pareto sets | Scatterplot + radar chart  | Adjust weights, preview new solutions   |
| Counterfactuals          | Diff view                  | Compare scenarios                       |
| Solution schedule        | Gantt/Matrix grid          | Drag–drop to reassign                   |

**Artifacts produced:**
`explanation widgets`, `interactive overlays`, `scenario diff views`

**Data type produced:** *Visual-analytic state*

---

### **7. Interaction and Feedback Loop**

**Objective:** Maintain human-in-the-loop agency and continual learning.

**Rules:**
7.1. Each visualization widget communicates back to solver state via API/WebSocket.
7.2. Store user actions as **feedback signals**:

* constraint lock/unlock
* objective reweight
* accepted repairs
  7.3. Feed feedback into learning module → update preference models.
  7.4. Log sessions for iterative design refinement and future explanation personalization.

**Artifacts produced:**
`feedback_log`, `updated_weights`, `learning_state`

**Data type produced:** *Human preference metadata*

---

### **8. Export and Provenance**

**Objective:** Support traceability, reproducibility, and communication.

**Rules:**
8.1. Export model + explanation bundle (JSON):
`{ model, constraints, MUS, MCS, solution, user_actions }`
8.2. Enable visual provenance tracking: which explanation led to which repair.
8.3. Allow report generation:

* explanation summary
* constraint–decision mapping
* Pareto trade-off overview

**Artifacts produced:**
`export_bundle`, `provenance_graph`, `explanation_report`

---

## 📘 Simplified User Flow Summary

1️⃣ **Model Setup** → build + visualize constraint map
2️⃣ **Solve** → get results and solver trace
3️⃣ **Explain** → highlight conflicts or quality metrics
4️⃣ **Repair** → propose minimal relaxations
5️⃣ **Explore** → compare alternatives, counterfactuals
6️⃣ **Reflect** → adjust model, export results

---

## 🧩 Implementation Anchors

* **Backend:** CPMpy + FastAPI

  * Implements all MUS/MCS/counterfactual logic
  * Provides REST + WebSocket endpoints
* **Frontend:** React + D3 + Zustand

  * Dashboard organized as:
    **Left:** Constraints panel
    **Center:** Schedule / Graph view
    **Right:** Explanation & Repair panel
* **Visualization modules:**

  * ConflictInspector (MUS/MCS)
  * ParetoExplorer
  * ScenarioComparator
  * RepairMenu

---

## 🧠 Strategic Notes (ties to theory)

* This operational pipeline **embeds the theoretical formalism implicitly** — MUS/MCS duality, stepwise explanations, and counterfactual reasoning drive the data flow but remain transparent to the end-user.
* The **visualization grammar** (marks, channels, composition rules) ensures consistency and scalability (see your `Design Studies` and `Visual encoding primitives` documents).
* Each explanation phase corresponds to a **distinct family** (Feasibility, Conflict, Repair, Counterfactual, Trade-off), enabling modular evaluation and user testing later.

---

Would you like me to produce a **visual version** of this — e.g., a refined flowchart diagram (SVG or markdown graph) that follows this logic but remains readable for inclusion in design documentation or a paper appendix?


### 🧩 **Overview of the Visualization Sketch**

This diagram shows an **interactive explanation–repair workspace** focused on **MUS-based conflict visualization and repair selection**. It’s designed to visually bridge *diagnosis* (MUS identification) and *repair planning* (MCS enumeration and ranking).

It integrates three functional layers:

1. **Constraint-level visualization** (red/green/blue/black nodes)
2. **Explanatory context and metadata display** (right blue panel)
3. **Repair/optimization interface** (bottom grey/green block)

---

### 🎯 **Core Interactions & Data Flow**

#### **1. Start / Refresh**

* The system begins with an *optimal MUS* (based on size, weights, or explainability).
* A **step-wise explanation** may accompany it (sequence of constraint propagations).
* The *Refresh* action generates a new MUS distinct from the previous one, possibly based on user preference or diversity heuristics.

#### **2. Select MUS Constraint**

* The user clicks a **constraint node** (red circle) in the MUS visualization.
* On selection:

  * The right-side panel displays metadata:

    * Constraint type, description, involved variables/entities
    * Whether the constraint is soft/hard
  * Related constraints (blue circles) appear — those with shared entities, similar semantics, or same type.
  * The system opens the **MCS view** showing correction subsets (green circles) that contain this constraint.

#### **3. Select MCS / Related Constraint**

* User can navigate from a MUS constraint to related constraints or directly to an MCS candidate.
* Each MCS shows which constraints it removes (green circles), possibly overlapping with the current MUS.

#### **4. Select Full MCS (Repair Proposal)**

* User chooses an MCS to fix the conflict — this is effectively a “repair plan.”
* The system can show simulated results (before/after fix).
* Potential extension: switch to a Pareto Simulated Annealing view to explore alternative relaxations or trade-offs (useful when slack variables are available).

---

### ⚙️ **Optimization Criteria**

Optimal MUS or MCS selection can be based on:

* Minimal size or minimal weighted size
* Least slack required
* High explainability (smallest step count, most interpretable propagation)
* Coherence of related constraints
* User feedback (e.g., favoring constraints of certain types)

Feedback influences the ranking algorithm (WP3 connection — “learning from feedback”).

---

### 🧮 **Repair Enumeration & Ranking**

Enumerate all MCSes containing the selected constraint:

* Rank by:

  * Size/weights (smallest = most preferred)
  * Overlap with other MUS constraints
  * Inclusion of related constraints
  * Learned user preference model
* The ranking determines visual order or opacity in the bottom grey panel.

---

### ✅ **Advantages / Disadvantages (from notes)**

**Advantages:**

* Intuitive, guided exploration with freedom of choice.
* Naturally integrates stepwise explanation and repair workflow.
* Prioritizes understandability (ranked, interpretable explanations).

**Disadvantages:**

* Doesn’t allow one-by-one manual constraint removal.
* Difficult to tightly integrate with continuous “slack” relaxation models.
* May be less scalable for hundreds of constraints without clustering or aggregation.

---

### 🧭 **Interpretation of Visual Encoding**

| Color          | Meaning                         | Context                                    |
| -------------- | ------------------------------- | ------------------------------------------ |
| 🔴 Red         | Constraint in current MUS       | conflict set (unsatisfiable)               |
| 🟢 Green       | Constraint in MCS               | removal restores feasibility               |
| 🔵 Blue        | Related constraint              | connected via shared entities or semantics |
| ⚫ Black        | Selected constraint             | currently active focus in explanation      |
| 🟦 Blue Panel  | Constraint metadata + relations | right info panel                           |
| 🟩 Green Panel | MCS enumeration & ranking       | repair options list                        |
| 🟥 Red Box     | MUS workspace                   | current explanation view                   |
| 🩶 Grey Box    | Repair workspace                | candidate solutions zone                   |

Dashed arrows represent *interactive transitions*:

* from explanation → repair
* from constraint → related subset

---

### 💡 **Conceptual Summary**

This design implements the *Explain–Repair Loop* visually:

1. Explain infeasibility → visualize MUS (conflict)
2. Explore cause → view constraint metadata + relations
3. Explore fix → enumerate & rank MCSes
4. Apply or simulate repair → move back to feasible region


---

## 🧭 Why This Is the Right Architectural Center

### 1. It keeps the human’s *mental model* intact.

Schedulers, coordinators, and instructors all think in *spatio-temporal terms*:
“Which exam is when, in which room, with which invigilator?”
If explanations, infeasibilities, or repairs are all framed **relative to that familiar grid**, the dashboard speaks the user’s language instead of the solver’s.

### 2. It makes explanation *contextual* instead of abstract.

Rather than showing a detached graph of constraints (which is cognitively distant), you visualise violations **in situ**:

* A conflicting exam cell glows red.
* Hovering reveals “room capacity exceeded / student overlap / invigilator clash.”
* Clicking shows the MUS containing those constraints.
  Users can see *where* the issue lives before they dive into *why*.

### 3. It naturally supports **progressive disclosure**.

* **Level 1:** Default view = valid or current best schedule.
* **Level 2:** Toggle on “Explain conflicts” → overlay constraint indicators.
* **Level 3:** Click one → open explanation panel (MUS/MCS info).
* **Level 4:** “Show repair options” → side panel offers feasible swaps or relaxations.
  Users stay anchored; only the surrounding context changes.

### 4. It fits the *Explain → Explore → Repair* loop visually.

| Stage       | User action                      | System response                                   |
| ----------- | -------------------------------- | ------------------------------------------------- |
| **Explain** | Select an exam cell              | Highlight conflicting constraints (MUS overlay)   |
| **Explore** | Toggle alternative slots/rooms   | Show counterfactual schedules + constraint deltas |
| **Repair**  | Accept change / relax constraint | Update model & re-solve incrementally             |

---

## 🧩 How to Structure the Dashboard Around the Schedule

### **Primary Canvas: Exam Schedule Grid**

* Calendar or matrix: days × time slots × rooms.
* Cells encode assigned exams; color = faculty, course size, or status.
* Overlay layers:

  * 🔴 constraint violations (conflicts)
  * 🟢 feasible swap candidates
  * 🟣 slack magnitude / preference weight

### **Secondary Panels (contextual)**

| Panel             | Purpose                                            | Appears when                    |
| ----------------- | -------------------------------------------------- | ------------------------------- |
| **Right sidebar** | *Explanation/Repair panel*                         | User selects a conflict or exam |
| **Bottom panel**  | *Solver feedback timeline / Step-wise propagation* | User requests “why infeasible?” |
| **Left panel**    | *Constraint filters / scenario controls*           | Always visible (global view)    |

### **Example Interaction Flow**

1. Scheduler loads timetable → sees color-coded feasible schedule.
2. “Highlight conflicts” button adds transparent overlays for violated soft constraints.
3. Hover on red slot → tooltip summarises reason.
4. Click → sidebar expands:

   * “Conflict set (MUS)”
   * “Repair options (MCS)”
   * “Impact preview” button showing what changes if relaxed.
5. Accept repair → animation updates grid; conflicts fade.

This flow mirrors how professionals already work with scheduling spreadsheets but enriches them with solver intelligence.

---

## 🧮 Data-to-Visualization Mapping for Exam Scheduling

| Data                            | Visual encoding                 | Interaction                           |
| ------------------------------- | ------------------------------- | ------------------------------------- |
| Exam allocation                 | Cell position (time × room)     | drag-drop or click                    |
| Hard constraint violation       | Red outline                     | tooltip “hard constraint unsatisfied” |
| Soft constraint violation       | Amber fill, opacity ∝ weight    | hover for penalty                     |
| Related exams (shared students) | Ghost highlights in other cells | hover a course                        |
| Alternative feasible slot       | Green halo                      | click to simulate repair              |
| MUS/MCS membership              | Border pattern                  | toggle layer                          |

---

## ⚙️ Implementation Implications

* **Backend:** CPMpy incremental solving → fast re-solves for drag-and-drop repairs.
* **Front-end:**

  * Central D3/Canvas scheduler component.
  * Linked state store for selected constraint / explanation context.
  * Side panels request data via `/api/explain/mus?exam_id=...`, `/api/repair/options`.
* **User flow continuity:** the solver never feels like a separate entity; it’s just a “smart assistant” inside the schedule.

---

## 🧠 Design Recommendations

1. **Keep the schedule visually calm** — conflicts and explanations appear only on demand.
2. **Use animated transitions** to preserve spatial continuity when switching between feasible / repaired views.
3. **Use natural metaphors** for explanation categories:

   * “Overlaps” = lines between cells
   * “Capacity limits” = bars filling room cell
   * “Fairness issues” = color gradients across days
4. **Provide reversible actions** — users can always undo a repair or compare alternatives side-by-side.
5. **Add a summary strip** showing global metrics (coverage, fairness, objective score) that updates live after each repair.

---

## ✅ Bottom Line

Centering the dashboard on the **feasible schedule** is both cognitively aligned and interaction-efficient.
Explanations and repairs become **spatially grounded events** rather than abstract algorithmic states.
It allows:

* Direct manipulation (“show me why this exam is problematic”)
* Immediate visual feedback (“here’s how to fix it”)
* Seamless learning loop for users and model alike.

---

Would you like me to sketch three **layout variations** for this schedule-centric dashboard (minimal analytic, explanatory-rich, and what-if exploration) so you can compare visual composition and user flow before committing to one direction?




