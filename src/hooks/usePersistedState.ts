import { useEffect, useRef, useCallback } from 'react';
import { Roster } from '../types/roster';
import { SchedulingContext } from '../components/panels/SetupPanel';
import { FilterState } from '../components/panels/FilterPanel';
import { logger } from '../utils/logger';

export interface PersistedDashboardState {
  rosters: Roster[];
  activeRosterId: string;
  schedulingContext: SchedulingContext;
  filters: FilterState;
  gridData: {
    days: string[];
    dayLabels: string[];
    timeSlots: string[];
  };
  uiPreferences: {
    toolbarPosition: 'top' | 'right';
    cardViewMode: 'individual' | 'compact';
    filterPanelCollapsed: boolean;
  };
  version: number;
  lastSaved: number;
}

const STORAGE_KEY = 'xcos-dashboard-state';
const STORAGE_VERSION = 1;
const DEBOUNCE_MS = 800;
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB safety limit (localStorage usually 5-10MB)

/**
 * Compress state by removing redundant data and computed values
 */
function compressState(state: PersistedDashboardState): PersistedDashboardState {
  return {
    ...state,
    rosters: state.rosters.map(roster => ({
      ...roster,
      // Remove computed conflict data - will be recalculated
      state: {
        ...roster.state,
        conflicts: [],
      },
      availabilities: roster.availabilities.map(person => ({
        ...person,
        // Remove computed conflicts - will be recalculated
        conflicts: undefined,
      })),
    })),
  };
}

/**
 * Load persisted state from localStorage with error handling
 */
export function loadPersistedState(): PersistedDashboardState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PersistedDashboardState;

    // Version check
    if (parsed.version !== STORAGE_VERSION) {
      logger.warn('Persisted state version mismatch, ignoring stored state');
      return null;
    }

    // Reconstruct Map objects that were serialized as plain objects
    const rosters = parsed.rosters.map(roster => ({
      ...roster,
      state: {
        ...roster.state,
        locks: new Map(Object.entries(roster.state.locks || {})),
      },
    }));

    console.log('✓ Loaded state from localStorage', {
      rosterCount: rosters.length,
      eventCount: rosters.reduce((sum, r) => sum + r.state.events.length, 0),
      lastSaved: new Date(parsed.lastSaved).toLocaleString(),
    });

    return {
      ...parsed,
      rosters,
    };
  } catch (error) {
    logger.error('Failed to load persisted state:', error);
    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Save state to localStorage with compression and size checks
 */
function saveToLocalStorage(state: PersistedDashboardState): boolean {
  try {
    const compressed = compressState(state);

    // Convert Map to plain object for JSON serialization
    const serializable = {
      ...compressed,
      rosters: compressed.rosters.map(roster => ({
        ...roster,
        state: {
          ...roster.state,
          locks: Object.fromEntries(roster.state.locks || new Map()),
        },
      })),
    };

    const serialized = JSON.stringify(serializable);
    const sizeBytes = new Blob([serialized]).size;

    if (sizeBytes > MAX_STORAGE_SIZE) {
      logger.warn('State too large for localStorage', { sizeBytes, maxSize: MAX_STORAGE_SIZE });
      return false;
    }

    localStorage.setItem(STORAGE_KEY, serialized);
    console.log('✓ State persisted to localStorage', { sizeBytes, rosterCount: state.rosters.length });
    logger.debug('Saved state to localStorage', { sizeBytes });
    return true;
  } catch (error) {
    logger.error('Failed to save state to localStorage:', error);
    return false;
  }
}

/**
 * Hook to auto-persist dashboard state with debouncing
 */
export function usePersistedState(
  rosters: Roster[],
  activeRosterId: string,
  schedulingContext: SchedulingContext,
  filters: FilterState,
  gridData: { days: string[]; dayLabels: string[]; timeSlots: string[] },
  uiPreferences: {
    toolbarPosition: 'top' | 'right';
    cardViewMode: 'individual' | 'compact';
    filterPanelCollapsed: boolean;
  }
) {
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedRef = useRef<string>('');

  const persistState = useCallback(() => {
    const state: PersistedDashboardState = {
      rosters,
      activeRosterId,
      schedulingContext,
      filters,
      gridData,
      uiPreferences,
      version: STORAGE_VERSION,
      lastSaved: Date.now(),
    };

    // Skip save if state hasn't changed
    // Hash event positions to detect drag-and-drop changes
    const currentHash = JSON.stringify({
      rosters: rosters.map(r => ({
        id: r.id,
        eventCount: r.state.events.length,
        // Hash event positions (day/time) to detect moves
        eventPositions: r.state.events.map(e => `${e.id}:${e.day}:${e.startTime}`).join(','),
        availCount: r.availabilities.length,
      })),
      activeRosterId,
      filters,
      gridDays: gridData.days.length,
      gridSlots: gridData.timeSlots.length,
    });

    if (currentHash === lastSavedRef.current) {
      logger.debug('State unchanged, skipping save');
      return;
    }

    lastSavedRef.current = currentHash;
    const success = saveToLocalStorage(state);
    if (success) {
      console.log('✓ State changes saved');
      logger.info('State persisted to localStorage');
    }
  }, [rosters, activeRosterId, schedulingContext, filters, gridData, uiPreferences]);

  // Debounced auto-save on state changes
  // CRITICAL: Only depend on persistState callback, not raw state
  // This prevents cascading saves on every state mutation
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      persistState();
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [persistState]); // Removed rosters, activeRosterId dependencies

  // Save immediately on unmount (browser close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      persistState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [persistState]);

  return {
    persistNow: persistState,
    clearPersistedState: () => {
      localStorage.removeItem(STORAGE_KEY);
      logger.info('Cleared persisted state');
    },
  };
}

/**
 * Export state as JSON for backend snapshot or download
 */
export function exportState(state: PersistedDashboardState): string {
  const compressed = compressState(state);
  return JSON.stringify(compressed, null, 2);
}

/**
 * Import state from JSON (backend snapshot or upload)
 */
export function importState(json: string): PersistedDashboardState | null {
  try {
    const parsed = JSON.parse(json) as PersistedDashboardState;

    // Reconstruct Map objects
    const rosters = parsed.rosters.map(roster => ({
      ...roster,
      state: {
        ...roster.state,
        locks: new Map(Object.entries(roster.state.locks || {})),
      },
    }));

    return {
      ...parsed,
      rosters,
    };
  } catch (error) {
    logger.error('Failed to import state:', error);
    return null;
  }
}
