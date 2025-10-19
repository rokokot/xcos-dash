# xCoS – Examination Scheduling Prototype: Final Update (Orals, Deadlines, and Moment Locking)

**Date:** 2025-10-19

This iteration **finalizes** scope and rules for the June CS prototype with three decisive changes:

1. **Exactly one oral exam** (ANN) with **per-student interview slots**; its **project report deadline precedes** the oral.
2. **Several courses have no written exam** and instead have **project report deadlines** that **affect when other written exams should occur**.
3. **Pre-chosen exam moments are immutable** (students’ choices are **always respected**; no reassignment in repairs).

Additional clarifications: **Meeting rooms are never allowed**, **oral durations are 30–60 minutes**, **written durations are 1.5–4.0 hours** (+60m accommodations as before).

---

## 1) Executive Delta (what changed)

* **Oral scope:** Only **Artificial Neural Networks (ANN)** has an oral exam; all others are written or **project-only (deadline)**.
* **Deadlines as first-class constraints:**

  * **ANN-report** hard constraint: `deadline(ANN_report) < first_oral_slot(ANN)`.
  * **Other project deadlines:** influence scheduling of **other exams** for the same cohorts (soft spacing rules; see §4).
* **Moment-locking (HARD):** If a student pre-selected a moment for a written exam, that choice **cannot be changed** by solver/repairs.
* **Rooms:** **No meeting rooms** for any exam type (hard exclusion).
* **Durations:**

  * **Oral:** 30 or 60 minutes per slot (no extra-time accommodation modeled for oral in prototype).
  * **Written:** 90–240 min; accommodations add +60 min to the **booking block**.

---

## 2) Policy & Constraint Set (final)

### Hard constraints

* **One exam per day per student.**
* **No time overlap** for any student/instructor.
* **Pre-chosen moments respected** (no reassignments).
* **Room eligibility:** only **PC/Auditorium/Classroom/Seminar**; **Meeting/Lab/Other** **never** allowed.
* **Capacity & features:** PC-required → PC room; headcount ≤ **examCapacity**.
* **Day boundary:** exam block (incl. accommodations) finishes by **17:00**.
* **Oral ANN precedence:** `deadline(ANN_report) < oral(ANN)` (strict).
* **Oral slotting:** oral slots are **contiguous 30–60m** interviews, capacity 1 (per panel/room), no overlaps for the ANN instructor(s).

### Soft constraints (objective)

* **Deadline proximity protection (students):** avoid placing a written exam **on** a day where the same student has a **project deadline** (penalty).
* **Deadline buffer:** prefer ≥1 day **after** a project deadline before a student’s next written exam; larger penalty if the exam is **before** the deadline for the same course group.
* **Morning/afternoon prefs**, **PC-room fairness**, **instructor load balance** (same as prior, tuned weights).

> Rationale: Deadlines create **load spikes**; we bias schedules away from those days for affected students/cohorts, while ensuring the **ANN oral** is strictly after its report deadline.

---

## 3) Data Model (TypeScript / Pydantic deltas)

### New / updated entities

```ts
// New: Project deadlines (some courses have no sit exam)
export interface ProjectDeadline {
  id: string;
  courseId: string;
  dueDate: string;      // ISO date, e.g., "2025-06-12"
  appliesToStudentIds?: string[]; // optional (default: all enrolled in course)
}

// Oral exam definition (only ANN in this prototype)
export interface OralExam {
  id: string;               // e.g., "ANN-ORAL"
  courseId: string;         // ANN course id
  slotDurationMin: 30|60;   // per-student interview length
  interviewerIds: string[]; // instructors/panel
  feasibleRooms: string[];  // exclude meeting rooms by construction
  feasibleSlots: string[];  // timeslot IDs (date+time) within June
  // Scheduling result:
  assignedSlots?: { studentId: string; roomId: string; timeSlotId: string }[];
}
```

**Exam moments (written) stay as-is** but add a flag that prohibits reassignment:

```ts
export interface Enrollment {
  studentId: string;
  examId: string;
  chosenMomentId?: string;      // REQUIRED if exam has multiple moments
  momentLocked?: true;          // NEW: always true in this prototype
}
```

**Policy extension**

```ts
export interface Policy {
  oneExamPerDayPerStudent: true;
  forbidMeetingRooms: true;     // NEW, always true
  writtenDurationsMin: [90, 120, 180, 240];
  oralDurationsMin: [30, 60];
  softWeights: {
    deadlineOnSameDay: number;      // e.g., 8
    deadlineNextDayBuffer: number;  // e.g., 4
    examBeforeDeadline: number;     // e.g., 10 (discourage)
    morningPref: number;
    pcFairness: number;
    instrBalance: number;
  };
}
```

**Deadlines** are added to backend metadata with the same fields; ANN’s oral has a separate `OralExam` payload, while **written** exams remain `ExamMoment`s.

---

## 4) CPMpy Modeling (targeted changes)

### Written exams (unchanged core)

* Vars per **ExamMoment k**: `(day_k, start_k, room_k)` with duration (90–240) and accommodation tail (+60 if any attendee needs it).
* **Moment-locking:** For each `(student, exam)`, enforce `Attend(student, chosenMomentId)=1` and **do not include** any choice variables. If prior code had `choose[s,course,m]`, remove it and **post fixed equalities**.

### Oral (ANN)

Two options; we pick **slot assignments** for realism with small scale:

