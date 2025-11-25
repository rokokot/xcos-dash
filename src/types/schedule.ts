export interface DefenceEvent {
  id: string;
  title: string;
  student: string;
  supervisor: string;
  coSupervisor?: string;
  assessors: string[];
  mentors: string[];
  day: string;
  startTime: string;
  endTime: string;
  programme: string;
  room?: string;
  color?: string;
  locked?: boolean;
  conflicts?: string[];
}

export interface Conflict {
  type: 'double-booking' | 'availability-violation' | 'room-capacity' | 'other';
  affectedDefenceIds: string[];
  description: string;
  severity: 'error' | 'warning';
}

export interface SolverRunInfo {
  timestamp: number;
  mode: 're-optimize' | 'solve-from-scratch';
  runtime: number;
  objectiveValue?: number;
  lockCount: number;
}

export interface ScheduleState {
  events: DefenceEvent[];
  locks: Map<string, LockInfo>;
  solverMetadata: SolverRunInfo | null;
  conflicts: Conflict[];
}

export interface LockInfo {
  defenceId: string;
  day: string;
  startTime: string;
  endTime: string;
  room?: string;
  lockedAt: number;
}

export type ScheduleActionType =
  | 'drag-defence'
  | 'lock-defence'
  | 'unlock-defence'
  | 'solver-run'
  | 'manual-edit';

export interface ScheduleAction {
  type: ScheduleActionType;
  timestamp: number;
  description: string;
  data: any;
}

export interface HistoryEntry {
  timestamp: number;
  action: ScheduleAction;
  schedule: ScheduleState;
}