* Generate a **set of 30–60m slot candidates** for the ANN exam across feasible days/times (respecting instructors’ availability).
* Decision vars: for each **student `s` enrolled in ANN** and each **candidate slot `t`**, a boolean `oral_assign[s,t]`.
* Constraints:

  * **Exactly one slot per student**: `sum_t oral_assign[s,t] = 1`.
  * **No overlap per interviewer room**: at most one student per slot per room.
  * **Precedence:** `slot_time(t) > ANN_report_deadline` for any assigned slot (or simply disallow pre-deadline candidates).
  * **One-exam-per-day rule:** oral counts as an **exam** for that day for student `s`.
  * **Room eligibility:** no meeting rooms; capacity=1 slot.

> If needed, we cap the number of candidate slots per day to keep the model quick.

### Deadlines → written-exam soft constraints

For any **student s** with a **project deadline D**:

* **On deadline day:** add penalty if any written exam for `s` is scheduled that day.
* **Next day buffer:** smaller penalty for written exams on `D+1`.
* **Before deadline:** extra penalty for scheduling **a written exam of the same course’s track** *before* `D` (configurable; default is discourage but not forbid).

---

## 5) Visualization & UX (small but important tweaks)

* **Grid stays “Rooms × Time (day tabs)”.**
* **New “Deadlines rail”** above each day: shows **per-course deadline chips**; hovering a chip highlights affected students’ exams that day (amber glow).
* **Oral (ANN) panel:** selecting ANN shows a **slot list** (30/60m entries) with assigned students; the schedule grid highlights the corresponding room/time cells.
* **Repairs are limited:**

  * **No student moment reassignments** for written exams (UI shows a lock icon and tooltip “pre-chosen moment is fixed”).
  * Repairs may **move a written moment** (if allowed by staff), **shift a PC/room**, or **select a different oral slot** for an ANN student (if free and still after the deadline).
* **Meeting rooms** are visually greyed out across the room list (with a “forbidden” badge).

---

## 6) Scenario Seeds (updated)

1. **Baseline SAT (June-Light + Deadlines)**

   * Several courses have only deadlines; a few written exams spread out; ANN oral after its report deadline.
   * **Outcome:** SAT; soft penalties illustrate deadline buffers.

2. **Deadline Clash (Soft)**

   * A large cohort has **two project deadlines** on Tue; a written exam for many of them is tentatively on Tue.
   * **Outcome:** SAT with penalty → MCS suggests moving the written exam to Wed/Thu; moment locks are **respected**.

3. **ANN Precedence (Hard)**

   * ANN report deadline on Thu; oral slots proposed Wed–Fri.
   * **Outcome:** candidates on Wed are **invalid**; MUS shows **deadline<oral** violation if we force one; MCS: choose Thu–Fri slots only.

4. **Oral Slot Capacity (Hard)**

   * More students than same-day oral slots (30m) → **UNSAT** if not enough slots generated.
   * **MUS:** `{exactly-one-per-student, slot capacity, slot availability}`; **MCS:** add another oral window or switch slots to 60m and extend across more hours/days.

5. **Accommodation Overrun (Written)**

   * 4h written exam (240m) with accommodations (+60m) at 13:00 → 17:00 boundary breach → **UNSAT**; MCS suggests 12:00 start or different room/time.

> In all cases, **moment locks** remain intact; repairs never reassign a student to a different written moment.

---

## 7) API & Validation (agent-friendly)

* **/api/model**: include arrays `projectDeadlines[]`, `oralExam` (ANN), `enrollments[]` with `momentLocked:true`.
* **/api/solve**:

  * Written results as before.
  * Oral results in `solution.oralAssignments: [{studentId, timeSlotId, roomId}]`.
* **/api/explain/mus|mcs**: extend narratives with **deadline/precedence** labels and **moment-lock** reasons.
* **Server-side validation** (fail fast):

  * Reject models that propose **meeting rooms** for any exam.
  * Reject oral candidates **≤ deadline**.
  * Warn if any written moment’s duration (+accom) would **hit >17:00**.
  * Enforce presence of `chosenMomentId` for multi-moment written exams.

**Agentic LLM notes:**

* Treat **momentLocked** as **immutable**; do not propose repairs that reassign written-exam students.
* Prefer **time/room moves** or **soft-weight adjustments**; for ANN, offer **alternate oral slots** (still after deadline).
* When suggesting changes, always return **constraint IDs** and **anchors** for MUS/MCS grounding.

---

## 8) Success Criteria (unchanged, with deadlines & orals)

* **Feasibility:** 10–14 courses, 2 moments each (written), several deadline-only courses, one oral (ANN) with 30–60m slots.
* **Responsiveness:** sub-second what-ifs; <2s MUS on demo UNSAT.
* **Explainability:** MUS includes small, human-readable sets (e.g., `deadline<oral`, `day-boundary`, `momentLocked`); MCS offers realistic repairs that **respect locks**.
* **Usability:** deadlines rail + oral slot panel; lock icons for written moments; clear forbidden (meeting) rooms.

---

## 9) Quick Implementation Checklist

**Backend**

* [ ] Add `ProjectDeadline` and `OralExam` to schema; generate oral slot candidates post-deadline only.
* [ ] Remove written moment choice vars; **post fixed attendances** per `chosenMomentId`.
* [ ] Add deadline soft penalties & buffers (student-aware).
* [ ] Validate “no meeting rooms,” “oral after deadline,” and “day boundary” at build time.

**Frontend**

* [ ] **Deadlines rail** per day; hover highlights affected exams.
* [ ] **Oral panel** (ANN): slot list with assignments; grid highlights slots.
* [ ] **Lock icon** on written moments; disable reassignment actions.
* [ ] Keep MUS/MCS overlays; include **deadline/lock** tags in Inspector.

**Scenarios**

* [ ] Update seeds 1–5 with deadlines and ANN oral; include expected MUS/MCS.
