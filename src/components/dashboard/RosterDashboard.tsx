/**
 * Roster Dashboard -  dashboard for various scheduling use-cases
 *
 * v0.2.0 (02-11) - Added drag-and-drop, lock mechanism, history management
 */
import { useState, useEffect, useRef, useMemo, useCallback, startTransition, Fragment } from 'react';
import { GripHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
import { reorder } from '@atlaskit/pragmatic-drag-and-drop/reorder';
import invariant from 'tiny-invariant';
import { TabWorkflow, Tab } from '../navigation/TabWorkflow';
import { FilterPanel, FilterState, BreadcrumbItem } from '../panels/FilterPanel';
import { DetailPanel, DetailContent } from '../panels/DetailPanel';
import { SetupPanel, SchedulingContext, SchedulingPeriod, Department, TimeHorizon } from '../panels/SetupPanel';
import { AvailabilityPanel } from '../availability/AvailabilityPanel';
import { RosterInfo } from '../availability/AvailabilityGrid';
import { ObjectivesPanel } from '../objectives/ObjectivesPanel';
import { AdaptiveToolbar, CardViewMode } from '../toolbar/AdaptiveToolbar';
import { PersonAvailability, AvailabilityStatus } from '../availability/types';
import { GlobalObjective, LocalObjective } from '../../types/objectives';
import { DefenceEvent, ScheduleState, ScheduleAction, Conflict, ConflictSeverity } from '../../types/schedule';
import { Roster } from '../../types/roster';
import { useScheduleHistory } from '../../hooks/useScheduleHistory';
import { usePersistedState, loadPersistedState, PersistedDashboardState } from '../../hooks/usePersistedState';
import { DraggableDefenceCard } from '../scheduler/DraggableDefenceCard';
import { DroppableTimeSlot } from '../scheduler/DroppableTimeSlot';
import { generateGridFromTimeHorizon } from '../../utils/gridGenerator';
import { generatePlaceholderAvailabilities } from '../../utils/availabilityGenerator';
import { loadProgrammeData } from '../../services/programmeDataLoader';
import { logger } from '../../utils/logger';
import { showToast } from '../../utils/toast';
import { detectEventConflicts } from '../../lib/availabilityLoader';
import { defaultDefenceCardTheme } from '../../config/cardStyles.config';
import { GridSetupModal } from '../modals/GridSetupModal';
import { splitParticipantNames } from '../../utils/participantNames';
import { ConflictsPanelV2 } from '../conflicts/ConflictsPanelV2';
import { buildRoomAvailabilityRooms } from '../panels/RoomAvailabilityDrawer';
import { RoomAvailabilityPanel } from '../panels/RoomAvailabilityPanel';

const normalizeName = (name?: string | null) => (name || '').trim().toLowerCase();
const expandParticipantNames = (value?: string | null) => splitParticipantNames(value);

// Adjust this value to control the maximum width of each schedule column (in pixels)
const SCHEDULE_COLUMN_WIDTH = 220;

export interface RosterDashboardProps {
  events: DefenceEvent[];
  availabilities: PersonAvailability[];
  days: string[];
  dayLabels?: string[];
  timeSlots: string[];
  onEventClick?: (eventId: string) => void;
  onAvailabilityEdit?: (personId: string, day: string, timeSlot: string, newStatus: any, locked: boolean) => void;
}

export function RosterDashboard({
  events: initialEvents,
  availabilities: initialAvailabilities,
  days: propDays,
  dayLabels: propDayLabels,
  timeSlots: propTimeSlots,
  onEventClick,
  onAvailabilityEdit,
}: RosterDashboardProps) {
  // Try to restore from localStorage first (lazy initialization)
  const persistedState = useRef<PersistedDashboardState | null>();
  if (persistedState.current === undefined) {
    persistedState.current = loadPersistedState();
  }
  const hasPersistedState = persistedState.current !== null;

  const initialState: ScheduleState = hasPersistedState
    ? persistedState.current!.rosters.find(r => r.id === persistedState.current!.activeRosterId)?.state || {
        events: initialEvents,
        locks: new Map(),
        solverMetadata: null,
        conflicts: [],
      }
    : {
        events: initialEvents,
        locks: new Map(),
        solverMetadata: null,
        conflicts: [],
      };

  const { currentState, canUndo, canRedo, push, undo, redo } = useScheduleHistory(initialState);
  const events = currentState?.events || [];

  // Roster management with global counter for proper naming
  const rosterCounterRef = useRef(
    hasPersistedState ? persistedState.current!.rosters.length : 1
  );
  const [rosters, setRosters] = useState<Roster[]>(() =>
    hasPersistedState
      ? persistedState.current!.rosters
      : [
          {
            id: 'roster-1',
            label: 'Schedule 1',
            state: initialState,
            availabilities: initialAvailabilities,
            objectives: {
              global: [],
              local: [],
            },
            createdAt: Date.now(),
            source: 'manual',
          },
        ]
  );
  const [activeRosterId, setActiveRosterId] = useState(
    hasPersistedState ? persistedState.current!.activeRosterId : 'roster-1'
  );

  const [activeTab, setActiveTab] = useState<string>('schedule');
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(
    hasPersistedState ? persistedState.current!.uiPreferences.filterPanelCollapsed : true
  );
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailContent, setDetailContent] = useState<DetailContent>(null);
  const [detailEditable, setDetailEditable] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [activeCardIndex, setActiveCardIndex] = useState<Record<string, number>>({});
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>(
    hasPersistedState ? persistedState.current!.uiPreferences.cardViewMode : 'individual'
  );
  const [availabilities, setAvailabilities] = useState<PersonAvailability[]>(() =>
    hasPersistedState
      ? persistedState.current!.rosters.find(r => r.id === persistedState.current!.activeRosterId)
          ?.availabilities || initialAvailabilities
      : initialAvailabilities
  );
  const [availabilityExpanded, setAvailabilityExpanded] = useState(true);
  const [highlightedSlot, setHighlightedSlot] = useState<{ day: string; timeSlot: string } | null>(null);
  const [roomsExpanded, setRoomsExpanded] = useState(false);
  const [highlightedPersons, setHighlightedPersons] = useState<string[]>([]);
  const [toolbarPosition, setToolbarPosition] = useState<'top' | 'right'>(
    hasPersistedState ? persistedState.current!.uiPreferences.toolbarPosition : 'top'
  );
  const [detailPanelMode, setDetailPanelMode] = useState<'list' | 'detail'>('detail');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedEventId, setHighlightedEventId] = useState<string | undefined>(undefined);
  const [clickCount, setClickCount] = useState<Map<string, number>>(new Map());
  const clickTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [showGridSetupModal, setShowGridSetupModal] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);

  // Bottom panel state
  type BottomPanelTab = 'availability' | 'objectives' | 'rooms' | 'conflicts';
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('availability');
  const [objectivesExpanded, setObjectivesExpanded] = useState(false);
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [sharedPanelHeight, setSharedPanelHeight] = useState(520);

  const clampPanelHeight = useCallback((height: number) => {
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600;
    return Math.max(220, Math.min(maxHeight, height));
  }, []);

  const handleSharedHeightChange = useCallback(
    (height: number) => {
      setSharedPanelHeight(prev => {
        const next = clampPanelHeight(height);
        return Math.abs(next - prev) < 1 ? prev : next;
      });
    },
    [clampPanelHeight]
  );

  const handleBottomPanelTabClick = useCallback(
    (tab: BottomPanelTab) => {
      if (tab === bottomPanelTab) {
        switch (tab) {
          case 'availability':
            setAvailabilityExpanded(prev => !prev);
            break;
          case 'objectives':
            setObjectivesExpanded(prev => !prev);
            break;
          case 'rooms':
            setRoomsExpanded(prev => !prev);
            break;
          case 'conflicts':
            setConflictsExpanded(prev => !prev);
            break;
        }
        return;
      }

      setBottomPanelTab(tab);
      setAvailabilityExpanded(tab === 'availability');
      setObjectivesExpanded(tab === 'objectives');
      setRoomsExpanded(tab === 'rooms');
      setConflictsExpanded(tab === 'conflicts');
    },
    [bottomPanelTab]
  );

  // Objectives state
  const [globalObjectives, setGlobalObjectives] = useState<GlobalObjective[]>([
    {
      id: 'adjacency-objective',
      type: 'adjacency-alignment',
      label: 'Adjacency objective',
      description: '',
      enabled: false,
      weight: 8,
    },
    {
      id: 'minimize-gaps',
      type: 'minimize-gaps',
      label: 'Minimize schedule gaps',
      description: 'Reduce idle time between defenses',
      enabled: false,
      weight: 5,
    },
    {
      id: 'balance-workload',
      type: 'balance-workload',
      label: 'Balance workload',
      description: 'Distribute defenses evenly across assessors',
      enabled: false,
      weight: 3,
    },
    {
      id: 'distance-objective',
      type: 'evaluator-distance',
      label: 'Minimize evaluator walking distance',
      description: 'Keep consecutive defenses with the same evaluator in nearby rooms',
      enabled: false,
      weight: 6,
    },
    {
      id: 'room-preference',
      type: 'room-preference',
      label: 'Evaluator room preferences',
      description: 'Match defenses to evaluators’ preferred rooms',
      enabled: false,
      weight: 4,
    },
  ]);
  const [localObjectives, setLocalObjectives] = useState<LocalObjective[]>([]);

  // Ref for schedule grid rows to enable scrolling to specific slots
  const timeSlotRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Grid structure derived from time horizon or props
  const [days, setDays] = useState<string[]>(
    hasPersistedState ? persistedState.current!.gridData.days : propDays
  );
  const [dayLabels, setDayLabels] = useState<string[]>(
    hasPersistedState ? persistedState.current!.gridData.dayLabels : propDayLabels || propDays
  );
  const [timeSlots, setTimeSlots] = useState<string[]>(
    hasPersistedState ? persistedState.current!.gridData.timeSlots : propTimeSlots
  );
  const roomAvailabilityRooms = useMemo(() => buildRoomAvailabilityRooms(events, days, timeSlots), [events, days, timeSlots]);
  const [gridSource] = useState<'props' | 'timehorizon'>(
    propDays.length > 0 && propTimeSlots.length > 0 ? 'props' : 'timehorizon'
  );
  const [horizonMergeEnabled, setHorizonMergeEnabled] = useState(false);

  const [filters, setFilters] = useState<FilterState>(
    hasPersistedState
      ? persistedState.current!.filters
      : {
          status: {
            scheduled: true,
            unscheduled: true,
            withConflicts: false,
          },
          programmes: [],
          participantSearch: '',
        }
  );

  // Scheduling context
  const [schedulingContext, setSchedulingContext] = useState<SchedulingContext>(
    hasPersistedState
      ? persistedState.current!.schedulingContext
      : {
          period: {
            id: 'fall-2025',
            label: 'Fall 2025',
            year: 2025,
            semester: 'Fall',
            startDate: '2025-09-01',
            endDate: '2026-01-31',
          },
          department: {
            id: 'cs',
            name: 'Computer Science',
            code: 'CS',
            faculty: 'Engineering',
          },
          taskType: 'thesis-defences',
          thesisSubtype: 'final',
          timeHorizon: {
            startDate: '2025-06-10',
            endDate: '2025-06-20',
            startHour: 8,
            endHour: 17,
            excludeWeekends: true,
          },
        }
  );

  const availablePeriods: SchedulingPeriod[] = [
    {
      id: 'fall-2025',
      label: 'Fall 2025',
      year: 2025,
      semester: 'Fall',
      startDate: '2025-09-01',
      endDate: '2026-01-31',
    },
    {
      id: 'spring-2026',
      label: 'Spring 2026',
      year: 2026,
      semester: 'Spring',
      startDate: '2026-02-01',
      endDate: '2026-06-30',
    },
  ];

  const availableDepartments: Department[] = [
    { id: 'cs', name: 'Computer Science', code: 'CS', faculty: 'Engineering' },
    { id: 'ee', name: 'Electrical Engineering', code: 'EE', faculty: 'Engineering' },
    { id: 'math', name: 'Mathematics', code: 'MATH', faculty: 'Science' },
  ];

  const columnHighlights = useMemo(() => {
    if (!selectedEvent || highlightedPersons.length === 0) return {};

    const targetEvent = events.find(e => e.id === selectedEvent);
    const persons = availabilities.filter(p => highlightedPersons.includes(p.id));
    if (persons.length === 0) {
      if (targetEvent?.day && targetEvent?.startTime) {
        return { [targetEvent.day]: { [targetEvent.startTime]: 'primary' as const } };
      }
      return {};
    }

    const highlightMap: Record<string, Record<string, 'primary' | 'match'>> = {};

    if (targetEvent?.day && targetEvent?.startTime) {
      highlightMap[targetEvent.day] = { [targetEvent.startTime]: 'primary' };
    }

    const getStatus = (person: PersonAvailability, day: string, slot: string): AvailabilityStatus => {
      const slotValue = person.availability?.[day]?.[slot];
      if (!slotValue) return 'empty';
      return typeof slotValue === 'string' ? slotValue : slotValue.status;
    };

    days.forEach(day => {
      timeSlots.forEach(slot => {
        const allAvailable = persons.every(person => getStatus(person, day, slot) === 'available');
        if (allAvailable) {
          if (!highlightMap[day]) {
            highlightMap[day] = {};
          }
          if (highlightMap[day][slot] !== 'primary') {
            highlightMap[day][slot] = 'match';
          }
        }
      });
    });

    return highlightMap;
  }, [selectedEvent, highlightedPersons, events, availabilities, days, timeSlots]);
  const hasColumnHighlighting = useMemo(
    () =>
      Object.values(columnHighlights).some(dayMap => dayMap && Object.keys(dayMap).length > 0),
    [columnHighlights]
  );
  const scheduledEventsCount = useMemo(
    () => events.filter(event => Boolean(event.day && event.startTime)).length,
    [events]
  );

  // Auto-persist state with debouncing
  const { persistNow, clearPersistedState } = usePersistedState(
    rosters,
    activeRosterId,
    schedulingContext,
    filters,
    { days, dayLabels, timeSlots },
    { toolbarPosition, cardViewMode, filterPanelCollapsed }
  );

  // Show restoration message on first mount if state was restored
  useEffect(() => {
    if (hasPersistedState) {
      const rosterCount = persistedState.current!.rosters.length;
      const eventCount = rosters.find(r => r.id === activeRosterId)?.state.events.length || 0;
      showToast.success(
        `Restored session: ${rosterCount} roster${rosterCount > 1 ? 's' : ''}, ${eventCount} event${eventCount !== 1 ? 's' : ''}`
      );
    }
  }, []); // Only on mount

  // Monitor drag and drop with pragmatic-dnd (stable handler; avoids reattaching each render)
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const dropTarget = location.current.dropTargets[0];
        if (!dropTarget) return;

        const sourceData = source.data;
        invariant(sourceData.type === 'defence-card');
        invariant(typeof sourceData.eventId === 'string');

        const targetData = dropTarget.data;
        const eventsSnapshot = eventsRef.current;
        const selectedSnapshot = selectedEventsRef.current;

        const fromUnscheduled = sourceData.sourceLocation === 'unscheduled-panel';

        if (targetData.type === 'defence-card') {
          if (fromUnscheduled) {
            const targetEvent = eventsSnapshot.find(e => e.id === targetData.eventId);
            if (!targetEvent) return;
            handleDrop(sourceData.eventId, targetEvent.day!, targetEvent.startTime!);
            return;
          }
          const sourceEvent = eventsSnapshot.find(e => e.id === sourceData.eventId);
          const targetEvent = eventsSnapshot.find(e => e.id === targetData.eventId);

          if (!sourceEvent || !targetEvent) return;

          const isMultiSelect = selectedSnapshot.has(sourceData.eventId);
          const eventsToMove = isMultiSelect ? Array.from(selectedSnapshot) : [sourceData.eventId];

          if (sourceEvent.day === targetEvent.day && sourceEvent.startTime === targetEvent.startTime) {
            const closestEdge = extractClosestEdge(targetData);
            let cellEvents = eventsSnapshot.filter(
              e => e.day === sourceEvent.day && e.startTime === sourceEvent.startTime
            );

            if (isMultiSelect) {
              const selectedSet = new Set(eventsToMove);
              const nonSelected = cellEvents.filter(e => !selectedSet.has(e.id));
              const selectedItems = cellEvents.filter(e => selectedSet.has(e.id));

              const targetIndex = nonSelected.findIndex(e => e.id === targetEvent.id);
              if (targetIndex === -1) return;

              const insertIndex = closestEdge === 'bottom' ? targetIndex + 1 : targetIndex;
              const reorderedCellEvents = [
                ...nonSelected.slice(0, insertIndex),
                ...selectedItems,
                ...nonSelected.slice(insertIndex),
              ];

              const cellEventsSet = new Set(reorderedCellEvents.map(e => e.id));
              const updatedEvents = [
                ...eventsSnapshot.filter(e => !cellEventsSet.has(e.id)),
                ...reorderedCellEvents,
              ];

              pushRef.current({
                type: 'manual-edit',
                timestamp: Date.now(),
                description: `Reordered ${eventsToMove.length} defenses in ${sourceEvent.day} ${sourceEvent.startTime}`,
                data: { eventIds: eventsToMove, targetEventId: targetEvent.id },
              }, {
                ...currentStateRef.current!,
                events: updatedEvents,
              });
            } else {
              const sourceIndex = cellEvents.findIndex(e => e.id === sourceEvent.id);
              const targetIndex = cellEvents.findIndex(e => e.id === targetEvent.id);

              if (sourceIndex === -1 || targetIndex === -1) return;

              const destinationIndex = getReorderDestinationIndex({
                startIndex: sourceIndex,
                indexOfTarget: targetIndex,
                closestEdgeOfTarget: closestEdge,
                axis: 'vertical',
              });

              const reorderedCellEvents = reorder({
                list: cellEvents,
                startIndex: sourceIndex,
                finishIndex: destinationIndex,
              });

              const cellEventsSet = new Set(reorderedCellEvents.map(e => e.id));
              const updatedEvents = [
                ...eventsSnapshot.filter(e => !cellEventsSet.has(e.id)),
                ...reorderedCellEvents,
              ];

              pushRef.current({
                type: 'manual-edit',
                timestamp: Date.now(),
                description: `Reordered ${sourceEvent.student} in ${sourceEvent.day} ${sourceEvent.startTime}`,
                data: { sourceEventId: sourceEvent.id, targetEventId: targetEvent.id },
              }, {
                ...currentStateRef.current!,
                events: updatedEvents,
              });
            }
          } else {
            handleDrop(sourceData.eventId, targetEvent.day!, targetEvent.startTime!);
          }
          return;
        }

        if (targetData.type === 'time-slot') {
          invariant(typeof targetData.day === 'string');
          invariant(typeof targetData.timeSlot === 'string');
          handleDrop(sourceData.eventId, targetData.day, targetData.timeSlot);
        }
      },
    });
  }, []); // stable attachment

  // Handler for loading programme data
  const handleLoadProgrammeData = async (datasetKey: string) => {
    // datasetKey can be 'ma-ir-cs' or 'ma-ir-cs:intermediate'
    const data = await loadProgrammeData(datasetKey);
    if (data) {
      let sortedDays: string[];
      let labels: string[];
      let completeTimeSlots: string[];

      // Use extracted time horizon if available, otherwise show grid setup modal
      if (data.extractedTimeHorizon) {
        // Update scheduling context with extracted time horizon
        setSchedulingContext(prev => ({
          ...prev,
          timeHorizon: {
            ...data.extractedTimeHorizon!,
            excludeWeekends: prev.timeHorizon?.excludeWeekends ?? true,
          },
        }));

        // Generate grid from extracted time horizon
        const generated = generateGridFromTimeHorizon(data.extractedTimeHorizon);
        sortedDays = generated.days;
        labels = generated.dayLabels;
        completeTimeSlots = generated.timeSlots;

        // Update global grid
        setDays(sortedDays);
        setDayLabels(labels);
        setTimeSlots(completeTimeSlots);

        console.log('✓ Grid auto-generated from extracted time horizon');
      } else {
        // No dates found - show grid setup modal
        console.log('ℹ No dates found in data - prompting for grid configuration');
        setShowGridSetupModal(true);
        return; // Wait for user to configure grid
      }

      const updatedState: ScheduleState = {
        events: data.events,
        locks: new Map(),
        solverMetadata: null,
        conflicts: [],
      };

      // Store grid data in the roster itself
      const gridData = {
        days: sortedDays,
        dayLabels: labels,
        timeSlots: completeTimeSlots,
      };

      // Load data into current active roster with its grid structure
      setRosters(prev => {
        return prev.map(r =>
          r.id === activeRosterId
            ? {
                ...r,
                state: updatedState,
                availabilities: data.availabilities,
                gridData,
                objectives: {
                  global: globalObjectives,
                  local: localObjectives,
                },
                source: 'imported',
              }
            : r
        );
      });

      // Update current state and availabilities
      push({
        type: 'manual-edit',
        timestamp: Date.now(),
        description: `Loaded ${data.dataset.description}`,
        data: { datasetKey, eventCount: data.events.length }
      }, updatedState);
      setAvailabilities(data.availabilities);

      // Switch to schedule tab to view loaded data
      setActiveTab('schedule');

      const activeRoster = rosters.find(r => r.id === activeRosterId);
      showToast.success(`Loaded ${data.dataset.description} into ${activeRoster?.label || 'current roster'}`);
    }
  };

  useEffect(() => {
    const availableProgrammes = Array.from(new Set(events.map(e => e.programme)));
    if (availableProgrammes.length > 0 && filters.programmes.length === 0) {
      setFilters(prev => ({
        ...prev,
        programmes: availableProgrammes,
      }));
    }
  }, [events, filters.programmes.length]);

  const collectEventParticipants = useCallback((event: DefenceEvent): string[] => {
    const participants: string[] = [];
    expandParticipantNames(event.student).forEach(name => participants.push(name));
    expandParticipantNames(event.supervisor).forEach(name => participants.push(name));
    expandParticipantNames(event.coSupervisor).forEach(name => participants.push(name));
    if (event.assessors) participants.push(...event.assessors.filter(Boolean));
    if (event.mentors) participants.push(...event.mentors.filter(Boolean));
    return participants.filter(Boolean);
  }, []);

  const eventParticipantCache = useMemo(() => {
    const cache = new Map<string, { names: string[]; normalized: string[] }>();
    events.forEach(event => {
      const names = collectEventParticipants(event);
      cache.set(event.id, {
        names,
        normalized: Array.from(
          new Set(names.map(name => normalizeName(name)).filter(Boolean))
        ),
      });
    });
    return cache;
  }, [events, collectEventParticipants]);

  // Derive scheduled slots per participant for availability visualization
  const scheduledBookings = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    const scheduledEvents = events.filter(e => e.day && e.startTime);

    scheduledEvents.forEach(event => {
      const slotKey = `${event.day}_${event.startTime}`;
      const normalizedParticipants =
        eventParticipantCache.get(event.id)?.normalized || [];

      normalizedParticipants.forEach(personKey => {
        if (!map.has(personKey)) {
          map.set(personKey, new Map());
        }
        const personSlots = map.get(personKey)!;
        if (!personSlots.has(slotKey)) {
          personSlots.set(slotKey, []);
        }
        personSlots.get(slotKey)!.push(event.id);
      });
    });

    return map;
  }, [events, eventParticipantCache]);

  const participantWorkload = useMemo(() => {
    const map = new Map<string, { required: number; scheduled: number }>();

    events.forEach(event => {
      const isScheduled = Boolean(event.day && event.startTime);
      const normalizedParticipants =
        eventParticipantCache.get(event.id)?.normalized || [];

      normalizedParticipants.forEach(name => {
        if (!map.has(name)) {
          map.set(name, { required: 0, scheduled: 0 });
        }
        const stats = map.get(name)!;
        stats.required += 1;
        if (isScheduled) {
          stats.scheduled += 1;
        }
      });
    });

    return map;
  }, [events, eventParticipantCache]);

  const eventParticipantNames = useMemo(() => {
    const set = new Set<string>();
    eventParticipantCache.forEach(({ normalized }) => {
      normalized.forEach(name => {
        if (name) set.add(name);
      });
    });
    return set;
  }, [eventParticipantCache]);

  const visibleAvailabilities = useMemo(() => {
    if (availabilities.length === 0) return availabilities;
    if (eventParticipantNames.size === 0) return availabilities;
    return availabilities.filter(person => eventParticipantNames.has(normalizeName(person.name)));
  }, [availabilities, eventParticipantNames]);

  // Track previous roster sync values for deep change detection
  const prevRosterSyncRef = useRef<{
    currentState: ScheduleState | null;
    availabilities: PersonAvailability[];
    activeRosterId: string;
  }>();

  // Sync active roster state when currentState or availabilities change (debounced)
  useEffect(() => {
    if (!currentState || !activeRosterId) return;

    // Fast path: reference equality for immutable data structures
    const stateChanged = (() => {
      const prev = prevRosterSyncRef.current;
      if (!prev) return true;

      // Reference checks are sufficient for immutable state
      if (prev.activeRosterId !== activeRosterId) return true;
      if (prev.currentState?.events !== currentState.events) return true;
      if (prev.availabilities !== availabilities) return true;

      return false;
    })();

    if (!stateChanged) return;

    // Use requestIdleCallback for non-urgent roster sync
    const timeoutId = setTimeout(() => {
      setRosters(prev => {
        const activeRoster = prev.find(r => r.id === activeRosterId);
        if (!activeRoster) return prev;

        // Double-check after debounce
        if (
          activeRoster.state.events === currentState.events &&
          activeRoster.availabilities === availabilities
        ) {
          return prev;
        }

        prevRosterSyncRef.current = {
          currentState,
          availabilities,
          activeRosterId,
        };

        return prev.map(r =>
          r.id === activeRosterId
            ? {
                ...r,
                state: currentState,
                availabilities: availabilities,
                objectives: {
                  global: globalObjectives,
                  local: localObjectives,
                },
              }
            : r
        );
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentState, availabilities, activeRosterId, globalObjectives, localObjectives]);

  // Update time horizon to reflect actual displayed grid when using CSV data
  useEffect(() => {
    if (gridSource === 'props' && propDays.length > 0 && propTimeSlots.length > 0) {
      const sortedDays = [...propDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const sortedSlots = [...propTimeSlots].sort((a, b) => {
        const [aHour] = a.split(':').map(Number);
        const [bHour] = b.split(':').map(Number);
        return aHour - bHour;
      });

      const startHour = sortedSlots.length > 0 ? parseInt(sortedSlots[0].split(':')[0]) : 8;
      const endHour = sortedSlots.length > 0 ? parseInt(sortedSlots[sortedSlots.length - 1].split(':')[0]) : 17;

      setSchedulingContext(prev => ({
        ...prev,
        timeHorizon: {
          startDate: sortedDays[0] || prev.timeHorizon?.startDate || '2025-06-10',
          endDate: sortedDays[sortedDays.length - 1] || prev.timeHorizon?.endDate || '2025-06-20',
          startHour,
          endHour,
          excludeWeekends: prev.timeHorizon?.excludeWeekends ?? true,
        },
      }));
    }
  }, [gridSource, propDays, propTimeSlots]);

  // Regenerate grid when time horizon changes
  useEffect(() => {
    if (schedulingContext.timeHorizon) {
      const gridStructure = generateGridFromTimeHorizon(schedulingContext.timeHorizon);

      if (gridSource === 'timehorizon') {
        // Pure time horizon mode: replace grid entirely
        setDays(gridStructure.days);
        setDayLabels(gridStructure.dayLabels);
        setTimeSlots(gridStructure.timeSlots);
      } else if (horizonMergeEnabled) {
        // Merge mode: combine CSV days with time horizon days, CSV slots with horizon slots
        // Only merge when user has explicitly changed the time horizon
        const allDays = Array.from(new Set([...propDays, ...gridStructure.days])).sort((a, b) => {
          return new Date(a).getTime() - new Date(b).getTime();
        });
        const allSlots = Array.from(new Set([...propTimeSlots, ...gridStructure.timeSlots])).sort((a, b) => {
          const [aHour] = a.split(':').map(Number);
          const [bHour] = b.split(':').map(Number);
          return aHour - bHour;
        });

        const allDayLabels = allDays.map(day => {
          const date = new Date(day + 'T00:00:00');
          return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
        });

        setDays(allDays);
        setDayLabels(allDayLabels);
        setTimeSlots(allSlots);
      }

      // Update availabilities to match new grid structure
      if (gridSource === 'timehorizon') {
        // In time horizon mode, always update availabilities when grid changes
        if (availabilities.length === 0) {
          const placeholders = generatePlaceholderAvailabilities(gridStructure, 8);
          setAvailabilities(placeholders);
        } else {
          const updatedAvailabilities = availabilities.map(person => {
            const newAvailability: typeof person.availability = {};

            gridStructure.days.forEach(day => {
              newAvailability[day] = {};
              gridStructure.timeSlots.forEach(slot => {
                // Keep existing data if it exists, otherwise default to empty
                newAvailability[day][slot] = person.availability[day]?.[slot] || { status: 'empty', locked: false };
              });
            });

            return {
              ...person,
              availability: newAvailability,
            };
          });
          setAvailabilities(updatedAvailabilities);
        }
      } else if (horizonMergeEnabled) {
        // Merge mode: update availabilities with combined grid
        const finalDays = Array.from(new Set([...propDays, ...gridStructure.days])).sort((a, b) => {
          return new Date(a).getTime() - new Date(b).getTime();
        });
        const finalSlots = Array.from(new Set([...propTimeSlots, ...gridStructure.timeSlots])).sort((a, b) => {
          const [aHour] = a.split(':').map(Number);
          const [bHour] = b.split(':').map(Number);
          return aHour - bHour;
        });

        const updatedAvailabilities = availabilities.map(person => {
          const newAvailability: typeof person.availability = {};

          finalDays.forEach(day => {
            newAvailability[day] = {};
            finalSlots.forEach(slot => {
              newAvailability[day][slot] = person.availability[day]?.[slot] || { status: 'empty', locked: false };
            });
          });

          return {
            ...person,
            availability: newAvailability,
          };
        });
        setAvailabilities(updatedAvailabilities);
      }
    }
  }, [schedulingContext.timeHorizon, gridSource, horizonMergeEnabled, propDays, propTimeSlots]);

  // Auto-show grid setup modal when grid is empty
  useEffect(() => {
    if (days.length === 0 || timeSlots.length === 0) {
      setShowGridSetupModal(true);
    }
  }, [days.length, timeSlots.length]);

  // Detect conflicts between events and availability
  useEffect(() => {
    if (!currentState || !currentState.events || currentState.events.length === 0) {
      // Clear conflicts if no events
      setAvailabilities(prev => {
        const hasAnyConflicts = prev.some(p => p.conflicts && p.conflicts.length > 0);
        if (hasAnyConflicts) {
          return prev.map(p => ({ ...p, conflicts: [] }));
        }
        return prev;
      });
      return;
    }

    setAvailabilities(prev => {
      const updatedAvailabilities = detectEventConflicts(prev, currentState.events);

      // Only update if conflicts have actually changed to avoid infinite loops
      const conflictsChanged = updatedAvailabilities.some((person, idx) => {
        const oldPerson = prev[idx];
        const oldConflicts = oldPerson?.conflicts || [];
        const newConflicts = person.conflicts || [];

        if (oldConflicts.length !== newConflicts.length) return true;

        return newConflicts.some((conflict, cIdx) => {
          const oldConflict = oldConflicts[cIdx];
          return !oldConflict ||
            conflict.day !== oldConflict.day ||
            conflict.timeSlot !== oldConflict.timeSlot ||
            JSON.stringify(conflict.conflictingEvents) !== JSON.stringify(oldConflict.conflictingEvents);
        });
      });

      return conflictsChanged ? updatedAvailabilities : prev;
    });
  }, [currentState?.events]);

  // Dynamic breadcrumbs based on scheduling context
  const breadcrumbs: BreadcrumbItem[] = (() => {
    const crumbs: BreadcrumbItem[] = [];

    if (schedulingContext.period) {
      crumbs.push({ label: schedulingContext.period.label, onClick: () => setActiveTab('setup') });
    }
    if (schedulingContext.department) {
      crumbs.push({ label: schedulingContext.department.name, onClick: () => setActiveTab('setup') });
    }

    if (schedulingContext.taskType === 'thesis-defences') {
      crumbs.push({ label: 'Thesis Defenses' });
      if (schedulingContext.thesisSubtype === 'intermediate') {
        crumbs.push({ label: 'Intermediate' });
      } else {
        crumbs.push({ label: 'Final' });
      }
    } else if (schedulingContext.taskType === 'examinations') {
      crumbs.push({ label: 'Examinations' });
      const examLabels = {
        'first-period': 'January Period',
        'second-period': 'June Period',
        'third-period': 'August Period',
        'midterms': 'Midterms',
      };
      if (schedulingContext.examSubtype) {
        crumbs.push({ label: examLabels[schedulingContext.examSubtype] });
      }
      if (schedulingContext.examSchedulingType === 'invigilators') {
        crumbs.push({ label: 'Invigilators' });
      }
    }

    return crumbs;
  })();

  const tabs: Tab[] = [
    { id: 'setup', label: 'Setup' },
    { id: 'participants', label: 'Participants' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'explain', label: 'Explain', badge: currentState?.conflicts.length || 0 },
    { id: 'export', label: 'Export' },
  ];

  const handleEventClick = useCallback((eventId: string, multiSelect?: boolean) => {
    if (multiSelect) {
      setSelectedEvents(prev => {
        const newSet = new Set(prev);
        if (newSet.has(eventId)) {
          newSet.delete(eventId);
        } else {
          newSet.add(eventId);
        }
        return newSet;
      });
    } else {
      // Select the event and highlight in sidebar
      setSelectedEvent(prev => {
        // Check if clicking the same event - deselect it
        if (prev === eventId) {
          setHighlightedEventId(undefined);
          setHighlightedPersons([]);
          return null;
        } else {
          const event = events.find(e => e.id === eventId);
          if (event) {
            // Highlight in sidebar
            setHighlightedEventId(eventId);

            // Highlight all participants in availability
            const participantNames = getEventParticipants(event);
            const participantIds = availabilities
              .filter(p => participantNames.includes(p.name))
              .map(p => p.id);
            setHighlightedPersons(participantIds);

            // Clear highlight after 3 seconds
            setTimeout(() => setHighlightedEventId(undefined), 3000);
          }
          return eventId;
        }
      });
    }
    onEventClick?.(eventId);
  }, [events, onEventClick]);

  const handleEventDoubleClick = useCallback((eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      setDetailContent({
        type: 'defence',
        id: event.id,
        student: {
          name: event.student,
          programme: event.programme,
          thesisTitle: event.title,
        },
        supervisor: event.supervisor,
        coSupervisor: event.coSupervisor,
        assessors: event.assessors,
        mentors: event.mentors,
        scheduledTime: {
          day: event.day,
          startTime: event.startTime,
          endTime: event.endTime,
          room: event.room || 'TBD',
        },
        locked: event.locked,
      });
      setDetailPanelMode('detail');
      setDetailEditable(true);
      setDetailPanelOpen(true);

      // Set highlighted persons and slot for availability panel scrolling
      const participantNames = new Set(getEventParticipants(event).map(name => normalizeName(name)));
      const participantIds = availabilities
        .filter(p => participantNames.has(normalizeName(p.name)))
        .map(p => p.id);
      setHighlightedPersons(participantIds);

      // Set highlighted slot if defence is scheduled
      if (event.day && event.startTime) {
        setHighlightedSlot({ day: event.day, timeSlot: event.startTime });
      } else {
        setHighlightedSlot(null);
      }
    }
  }, [events, availabilities]);

  const handleParticipantClick = (personId: string) => {
    const person = availabilities.find(p => p.id === personId);
    if (person) {
      // Highlight all defenses that include this participant
      const relatedEventIds = events
        .filter(e => eventIncludesParticipant(e, person.name))
        .map(e => e.id);

      setSelectedEvents(new Set(relatedEventIds));
      setSelectedEvent(relatedEventIds[0] || null);
      setHighlightedEventId(relatedEventIds[0]);

      setDetailContent({
        type: 'participant',
        id: person.id,
        name: person.name,
        role: person.role,
      });
      setDetailPanelOpen(true);
    }
  };

  // Helper function to extract participants with caching
  const getEventParticipants = useCallback(
    (event: DefenceEvent): string[] => {
      return eventParticipantCache.get(event.id)?.names || collectEventParticipants(event);
    },
    [eventParticipantCache, collectEventParticipants]
  );

  const eventIncludesParticipant = (event: DefenceEvent, participantName: string): boolean => {
    const normalized = normalizeName(participantName);
    if (!normalized) return false;
    return getEventParticipants(event).some(name => normalizeName(name) === normalized);
  };

  const normalizeConflicts = (rawConflicts: any[] = []): Conflict[] => {
    return rawConflicts.map((c, idx) => {
      const id =
        c.id ||
        c.conflict_id ||
        c.constraint_id ||
        `${c.type || 'conflict'}-${idx}-${Date.now()}`;

      const affected = c.affected_defence_ids || c.affectedDefenceIds || [];
      const participants = c.participants || c.persons || c.people || [];
      const suggestions = (c.suggestions || []).map((s: any, sIdx: number) => ({
        id: s.id || `${id}-sugg-${sIdx}`,
        label: s.label || s.action || 'Suggestion',
        description: s.description,
        action: s.action || 'apply',
        payload: s.payload || {},
      }));

      return {
        id,
        type: c.type || 'other',
        message: c.message || c.description || 'Constraint violation',
        affectedDefenceIds: Array.isArray(affected) ? affected : [affected],
        participants: Array.isArray(participants) ? participants : [participants],
        room: c.room || c.room_id,
        day: c.day || c.date,
        timeSlot: c.time_slot || c.timeSlot,
        severity: c.severity || 'error',
        constraintId: c.constraint_id || c.constraintId,
        suggestions,
      };
    });
  };

  const severityRank: Record<ConflictSeverity, number> = {
    error: 3,
    warning: 2,
    info: 1,
  };

  // Local conflict detection when backend hasn't provided conflicts
  const derivedConflicts = useMemo(() => {
    const conflicts: Conflict[] = [];

    // Helper to fetch availability status
    const availabilityMap = new Map<string, PersonAvailability>();
    availabilities.forEach(p => availabilityMap.set(p.name, p));

    const participantConflicts = new Map<string, Map<string, string[]>>(); // person -> slotKey -> eventIds

    events.forEach(evt => {
      if (!evt.day || !evt.startTime) return;
      const participants = getEventParticipants(evt);
      const slotKey = `${evt.day}:${evt.startTime}`;

      // Double booking map
      participants.forEach(person => {
        if (!participantConflicts.has(person)) {
          participantConflicts.set(person, new Map());
        }
        const slots = participantConflicts.get(person)!;
        if (!slots.has(slotKey)) slots.set(slotKey, []);
        slots.get(slotKey)!.push(evt.id);
      });

      // Availability violation: only when explicitly marked unavailable
      participants.forEach(person => {
        const avail = availabilityMap.get(person);
        const statusRaw = avail?.availability?.[evt.day]?.[evt.startTime];
        const status = typeof statusRaw === 'object' ? statusRaw.status : statusRaw;
        if (status === 'unavailable') {
          conflicts.push({
            id: `av-${evt.id}-${person}-${slotKey}`,
            type: 'availability-violation',
            message: `${person} unavailable at ${slotKey}`,
            affectedDefenceIds: [evt.id],
            participants: [person],
            day: evt.day,
            timeSlot: evt.startTime,
            severity: 'error',
          });
        }
      });
    });

    // Add double-booking conflicts
    participantConflicts.forEach((slots, person) => {
      slots.forEach((eventIds, slotKey) => {
        if (eventIds.length > 1) {
          const [day, timeSlot] = slotKey.split(':');
          conflicts.push({
            id: `db-${person}-${slotKey}`,
            type: 'double-booking',
            message: `${person} has multiple defenses at ${slotKey}`,
            affectedDefenceIds: eventIds,
            participants: [person],
            day,
            timeSlot,
            severity: 'error',
          });
        }
      });
    });

    return conflicts;
  }, [events, availabilities]);

  const conflictSource = currentState?.conflicts?.length ? currentState.conflicts : derivedConflicts;

  const { eventConflictsMap, personSlotConflictsMap } = useMemo(() => {
    const eventConflicts = new Map<string, Conflict[]>();
    const personSlotConflicts = new Map<string, Conflict[]>();

    if (conflictSource?.length) {
      // Index conflicts by event and person/slot
      conflictSource.forEach(conflict => {
        conflict.affectedDefenceIds.forEach(id => {
          if (!eventConflicts.has(id)) eventConflicts.set(id, []);
          eventConflicts.get(id)!.push(conflict);
        });

        const participantList = conflict.participants && conflict.participants.length > 0
          ? conflict.participants
          : [];

        // If conflict provides day/time directly, use them
        if (conflict.day && conflict.timeSlot && participantList.length > 0) {
          participantList.forEach(person => {
            const key = `${person}_${conflict.day}_${conflict.timeSlot}`;
            if (!personSlotConflicts.has(key)) personSlotConflicts.set(key, []);
            personSlotConflicts.get(key)!.push(conflict);
          });
        }
      });
    }

    // Map conflicts onto person-slot using events' positions
    events.forEach(evt => {
      if (!evt.day || !evt.startTime || !evt.conflicts?.length) return;
      const participants = [
        ...expandParticipantNames(evt.student),
        ...expandParticipantNames(evt.supervisor),
        ...expandParticipantNames(evt.coSupervisor),
        ...(evt.assessors || []),
        ...(evt.mentors || []),
      ].filter(Boolean);
      evt.conflicts.forEach(conflictId => {
        const conflictList = conflictSource || [];
        const found = conflictList.find(c => c.id === conflictId);
        if (found) {
          // Fill person-slot map using event context when conflict lacks explicit participants
          const conflictParticipants = found.participants && found.participants.length > 0
            ? found.participants
            : participants;
          if (evt.day && evt.startTime) {
            conflictParticipants.forEach(person => {
              const key = `${person}_${evt.day}_${evt.startTime}`;
              if (!personSlotConflicts.has(key)) personSlotConflicts.set(key, []);
              personSlotConflicts.get(key)!.push(found);
            });
          }
        }
      });
    });

    return { eventConflictsMap: eventConflicts, personSlotConflictsMap: personSlotConflicts };
  }, [conflictSource, events]);

  const getEventConflictMeta = useCallback(
    (eventId: string): { count: number; severity?: ConflictSeverity; hasDoubleBooking: boolean; doubleBookingCount: number } => {
      const conflicts = eventConflictsMap.get(eventId) || [];
      const count = conflicts.length;
      const doubleBookingCount = conflicts.filter(c => c.type === 'double-booking').length;
      const severity = conflicts.reduce<ConflictSeverity | undefined>((acc, conflict) => {
        if (!acc) return conflict.severity;
        return severityRank[conflict.severity] > severityRank[acc] ? conflict.severity : acc;
      }, undefined);
      const hasDoubleBooking = doubleBookingCount > 0;
      return { count, severity, hasDoubleBooking, doubleBookingCount };
    },
    [eventConflictsMap, severityRank]
  );

  const handleApplySuggestion = (suggestion: any) => {
    logger.debug('Apply suggestion', suggestion);
    showToast.success(suggestion.label || 'Applied suggestion');
  };

  // Keep live references for drag handlers to avoid re-attaching listeners on every render
  const eventsRef = useRef(events);
  const selectedEventsRef = useRef(selectedEvents);
  const currentStateRef = useRef(currentState);
  const pushRef = useRef(push);

  useEffect(() => {
    eventsRef.current = events;
    selectedEventsRef.current = selectedEvents;
    currentStateRef.current = currentState;
    pushRef.current = push;
  }, [events, selectedEvents, currentState, push]);

  // Dedicated controller to cancel stale validation requests
  const validationControllerRef = useRef<AbortController | null>(null);

  const handleDrop = async (eventId: string, day: string, timeSlot: string) => {
    if (!currentStateRef.current) return;

    // Clear slot highlights once a drop action is committed
    setHighlightedSlot(null);

    // If multiple events are selected and the dragged event is one of them, move all selected events
    const eventsToMove = selectedEventsRef.current.has(eventId)
      ? Array.from(selectedEventsRef.current)
      : [eventId];

    const updatedEvents = currentStateRef.current.events.map(e => {
      if (eventsToMove.includes(e.id)) {
        return {
          ...e,
          day: day,
          startTime: timeSlot,
        };
      }
      return e;
    });

    // Optimistically update UI immediately
    const optimisticState: ScheduleState = {
      ...currentStateRef.current!,
      events: updatedEvents,
    };

    const action: ScheduleAction = {
      type: 'drag-defence',
      timestamp: Date.now(),
      description: eventsToMove.length > 1
        ? `Moved ${eventsToMove.length} defenses to ${day} ${timeSlot}`
        : `Moved defense ${eventId} to ${day} ${timeSlot}`,
      data: { eventId, eventsToMove, newDay: day, newTimeSlot: timeSlot },
    };

    pushRef.current(action, optimisticState);

    // Cancel any in-flight validation
    if (validationControllerRef.current) {
      validationControllerRef.current.abort();
    }
    const controller = new AbortController();
    validationControllerRef.current = controller;

    // Validate with backend in background
    try {
      const response = await fetch('http://localhost:8000/api/schedule/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: updatedEvents }),
        signal: controller.signal,
      });

      const result = await response.json();

      // Normalize conflicts from backend for UI consumption
      const normalizedConflicts = normalizeConflicts(result.conflicts || []);
      const conflictsByEvent = new Map<string, Conflict[]>();
      normalizedConflicts.forEach(conflict => {
        conflict.affectedDefenceIds.forEach(id => {
          if (!conflictsByEvent.has(id)) {
            conflictsByEvent.set(id, []);
          }
          conflictsByEvent.get(id)!.push(conflict);
        });
      });

      const eventsWithConflicts = updatedEvents.map(event => {
        const eventConflicts = conflictsByEvent.get(event.id) || [];
        return {
          ...event,
          conflicts: eventConflicts.map(c => c.id),
        };
      });

      const validatedState: ScheduleState = {
        ...currentStateRef.current!,
        events: eventsWithConflicts,
        conflicts: normalizedConflicts,
      };

      // Only update history if conflicts are detected to avoid double entries
      if (normalizedConflicts.length > 0) {
        const conflictAction: ScheduleAction = {
          type: 'validation-update',
          timestamp: Date.now(),
          description: `Conflicts detected after move to ${day} ${timeSlot}`,
          data: { eventId, eventsToMove, conflicts: normalizedConflicts },
        };
        startTransition(() => pushRef.current(conflictAction, validatedState));
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return; // Stale validation
      logger.error('Validation failed:', error);
      showToast.error('Failed to validate schedule. Please try again.');
    }
  };

  const handleLockToggle = useCallback((eventId: string) => {
    if (!currentState) return;

    const updatedEvents = currentState.events.map(event => {
      if (event.id === eventId) {
        return { ...event, locked: !event.locked };
      }
      return event;
    });

    const action: ScheduleAction = {
      type: currentState.events.find(e => e.id === eventId)?.locked ? 'unlock-defence' : 'lock-defence',
      timestamp: Date.now(),
      description: `Toggled lock for defense ${eventId}`,
      data: { eventId },
    };

    push(action, {
      ...currentState,
      events: updatedEvents,
    });
  }, [currentState, push]);

  const handleAvailabilitySlotClick = (personId: string, day: string, timeSlot: string) => {
    // Set highlighted slot (persists until another click clears it)
    setHighlightedSlot({ day, timeSlot });

    // Scroll to the corresponding row in the main schedule grid
    const rowElement = timeSlotRefs.current.get(timeSlot);
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // If there are multiple events in this slot, bring the one with this person to the front
    const cellKey = getCellKey(day, timeSlot);
    const cellEvents = getEventsForCell(day, timeSlot);

    if (cellEvents.length > 1) {
      // Find event with this person
      const eventIndex = cellEvents.findIndex(event => {
        const person = availabilities.find(p => p.id === personId);
        if (!person) return false;
        return eventIncludesParticipant(event, person.name);
      });

      if (eventIndex !== -1) {
        setActiveCardIndex(prev => ({
          ...prev,
          [cellKey]: eventIndex,
        }));
      }
    }
  };

  const clearSelectionState = useCallback(() => {
    setSelectedEvent(null);
    setSelectedEvents(new Set());
    setHighlightedPersons([]);
    setHighlightedSlot(null);
    setHighlightedEventId(undefined);
  }, []);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-availability-slot="true"]')) {
        return;
      }
      if (target.closest('[data-prevent-clear="true"]')) {
        return;
      }
      if (
        !selectedEvent &&
        selectedEvents.size === 0 &&
        highlightedPersons.length === 0 &&
        !highlightedSlot &&
        !highlightedEventId
      ) {
        return;
      }
      clearSelectionState();
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handler, { capture: true });
    };
  }, [
    clearSelectionState,
    selectedEvent,
    selectedEvents,
    highlightedPersons,
    highlightedSlot,
    highlightedEventId,
  ]);

  const handleAvailabilitySlotEdit = (
    personId: string,
    day: string,
    slot: string,
    status: string,
    locked: boolean
  ) => {
    logger.debug('handleAvailabilitySlotEdit called:', { personId, day, slot, status, locked });

    const updatedAvailabilities = availabilities.map(person => {
      if (person.id === personId) {
        // Always use object format for consistency
        const slotValue: { status: 'available' | 'unavailable' | 'booked' | 'empty'; locked: boolean } = {
          status: status as 'available' | 'unavailable' | 'booked' | 'empty',
          locked: locked
        };

        logger.debug('Updating slot with value:', slotValue);

        // Create a new day object to ensure React detects the change
        const updatedDayAvailability = {
          ...(person.availability[day] || {}),
          [slot]: slotValue,
        };

        return {
          ...person,
          availability: {
            ...person.availability,
            [day]: updatedDayAvailability,
          },
        };
      }
      return person;
    });

    logger.debug('Setting new availabilities:', updatedAvailabilities);
    setAvailabilities(updatedAvailabilities);
    onAvailabilityEdit?.(personId, day, slot, status, locked);
  };

  const handleAvailabilityDayToggle = (personId: string, day: string, locked: boolean) => {
    const updatedAvailabilities = availabilities.map(person => {
      if (person.id === personId) {
        return {
          ...person,
          dayLocks: {
            ...(person.dayLocks || {}),
            [day]: locked,
          },
        };
      }
      return person;
    });

    setAvailabilities(updatedAvailabilities);
  };

  const handleUnscheduleSelection = () => {
    if (!currentState || selectedEvents.size === 0) return;

    const unscheduledEvents = currentState.events.map(e => {
      if (selectedEvents.has(e.id)) {
        const { day, startTime, endTime, room, ...rest } = e;
        return rest as DefenceEvent;
      }
      return e;
    });

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: `Unscheduled ${selectedEvents.size} defense(s)`,
      data: { unscheduledIds: Array.from(selectedEvents) },
    };

    push(action, {
      ...currentState,
      events: unscheduledEvents,
    });

    setSelectedEvents(new Set());
    showToast.success(`Unscheduled ${selectedEvents.size} defense(s)`);
  };

  const handleDeleteSelection = () => {
    if (!currentState || selectedEvents.size === 0) return;

    const remainingEvents = currentState.events.filter(e => !selectedEvents.has(e.id));
    const deletedIds = Array.from(selectedEvents);

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: `Deleted ${deletedIds.length} defense(s)`,
      data: { deletedIds },
    };

    push(action, {
      ...currentState,
      events: remainingEvents,
    });

    setSelectedEvents(new Set());
  };

  const handleDeleteAll = () => {
    if (!currentState) return;

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: 'Deleted all defenses',
      data: { deletedCount: currentState.events.length },
    };

    push(action, {
      ...currentState,
      events: [],
    });

    setSelectedEvents(new Set());
  };

  const handleDeleteDefence = (defenceId: string) => {
    if (!currentState) return;

    const remainingEvents = currentState.events.filter(e => e.id !== defenceId);

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: `Deleted defense ${defenceId}`,
      data: { deletedId: defenceId },
    };

    push(action, {
      ...currentState,
      events: remainingEvents,
    });

    // Close detail panel after deletion
    setDetailPanelOpen(false);
    setDetailContent(null);
  };

  const handleAddDefence = (prefilledDay?: string, prefilledTimeSlot?: string) => {
    // Create a new empty defence with optional prefilled slot
    const newDefence: DefenceEvent = {
      id: `defence-${Date.now()}`,
      student: 'New Student',
      supervisor: 'Supervisor TBD',
      assessors: [],
      mentors: [],
      title: 'New Defense',
      programme: 'CS',
      locked: false,
      day: prefilledDay || '',
      startTime: prefilledTimeSlot || '',
      endTime: '',
    };

    // Open detail panel in edit mode for the new defence
    setSelectedEvent(newDefence.id);
    setDetailContent({
      type: 'defence',
      id: newDefence.id,
      student: {
        name: newDefence.student,
        programme: newDefence.programme,
        thesisTitle: newDefence.title,
      },
      supervisor: newDefence.supervisor,
      coSupervisor: newDefence.coSupervisor,
      assessors: newDefence.assessors,
      mentors: newDefence.mentors,
      scheduledTime: {
        day: newDefence.day,
        startTime: newDefence.startTime,
        endTime: newDefence.endTime,
        room: newDefence.room || '',
      },
      locked: newDefence.locked,
    });
    setDetailEditable(true);
    setDetailPanelOpen(true);
  };

  const handleShowUnscheduled = () => {
    setDetailPanelMode('list');
    setDetailPanelOpen(true);
    setSearchQuery('');
  };

  const handleUnscheduledCardClick = (event: DefenceEvent) => {
    const eventId = event.id;
    const currentCount = clickCount.get(eventId) || 0;
    const newCount = currentCount + 1;

    // Update click count
    const newClickCount = new Map(clickCount);
    newClickCount.set(eventId, newCount);
    setClickCount(newClickCount);

    // Clear existing timeout for this event
    const existingTimeout = clickTimeoutRef.current.get(eventId);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Reset count after 500ms of inactivity
    const timeout = setTimeout(() => {
      const resetMap = new Map(clickCount);
      resetMap.delete(eventId);
      setClickCount(resetMap);
      clickTimeoutRef.current.delete(eventId);
    }, 500);

    clickTimeoutRef.current.set(eventId, timeout);

    if (newCount === 1) {
      // FIRST CLICK: Highlight + bring to front
      handleEventClick(event.id);
      setHighlightedEventId(event.id);

      if (event.day && event.startTime) {
        // Auto bring-to-front logic
        const cellKey = getCellKey(event.day, event.startTime);
        const cellEvents = getEventsForCell(event.day, event.startTime);
        const eventIndex = cellEvents.findIndex(e => e.id === event.id);

        if (eventIndex !== -1) {
          setActiveCardIndex(prev => ({
            ...prev,
            [cellKey]: eventIndex,
          }));
        }

        // Scroll to position
        setTimeout(() => {
          const cardElement = document.querySelector(`[data-event-id="${event.id}"]`);
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
        }, 100);
      }
    } else if (newCount === 2) {
      // SECOND CLICK: Open detail panel
      setDetailPanelMode('detail');
      setSelectedEvent(event.id);
      setDetailContent({
        type: 'defence',
        id: event.id,
        student: {
          name: event.student,
          programme: event.programme,
          thesisTitle: event.title,
        },
        supervisor: event.supervisor,
        coSupervisor: event.coSupervisor,
        assessors: event.assessors,
        mentors: event.mentors,
        scheduledTime: event.day && event.startTime ? {
          day: event.day,
          startTime: event.startTime,
          endTime: event.endTime,
          room: event.room || '',
        } : undefined,
        locked: event.locked,
      });
      setDetailEditable(true);
      setDetailPanelOpen(true);

      // Extract all participants from the event and highlight them in availability panel
      const participantNames = new Set(getEventParticipants(event).map(name => normalizeName(name)));
      const participantIds = availabilities
        .filter(p => participantNames.has(normalizeName(p.name)))
        .map(p => p.id);
      setHighlightedPersons(participantIds);

      // Clear highlight and reset count
      setTimeout(() => setHighlightedEventId(undefined), 300);
      const resetMap = new Map(clickCount);
      resetMap.delete(eventId);
      setClickCount(resetMap);
    }
  };

  const handleAddNewUnscheduled = () => {
    if (!currentState) return;

    const newDefence: DefenceEvent = {
      id: `defence-${Date.now()}`,
      student: 'New Student',
      supervisor: 'Supervisor TBD',
      assessors: [],
      mentors: [],
      title: 'New Defense',
      programme: 'CS',
      locked: false,
      day: '',
      startTime: '',
      endTime: '',
    };

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: 'Added new unscheduled defense',
      data: { defenceId: newDefence.id },
    };

    push(action, {
      ...currentState,
      events: [...currentState.events, newDefence],
    });

    handleUnscheduledCardClick(newDefence);
  };

  // Roster management handlers
  const handleNewRoster = () => {
    rosterCounterRef.current += 1;

    // Create empty roster with no events
    const emptyState: ScheduleState = {
      events: [],
      locks: new Map(),
      solverMetadata: null,
      conflicts: [],
    };

    const newRoster: Roster = {
      id: `roster-${Date.now()}`,
      label: `Schedule ${rosterCounterRef.current}`,
      state: emptyState,
      availabilities: [], // Empty availability list
      objectives: {
        global: globalObjectives,
        local: localObjectives,
      },
      createdAt: Date.now(),
      source: 'manual',
    };

    setRosters(prev => [...prev, newRoster]);
    setActiveRosterId(newRoster.id);

    // Switch to the new empty roster
    push({
      type: 'manual-edit',
      timestamp: Date.now(),
      description: `Created ${newRoster.label}`,
      data: {},
    }, emptyState);
    setAvailabilities([]);

    showToast.success(`Created empty ${newRoster.label}`);
  };

  const handleRosterSelect = (rosterId: string) => {
    const roster = rosters.find(r => r.id === rosterId);
    if (!roster) return;

    // Batch all state updates in a transition for smoother UX
    startTransition(() => {
      setActiveRosterId(rosterId);
      push({
        type: 'manual-edit',
        timestamp: Date.now(),
        description: `Switched to ${roster.label}`,
        data: { rosterId },
      }, roster.state);
      setAvailabilities(roster.availabilities);
      if (roster.objectives) {
        setGlobalObjectives(roster.objectives.global);
        setLocalObjectives(roster.objectives.local);
      }

      // Restore grid structure from roster
      if (roster.gridData) {
        setDays(roster.gridData.days);
        setDayLabels(roster.gridData.dayLabels);
        setTimeSlots(roster.gridData.timeSlots);
      }
    });
  };

  const handleRosterDelete = (rosterId: string) => {
    if (rosters.length === 1) {
      showToast.error('Cannot delete the last roster');
      return;
    }

    const rosterToDelete = rosters.find(r => r.id === rosterId);
    if (!rosterToDelete) return;

    // Filter out deleted roster and renumber remaining rosters
    const remainingRosters = rosters.filter(r => r.id !== rosterId);
    const renumberedRosters = remainingRosters.map((r, index) => ({
      ...r,
      label: `Schedule ${index + 1}`,
    }));

    // Update counter to match the new count
    rosterCounterRef.current = renumberedRosters.length;

    // Batch all updates in a transition
    startTransition(() => {
      setRosters(renumberedRosters);

      // If we deleted the active roster, switch to the first one
      if (activeRosterId === rosterId) {
        if (renumberedRosters.length > 0) {
          const newActiveRoster = renumberedRosters[0];
          setActiveRosterId(newActiveRoster.id);
          push({
            type: 'manual-edit',
            timestamp: Date.now(),
            description: `Switched to ${newActiveRoster.label}`,
            data: { rosterId: newActiveRoster.id },
          }, newActiveRoster.state);
          setAvailabilities(newActiveRoster.availabilities);
          if (newActiveRoster.objectives) {
            setGlobalObjectives(newActiveRoster.objectives.global);
            setLocalObjectives(newActiveRoster.objectives.local);
          }
          if (newActiveRoster.gridData) {
            setDays(newActiveRoster.gridData.days);
            setDayLabels(newActiveRoster.gridData.dayLabels);
            setTimeSlots(newActiveRoster.gridData.timeSlots);
          }
        }
      }
    });

    showToast.success(`Deleted ${rosterToDelete.label}`);
  };

  const handleRosterRename = (rosterId: string, newLabel: string) => {
    setRosters(prev => prev.map(r =>
      r.id === rosterId ? { ...r, label: newLabel } : r
    ));
  };

  const handleSaveDefence = (updatedDefence: any) => {
    if (!currentState) return;

    // Convert DetailContent back to DefenceEvent format
    const defenceEvent: DefenceEvent = {
      id: updatedDefence.id,
      student: updatedDefence.student.name,
      supervisor: updatedDefence.supervisor,
      coSupervisor: updatedDefence.coSupervisor,
      assessors: updatedDefence.assessors,
      mentors: updatedDefence.mentors || [],
      title: updatedDefence.student.thesisTitle || 'Untitled',
      programme: updatedDefence.student.programme,
      locked: false,
      day: updatedDefence.scheduledTime?.day || '',
      startTime: updatedDefence.scheduledTime?.startTime || '',
      endTime: updatedDefence.scheduledTime?.endTime || '',
      room: updatedDefence.scheduledTime?.room,
    };

    // Check if this is a new defence or an update
    const existingIndex = currentState.events.findIndex(e => e.id === defenceEvent.id);
    const updatedEvents = existingIndex >= 0
      ? currentState.events.map(e => e.id === defenceEvent.id ? defenceEvent : e)
      : [...currentState.events, defenceEvent];

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: existingIndex >= 0 ? `Updated defense ${defenceEvent.id}` : `Added new defense`,
      data: { defenceId: defenceEvent.id },
    };

    push(action, {
      ...currentState,
      events: updatedEvents,
    });

    setDetailEditable(false);
  };

  const handleTimeHorizonChange = (newHorizon: TimeHorizon) => {
    setSchedulingContext(prev => ({
      ...prev,
      timeHorizon: newHorizon,
    }));
    // Enable merging when user manually edits time horizon
    // This combines CSV data with the extended grid
    setHorizonMergeEnabled(true);
  };

  const handleGridSetupSubmit = (newHorizon: TimeHorizon) => {
    setSchedulingContext(prev => ({
      ...prev,
      timeHorizon: newHorizon,
    }));
    setShowGridSetupModal(false);
  };

  // Optimize filteredEvents with stable filter references
  const filteredEvents = useMemo(() => {
    // Early return if no filters active (common case)
    const hasActiveFilters =
      !filters.status.scheduled ||
      !filters.status.unscheduled ||
      filters.programmes.length !== Array.from(new Set(events.map(e => e.programme))).length ||
      filters.participantSearch.length > 0;

    if (!hasActiveFilters) return events;

    // Apply filters sequentially with early exits
    return events.filter(event => {
      // Status filter (most selective first)
      const isScheduled = Boolean(event.startTime && event.endTime);
      if (!filters.status.scheduled && isScheduled) return false;
      if (!filters.status.unscheduled && !isScheduled) return false;

      // Programme filter
      if (!filters.programmes.includes(event.programme)) return false;

      // Participant search (most expensive, do last)
      if (filters.participantSearch) {
        const search = filters.participantSearch.toLowerCase();
        // Check individual fields directly instead of creating array
        if (event.student.toLowerCase().includes(search)) return true;
        if (event.supervisor.toLowerCase().includes(search)) return true;
        if (event.coSupervisor?.toLowerCase().includes(search)) return true;
        if (event.assessors.some(a => a.toLowerCase().includes(search))) return true;
        if (event.mentors.some(m => m.toLowerCase().includes(search))) return true;
        return false;
      }

      return true;
    });
  }, [events, filters.status.scheduled, filters.status.unscheduled, filters.programmes, filters.participantSearch]);

  const stats = useMemo(() => ({
    total: events.length,
    scheduled: events.filter(e => e.startTime && e.endTime).length,
    unscheduled: events.filter(e => !e.startTime || !e.endTime).length,
    conflicts: conflictSource.length,
  }), [events, conflictSource]);

  // All events for sidebar (not just unscheduled)
  const sidebarEvents = useMemo(() => {
    return filteredEvents;
  }, [filteredEvents]);

  // Map rosters to availability roster format for multi-roster view
  const availabilityRosters = useMemo<RosterInfo[]>(() => {
    return rosters.map(roster => {
      const rosterParticipants = new Set<string>();
      const addParticipant = (name: string | undefined) => {
        expandParticipantNames(name).forEach(n => {
          const normalized = normalizeName(n);
          if (normalized) {
            rosterParticipants.add(normalized);
          }
        });
      };
      roster.state.events.forEach(event => {
        addParticipant(event.student);
        addParticipant(event.supervisor);
        addParticipant(event.coSupervisor);
        event.assessors?.forEach(addParticipant);
        event.mentors?.forEach(addParticipant);
      });

      const filteredAvailability = rosterParticipants.size === 0
        ? roster.availabilities
        : roster.availabilities.filter(person => rosterParticipants.has(normalizeName(person.name)));

      return {
        id: roster.id,
        label: roster.label,
        availabilities: filteredAvailability,
      };
    });
  }, [rosters]);

  // Memoize roster list for toolbar to prevent unnecessary re-renders
  const toolbarRosters = useMemo(() => rosters.map(r => ({ id: r.id, label: r.label })), [rosters]);

  const getCellKey = useCallback((day: string, time: string) => `${day}-${time}`, []);

  // Optimize eventsByCell with pre-allocated map and single-pass iteration
  const eventsByCell = useMemo(() => {
    const map = new Map<string, DefenceEvent[]>();

    // Single-pass iteration with pre-filtering
    for (const event of filteredEvents) {
      if (!event.day || !event.startTime) continue;

      const key = `${event.day}-${event.startTime}`;
      const events = map.get(key);

      if (events) {
        events.push(event);
      } else {
        map.set(key, [event]);
      }
    }

    return map;
  }, [filteredEvents]);

  const getEventsForCell = useCallback((day: string, time: string) => {
    return eventsByCell.get(`${day}-${time}`) || [];
  }, [eventsByCell]);

  const getActiveIndex = useCallback((day: string, time: string) => {
    const key = `${day}-${time}`;
    return activeCardIndex[key] || 0;
  }, [activeCardIndex]);

  // Color scheme state with handler for FilterPanel
  const [colorScheme, setColorScheme] = useState<Record<string, string>>({
    TI: '#6bc7eeff',
    CS: '#658fc0ff',
    DH: '#c3aff1ff',
    CW: '#98a084ff',
  });

  const handleColorChange = (programme: string, color: string) => {
    console.log('Color change requested:', { programme, color });
    setColorScheme(prev => {
      const newScheme = {
        ...prev,
        [programme]: color,
      };
      console.log('New color scheme:', newScheme);
      return newScheme;
    });
  };

  const renderScheduleGrid = () => {
    // Show message only if no grid structure exists
    if (days.length === 0 || timeSlots.length === 0) {
      return (
        <>
          <GridSetupModal
            isOpen={showGridSetupModal}
            onClose={() => setShowGridSetupModal(false)}
            onSubmit={handleGridSetupSubmit}
            initialHorizon={schedulingContext.timeHorizon}
          />
          <div className="flex-1 p-6 overflow-auto bg-gray-50">
            <div className="max-w-4xl mx-auto text-center py-12 text-gray-500">
              <p className="text-lg font-medium mb-2">No schedule grid configured</p>
              <p className="text-sm">Configure the time horizon to create a schedule grid.</p>
              <button
                onClick={() => setShowGridSetupModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Configure Grid
              </button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="flex-1 overflow-auto">
          <div className="inline-block min-w-full border rounded-lg bg-white">
            {/* Grid */}
            <table
              className="border-collapse"
              style={{ width: '100%', tableLayout: 'fixed' }}
            >
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 border-r-2 border-r-gray-300 p-3 text-left font-semibold sticky left-0 z-30 bg-gray-100" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>

                  </th>
                  {days.map((day, idx) => (
                    <th
                      key={day}
                      className="border border-gray-200 p-3 text-center font-semibold"
                      style={{
                        width: `${SCHEDULE_COLUMN_WIDTH}px`,
                        minWidth: `${SCHEDULE_COLUMN_WIDTH}px`,
                        maxWidth: `${SCHEDULE_COLUMN_WIDTH}px`,
                      }}
                    >
                      {dayLabels?.[idx] || day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((time) => (
                  <tr
                    key={time}
                    className="bg-white"
                    ref={(el) => {
                      if (el) {
                        timeSlotRefs.current.set(time, el);
                      } else {
                        timeSlotRefs.current.delete(time);
                      }
                    }}
                  >
                    <td className="border border-gray-200 border-r-2 border-r-gray-300 p-3 font-medium sticky left-0 z-30 bg-gray-50" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                      {time}
                    </td>
                      {days.map((day) => {
                        const cellEvents = getEventsForCell(day, time);
                        const activeIndex = getActiveIndex(day, time);
                        const hasMultipleEvents = cellEvents.length > 1;
                        const cellId = getCellKey(day, time);
                        const isHighlighted = highlightedSlot?.day === day && highlightedSlot?.timeSlot === time;
                        const columnHighlightType = columnHighlights?.[day]?.[time];
                        const shouldDimColumn = hasColumnHighlighting && !columnHighlightType;
                        return (
                              <DroppableTimeSlot
                                key={cellId}
                                id={cellId}
                                day={day}
                                timeSlot={time}
                                cellBg="white"
                                cellHoverBg="#eff6ff"
                                borderColor="#e5e7eb"
                                cellPadding={defaultDefenceCardTheme.spacing.cell.padding}
                                className={clsx(
                                  isHighlighted && !columnHighlightType && 'bg-blue-50 outline outline-2 outline-blue-900 outline-offset-[-10px]',
                                  columnHighlightType === 'primary' && 'outline outline-2 outline-blue-900 outline-offset-[-10px] shadow-lg',
                                  columnHighlightType === 'match' && 'outline outline-[1.5px] outline-emerald-600 outline-offset-[-12px] shadow-md',
                                  shouldDimColumn && 'opacity-40'
                                )}
                                columnWidth={SCHEDULE_COLUMN_WIDTH}
                                onAddEvent={handleAddDefence}
                              >
                            {cellEvents.length > 0 && cardViewMode === 'individual' && (
                              <div className="relative min-h-[120px]">
                                <div className="relative">
                                  {cellEvents.map((event, idx) => {
                                    const isActive = idx === activeIndex;
                                    const stackOffset = hasMultipleEvents ? Math.min(idx, 3) * 4 : 0;
                                    const zIndex = isActive ? 20 : 10 - idx;
                                    const conflictMeta = getEventConflictMeta(event.id);

                                    return (
                                      <DraggableDefenceCard
                                        key={event.id}
                                        event={event}
                                        isActive={isActive}
                                        isSelected={selectedEvent === event.id || selectedEvents.has(event.id)}
                                        stackOffset={stackOffset}
                                        zIndex={zIndex}
                                        colorScheme={colorScheme}
                                        conflictCount={conflictMeta.count}
                                        conflictSeverity={conflictMeta.severity}
                                        hasDoubleBooking={conflictMeta.hasDoubleBooking}
                                        doubleBookingCount={conflictMeta.doubleBookingCount}
                                        cardStyle={{
                                          width: '100%',
                                          minHeight: '64px',
                                          padding: '12px 10px 0px 10px',
                                          fontSize: 'text-xs',
                                          showFullDetails: false,
                                        }}
                                        theme={defaultDefenceCardTheme}
                                        highlighted={highlightedEventId === event.id}
                                        onClick={(e) => {
                                          const multiSelect = e.ctrlKey || e.metaKey;
                                          if (!isActive && !multiSelect) {
                                            setActiveCardIndex((prev) => ({
                                              ...prev,
                                              [cellId]: idx,
                                            }));
                                          } else {
                                            handleEventClick(event.id, multiSelect);
                                          }
                                        }}
                                        onDoubleClick={() => handleEventDoubleClick(event.id)}
                                        onLockToggle={() => handleLockToggle(event.id)}
                                      />
                                    );
                                  })}
                                </div>

                                {/* Stack indicator */}
                                {hasMultipleEvents && (
                                  <div className="absolute bottom-2 right-2 flex items-center gap-0.5 z-30">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const currentIndex = activeCardIndex[cellId] || 0;
                                        const prevIndex =
                                          (currentIndex - 1 + cellEvents.length) % cellEvents.length;
                                        setActiveCardIndex((prev) => ({ ...prev, [cellId]: prevIndex }));
                                      }}
                                      className="text-gray-700 hover:text-gray-900"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                      </svg>
                                    </button>

                                    <div className="px-2 py-1 bg-white text-gray-700 text-xs font-semibold rounded shadow-md">
                                      {activeIndex + 1} / {cellEvents.length}
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const currentIndex = activeCardIndex[cellId] || 0;
                                        const nextIndex = (currentIndex + 1) % cellEvents.length;
                                        setActiveCardIndex((prev) => ({ ...prev, [cellId]: nextIndex }));
                                      }}
                                      className="text-gray-700 hover:text-gray-900"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Compact view - individual compact cards stacked vertically */}
                            {cellEvents.length > 0 && cardViewMode === 'compact' && (
                              <div className="flex flex-col" style={{ gap: defaultDefenceCardTheme.spacing.cell.cardSpacing }}>
                                {cellEvents.map((event) => {
                                  const conflictMeta = getEventConflictMeta(event.id);
                                  return (
                                    <DraggableDefenceCard
                                      key={event.id}
                                      event={event}
                                      isActive={true}
                                      isSelected={selectedEvent === event.id || selectedEvents.has(event.id)}
                                      stackOffset={0}
                                      zIndex={10}
                                      colorScheme={colorScheme}
                                      conflictCount={conflictMeta.count}
                                      conflictSeverity={conflictMeta.severity}
                                      hasDoubleBooking={conflictMeta.hasDoubleBooking}
                                      doubleBookingCount={conflictMeta.doubleBookingCount}
                                      cardStyle={{
                                        width: '100%',
                                        minHeight: '42px',
                                        padding: '12px 10px 10px 12px',
                                        fontSize: 'text-xs',
                                        showFullDetails: false,
                                      }}
                                      theme={defaultDefenceCardTheme}
                                      highlighted={highlightedEventId === event.id}
                                      onClick={(e) => {
                                        const multiSelect = e.ctrlKey || e.metaKey;
                                        handleEventClick(event.id, multiSelect);
                                      }}
                                      onDoubleClick={() => handleEventDoubleClick(event.id)}
                                      onLockToggle={() => handleLockToggle(event.id)}
                                      compact={true}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </DroppableTimeSlot>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      </>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'setup':
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <SetupPanel
              context={schedulingContext}
              onContextChange={setSchedulingContext}
              availablePeriods={availablePeriods}
              availableDepartments={availableDepartments}
              onLoadProgrammeData={handleLoadProgrammeData}
            />
          </div>
        );

      case 'participants':
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-6 overflow-auto">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Participants</h2>
              <p className="text-gray-600 mb-4">Participant list and availability management.</p>
              <div className="grid grid-cols-1 gap-4">
                {availabilities.map(person => (
                  <div
                    key={person.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                    onClick={() => handleParticipantClick(person.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{person.name}</h3>
                        <p className="text-sm text-gray-600 capitalize">{person.role}</p>
                      </div>
                      <button className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="flex-1 flex overflow-hidden">
            {toolbarPosition === 'right' && (
              <AdaptiveToolbar
                position={toolbarPosition}
                onPositionChange={setToolbarPosition}
                cardViewMode={cardViewMode}
                onCardViewModeChange={setCardViewMode}
                onToggleFilterSidebar={() => setFilterPanelCollapsed(!filterPanelCollapsed)}
                onShowUnscheduled={handleShowUnscheduled}
                unscheduledCount={sidebarEvents.length}
                onAddDefence={handleAddDefence}
                onGenerateSchedule={() => logger.debug('Generate schedule')}
                onReoptimize={() => logger.debug('Re-optimize')}
                onQuickSolve={(preset) => logger.debug('Quick solve:', preset)}
                onSolverSettings={() => logger.debug('Solver settings')}
                onImportData={() => logger.debug('Import data')}
                onExportResults={() => logger.debug('Export results')}
                onSaveSnapshot={() => {
                  persistNow();
                  showToast.success('Session saved');
                }}
                onLoadSnapshot={() => {
                  if (confirm('Clear current session and start fresh?')) {
                    clearPersistedState();
                    window.location.reload();
                  }
                }}
                onShowConflicts={() => setShowConflictsPanel(true)}
                onValidateSchedule={() => logger.debug('Validate schedule')}
                onViewStatistics={() => logger.debug('View statistics')}
                onExplainInfeasibility={() => logger.debug('Explain infeasibility')}
                onDeleteSelection={handleDeleteSelection}
                onDeleteAll={handleDeleteAll}
                onUnscheduleSelection={handleUnscheduleSelection}
                selectedCount={selectedEvents.size}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                rosters={rosters.map(r => ({ id: r.id, label: r.label }))}
                activeRosterId={activeRosterId}
                onRosterSelect={handleRosterSelect}
                onRosterDelete={handleRosterDelete}
                onRosterRename={handleRosterRename}
                onNewRoster={handleNewRoster}
              />
            )}

            <div className="flex-1 flex flex-col overflow-hidden">
              {toolbarPosition === 'top' && (
                <AdaptiveToolbar
                  position={toolbarPosition}
                  onPositionChange={setToolbarPosition}
                  cardViewMode={cardViewMode}
                  onCardViewModeChange={setCardViewMode}
                  onToggleFilterSidebar={() => setFilterPanelCollapsed(!filterPanelCollapsed)}
                  onShowUnscheduled={handleShowUnscheduled}
                  unscheduledCount={sidebarEvents.length}
                  onAddDefence={handleAddDefence}
                  onGenerateSchedule={() => logger.debug('Generate schedule')}
                  onReoptimize={() => logger.debug('Re-optimize')}
                  onQuickSolve={(preset) => logger.debug('Quick solve:', preset)}
                  onSolverSettings={() => logger.debug('Solver settings')}
                  onImportData={() => logger.debug('Import data')}
                  onExportResults={() => logger.debug('Export results')}
                  onSaveSnapshot={() => {
                    persistNow();
                    showToast.success('Session saved');
                  }}
                  onLoadSnapshot={() => {
                    if (confirm('Clear current session and start fresh?')) {
                      clearPersistedState();
                      window.location.reload();
                    }
                  }}
                  onShowConflicts={() => setShowConflictsPanel(true)}
                  onValidateSchedule={() => logger.debug('Validate schedule')}
                  onViewStatistics={() => logger.debug('View statistics')}
                  onExplainInfeasibility={() => logger.debug('Explain infeasibility')}
                  onDeleteSelection={handleDeleteSelection}
                  onDeleteAll={handleDeleteAll}
                  onUnscheduleSelection={handleUnscheduleSelection}
                  selectedCount={selectedEvents.size}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={undo}
                  onRedo={redo}
                  rosters={toolbarRosters}
                  activeRosterId={activeRosterId}
                  onRosterSelect={handleRosterSelect}
                  onRosterDelete={handleRosterDelete}
                  onRosterRename={handleRosterRename}
                  onNewRoster={handleNewRoster}
                />
              )}

              {renderScheduleGrid()}
            </div>
          </div>
        );

      case 'explain':
        return (
          <div className="flex-1 p-6 overflow-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Explanation & Conflicts</h2>
            {conflictSource.length > 0 ? (
              <div className="space-y-4">
                {conflictSource.map((conflict, idx) => (
                  <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <h3 className="font-semibold text-red-900">{conflict.type}</h3>
                        <p className="text-sm text-red-800 mt-1">{conflict.message || conflict.type}</p>
                        <p className="text-xs text-red-600 mt-2">
                          Affects: {conflict.affectedDefenceIds.join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No conflicts detected. MUS/MCS exploration will appear here when conflicts exist.</p>
            )}
          </div>
        );

      case 'export':
        return (
          <div className="flex-1 p-6 overflow-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Export Data</h2>
            <div className="space-y-4">
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Export Schedule as CSV
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Export Availability Matrix
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Export Constraint Logs
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-60 font-sans">
      <TabWorkflow tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'schedule' && (
          <FilterPanel
            isCollapsed={filterPanelCollapsed}
            onToggleCollapse={() => setFilterPanelCollapsed(!filterPanelCollapsed)}
            filters={filters}
            onFilterChange={setFilters}
            stats={stats}
            availableProgrammes={Array.from(new Set(events.map(e => e.programme)))}
            timeHorizon={schedulingContext.timeHorizon}
            onTimeHorizonChange={handleTimeHorizonChange}
            breadcrumbs={breadcrumbs}
            colorScheme={colorScheme}
            onColorChange={handleColorChange}
          />
        )}

        {renderTabContent()}

        {detailPanelOpen && (
          <DetailPanel
            isOpen={detailPanelOpen}
            onClose={() => {
              setDetailPanelOpen(false);
              setDetailEditable(false);
              setDetailPanelMode('detail');
            }}
            content={detailContent}
            positioning="relative"
            editable={detailEditable}
            onSave={handleSaveDefence}
            onEdit={() => setDetailEditable(true)}
            onDelete={handleDeleteDefence}
            onAction={(action, data) => {
              if (action === 'toggle-lock') {
                handleLockToggle(data);
                // update detail panel content to new lock state
                const event = events.find(e => e.id === data);
                if (event && detailContent?.type === 'defence') {
                  setDetailContent({
                    ...detailContent,
                    locked: !event.locked,
                  });
                }
              } else {
                logger.debug('Action:', action, data);
              }
            }}
            mode={detailPanelMode}
            unscheduledEvents={sidebarEvents}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCardClick={handleUnscheduledCardClick}
            onAddNew={handleAddNewUnscheduled}
            colorScheme={colorScheme}
            highlightedEventId={highlightedEventId}
            selectedEventId={selectedEvent || undefined}
          />
        )}
      </div>

      {/* Bottom panel with tabs */}
      <div className="relative">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white text-lg font-semibold px-4 py-2">
          <div className="flex">
            <button
              onClick={() => handleBottomPanelTabClick('availability')}
              className={`px-4 py-2 transition-colors ${
                bottomPanelTab === 'availability' && availabilityExpanded
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Availability
            </button>
            <button
              onClick={() => handleBottomPanelTabClick('objectives')}
              className={`px-4 py-2 transition-colors ${
                bottomPanelTab === 'objectives' && objectivesExpanded
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Objectives
            </button>
            <button
              onClick={() => handleBottomPanelTabClick('rooms')}
              className={`px-4 py-2 transition-colors ${
                bottomPanelTab === 'rooms'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Rooms
            </button>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <span className="font-semibold text-xl text-gray-800">Total defenses:</span>
            <div className="flex flex-col gap-2 min-w-[720px]">
              <div className="flex items-center justify-between text-xl font-semibold text-gray-500">
                <span>{scheduledEventsCount}/{events.length} scheduled</span>
              </div>
              <div className="relative flex h-4 overflow-hidden rounded-full border border-gray-200 bg-gray-100 shadow-inner">
                <div
                  className="h-full bg-blue-400 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(100, (scheduledEventsCount / Math.max(events.length, 1)) * 100)}%` }}
                />
                <div
                  className="h-full bg-gray-300 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(0, ((events.length - scheduledEventsCount) / Math.max(events.length, 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Availability Panel - keep mounted for instant switching */}
        <div style={{ display: bottomPanelTab === 'availability' ? 'block' : 'none' }}>
         <AvailabilityPanel
           availabilities={visibleAvailabilities}
           days={days}
           dayLabels={dayLabels}
           timeSlots={timeSlots}
            columnWidth={SCHEDULE_COLUMN_WIDTH}
            editable={true}
            onPersonClick={handleParticipantClick}
            onSlotClick={handleAvailabilitySlotClick}
            onSlotEdit={handleAvailabilitySlotEdit}
            onDayLockToggle={handleAvailabilityDayToggle}
            positioning="relative"
            isExpanded={availabilityExpanded}
            onToggleExpanded={() => setAvailabilityExpanded(!availabilityExpanded)}
            highlightedPersons={highlightedPersons}
            highlightedSlot={highlightedSlot || undefined}
            rosters={availabilityRosters}
            activeRosterId={activeRosterId}
            slotConflicts={personSlotConflictsMap}
            scheduledBookings={scheduledBookings}
            workloadStats={participantWorkload}
            columnHighlights={columnHighlights}
            roomAvailabilityRooms={roomAvailabilityRooms}
            roomDrawerSlot={highlightedSlot}
            sharedHeight={sharedPanelHeight}
            onHeightChange={handleSharedHeightChange}
          />
        </div>

        {/* Objectives Panel */}
        {bottomPanelTab === 'objectives' && (
          <ObjectivesPanel

            globalObjectives={globalObjectives}
            localObjectives={localObjectives}
            scheduleStats={{
              totalEvents: events.length,
              scheduledEvents: scheduledEventsCount,
            }}
            onGlobalObjectiveToggle={(id, enabled) => {
              setGlobalObjectives(prev =>
                prev.map(obj => obj.id === id ? { ...obj, enabled } : obj)
              );
            }}
            onGlobalObjectiveWeightChange={(id, weight) => {
              setGlobalObjectives(prev =>
                prev.map(obj => obj.id === id ? { ...obj, weight } : obj)
              );
            }}
            onLocalObjectiveRemove={(id) => {
              setLocalObjectives(prev => prev.filter(obj => obj.id !== id));
            }}
            onLocalObjectiveAdd={() => {
              logger.debug('Add local objective');
            }}
            isExpanded={objectivesExpanded}
            onToggleExpanded={() => setObjectivesExpanded(!objectivesExpanded)}
            positioning="relative"
            sharedHeight={sharedPanelHeight}
            onHeightChange={handleSharedHeightChange}
            graphMinHeight={760}
          />
        )}

        {bottomPanelTab === 'rooms' && (
          <RoomAvailabilityPanel
            rooms={roomAvailabilityRooms}
            days={days}
            timeSlots={timeSlots}
            isExpanded={roomsExpanded}
            sharedHeight={sharedPanelHeight}
            onHeightChange={handleSharedHeightChange}
          />
        )}


        {bottomPanelTab === 'conflicts' && (
          <ConflictsPanelV2
            isExpanded={conflictsExpanded}
            onToggleExpanded={() => setConflictsExpanded(prev => !prev)}
            sharedHeight={sharedPanelHeight}
            onHeightChange={handleSharedHeightChange}
          />
        )}
      </div>

      {showConflictsPanel && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="flex-1 bg-black/30"
            onClick={() => setShowConflictsPanel(false)}
            aria-label="Close conflicts panel"
          />
          <div className="w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto border-l border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Conflicts</p>
                <h3 className="text-lg font-semibold text-gray-900">
                  {currentState?.conflicts.length || 0} issue{(currentState?.conflicts.length || 0) === 1 ? '' : 's'}
                </h3>
              </div>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowConflictsPanel(false)}
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {(currentState?.conflicts.length || 0) === 0 && (
                <div className="p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
                  No conflicts detected.
                </div>
              )}

              {currentState?.conflicts.map(conflict => (
                <div
                  key={conflict.id}
                  className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">{conflict.type}</p>
                      <h4 className="font-semibold text-gray-900">{conflict.message}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Affects: {conflict.affectedDefenceIds.join(', ') || '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {conflict.day && conflict.timeSlot ? `${conflict.day} @ ${conflict.timeSlot}` : ''}
                        {conflict.room ? ` • Room ${conflict.room}` : ''}
                      </p>
                      {conflict.participants && conflict.participants.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          People: {conflict.participants.join(', ')}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        conflict.severity === 'error'
                          ? 'bg-red-100 text-red-700'
                          : conflict.severity === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {conflict.severity}
                    </span>
                  </div>

                  {conflict.suggestions && conflict.suggestions.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Suggestions</p>
                      {conflict.suggestions.map(suggestion => (
                        <button
                          key={suggestion.id}
                          className="w-full text-left px-3 py-2 rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-800"
                          onClick={() => handleApplySuggestion(suggestion)}
                        >
                          <span className="font-medium">{suggestion.label}</span>
                          {suggestion.description && (
                            <span className="block text-xs text-gray-600 mt-0.5">{suggestion.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ConflictsConstraintStatus = 'ok' | 'neutral' | 'conflict';
type ConflictsConstraintType =
  | 'room'
  | 'supervisor'
  | 'coSupervisor'
  | 'assessors'
  | 'mentor'
  | 'preferredDay';

interface ConflictsConstraintCell {
  type: ConflictsConstraintType;
  label: string;
  status: ConflictsConstraintStatus;
  reason?: string;
  conflictsWith?: string[];
}

interface ConflictsRepairAction {
  id: string;
  label: string;
  description: string;
  type: 'move' | 'swap' | 'capacity';
  impact: 'low' | 'medium' | 'high';
  preview?: string;
}

interface ConflictsDefenseRow {
  id: string;
  student: string;
  targetSlot: string;
  constraintSummary: string;
  constraints: ConflictsConstraintCell[];
  actions: ConflictsRepairAction[];
}

const conflictColumns: { type: ConflictsConstraintType; title: string }[] = [
  { type: 'room', title: 'Room' },
  { type: 'supervisor', title: 'Supervisor' },
  { type: 'coSupervisor', title: 'Co-supervisor' },
  { type: 'assessors', title: 'Assessors' },
  { type: 'mentor', title: 'Mentor' },
  { type: 'preferredDay', title: 'Day' },
];

const conflictStatusStyles: Record<ConflictsConstraintStatus, string> = {
  ok: 'bg-blue-500 border-blue-600',
  neutral: 'bg-gray-200 border-gray-300',
  conflict: 'bg-rose-500 border-rose-600 animate-pulse',
};

// Legacy ConflictsPanel - replaced by ConflictsPanelV2
// @ts-ignore - unused legacy code kept for reference
function ConflictsPanel_LEGACY({
  isExpanded,
  onToggleExpanded,
  sharedHeight,
  onHeightChange,
}: {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  sharedHeight?: number;
  onHeightChange?: (height: number) => void;
}) {
  const rows = useMockConflictRows();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ConflictsConstraintType | null>(null);
  const [pendingRepairs, setPendingRepairs] = useState<ConflictsRepairAction[]>([]);
  const [appliedRepairs, setAppliedRepairs] = useState<Set<string>>(new Set());
  const [panelHeight, setPanelHeight] = useState(sharedHeight ?? 520);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const currentDragHeight = useRef(0);
  const expandedRow = useMemo(
    () => rows.find(row => row.id === expandedRowId) || null,
    [rows, expandedRowId]
  );

  const highlightedRows = useMemo(() => {
    if (!selectedColumn) return new Set<string>();
    return new Set(
      rows
        .filter(row =>
          row.constraints.some(c => c.type === selectedColumn && c.status === 'conflict')
        )
        .map(r => r.id)
    );
  }, [rows, selectedColumn]);

  useEffect(() => {
    if (typeof sharedHeight === 'number' && sharedHeight > 0 && sharedHeight !== panelHeight) {
      setPanelHeight(sharedHeight);
    }
  }, [sharedHeight, panelHeight]);

  const handleAddRepair = (action: ConflictsRepairAction) => {
    if (pendingRepairs.some(r => r.id === action.id)) return;
    setPendingRepairs(prev => [...prev, action]);
  };

  const handleApplyRepair = (actionId: string) => {
    setAppliedRepairs(prev => {
      const next = new Set(prev);
      next.add(actionId);
      return next;
    });
    setPendingRepairs(prev => prev.filter(r => r.id !== actionId));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const newHeight = Math.max(220, Math.min(window.innerHeight * 0.8, dragStartHeight.current + deltaY));
      currentDragHeight.current = newHeight;
      if (panelRef.current) {
        panelRef.current.style.height = `${newHeight}px`;
      }
      onHeightChange?.(newHeight);
    };

    const handleMouseUp = () => {
      if (currentDragHeight.current > 0) {
        setPanelHeight(currentDragHeight.current);
        onHeightChange?.(currentDragHeight.current);
      }
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onHeightChange]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
    currentDragHeight.current = panelHeight;
  };

  return (
    <div
      ref={panelRef}
      className={`relative w-full bg-white border-t border-gray-200 shadow-inner ${isDragging ? '' : 'transition-all duration-300 ease-in-out'}`}
      style={{ height: isExpanded ? `${panelHeight}px` : '0px' }}
    >
      {isExpanded && (
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-100 active:bg-blue-200 flex items-center justify-center group"
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-3 w-3 text-gray-400 group-hover:text-blue-600" />
        </div>
      )}

      <div
        className="h-full pt-3 flex flex-col"
        style={{
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Conflicts</p>
            <h3 className="text-base font-semibold text-gray-900">
              {rows.length} unscheduled defenses
            </h3>
          </div>
          <button
            onClick={onToggleExpanded}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Defense
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Blocking reason
                </th>
                {conflictColumns.map(col => (
                  <th
                    key={col.type}
                    className={clsx(
                      'px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none',
                      selectedColumn === col.type && 'text-blue-600'
                    )}
                    onClick={() =>
                      setSelectedColumn(prev => (prev === col.type ? null : col.type))
                    }
                  >
                    {col.title}
                    {selectedColumn === col.type && (
                      <span className="ml-1 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        Filtered
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isSelected = expandedRow?.id === row.id;
                const isHighlighted = highlightedRows.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={clsx(
                        'border-b border-gray-100 hover:bg-blue-50 transition-colors',
                        isSelected && 'bg-blue-50',
                        isHighlighted && 'ring-1 ring-blue-200'
                      )}
                      onClick={() => {
                        setExpandedRowId(prev => (prev === row.id ? null : row.id));
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{row.student}</div>
                        <div className="text-[11px] uppercase text-rose-500 tracking-wide font-semibold">
                          Unscheduled
                        </div>
                        <div className="text-xs text-gray-500">{row.targetSlot}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.constraintSummary}</td>
                      {conflictColumns.map(col => {
                        const cell = row.constraints.find(c => c.type === col.type)!;
                        return (
                          <td key={col.type} className="px-3 py-2">
                            <button
                              className={clsx(
                                'w-6 h-6 rounded-full border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400',
                                conflictStatusStyles[cell.status]
                              )}
                              title={cell.reason || 'No issues'}
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedRowId(prev => (prev === row.id ? null : row.id));
                                setSelectedColumn(cell.type);
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {isSelected && expandedRow && (
                      <tr className="bg-white border-b border-gray-100">
                        <td colSpan={conflictColumns.length + 2} className="px-6 py-4">
                          <ConflictsRowDrawer
                            row={expandedRow}
                            onAddRepair={handleAddRepair}
                            selectedColumn={selectedColumn}
                            onCollapse={() => setExpandedRowId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="w-80 border-l border-gray-200 bg-gray-50 p-4 space-y-4">
          <ConflictsColumnTray column={selectedColumn} rows={rows} onAddRepair={handleAddRepair} />
        </div>
      </div>

        <ConflictsRepairQueueBar
          actions={pendingRepairs}
          appliedActions={appliedRepairs}
          onApply={handleApplyRepair}
        />
      </div>
    </div>
  );
}

function ConflictsRowDrawer({
  row,
  onAddRepair,
  selectedColumn,
  onCollapse,
}: {
  row: ConflictsDefenseRow;
  onAddRepair: (action: ConflictsRepairAction) => void;
  selectedColumn: ConflictsConstraintType | null;
  onCollapse: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Repair plan</p>
            <h4 className="text-base font-semibold text-gray-900">{row.student}</h4>
          </div>
          <button
            onClick={onCollapse}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Collapse
          </button>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Move this defense</p>
          <div className="space-y-2">
            {row.actions
              .filter(a => a.type !== 'capacity')
              .map(action => (
                <ConflictsActionCard key={action.id} action={action} onAdd={() => onAddRepair(action)} />
              ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Escalate capacity</p>
          <div className="space-y-2">
            {row.actions
              .filter(a => a.type === 'capacity')
              .map(action => (
                <ConflictsActionCard key={action.id} action={action} onAdd={() => onAddRepair(action)} />
              ))}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">Conflict details</p>
        <div className="space-y-2">
          {row.constraints
            .filter(c => c.status === 'conflict' && (!selectedColumn || c.type === selectedColumn))
            .map(c => (
              <div key={c.type} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                <p className="font-medium text-rose-800">{c.label}</p>
                <p className="text-rose-700 text-xs mt-1">{c.reason}</p>
                {c.conflictsWith && (
                  <p className="text-xs text-rose-600 mt-1">
                    Conflicts with {c.conflictsWith.join(', ')}
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function ConflictsColumnTray({
  column,
  rows,
  onAddRepair,
}: {
  column: ConflictsConstraintType | null;
  rows: ConflictsDefenseRow[];
  onAddRepair: (action: ConflictsRepairAction) => void;
}) {
  if (!column) {
    return (
      <div className="text-sm text-gray-500">
        Select a column to see resource load and suggested bulk fixes.
      </div>
    );
  }

  const columnLabel = conflictColumns.find(c => c.type === column)?.title ?? 'Constraint';
  const affectedRows = rows.filter(r =>
    r.constraints.some(c => c.type === column && c.status === 'conflict')
  );
  const mockActions = affectedRows.flatMap(r =>
    r.actions.filter(a => a.type !== 'capacity').slice(0, 1)
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Column filter</p>
        <h4 className="text-lg font-semibold text-gray-900">{columnLabel}</h4>
        <p className="text-xs text-gray-500">{affectedRows.length} defenses affected</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Suggested moves</p>
        <div className="space-y-2">
          {mockActions.map(action => (
            <ConflictsActionCard
              key={`${column}-${action.id}`}
              action={action}
              onAdd={() => onAddRepair(action)}
            />
          ))}
          {mockActions.length === 0 && (
            <p className="text-xs text-gray-500">No direct moves available. Consider capacity changes.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictsActionCard({ action, onAdd }: { action: ConflictsRepairAction; onAdd: () => void }) {
  const impactColors: Record<ConflictsRepairAction['impact'], string> = {
    low: 'text-emerald-700 bg-emerald-50 border border-emerald-200',
    medium: 'text-amber-700 bg-amber-50 border border-amber-200',
    high: 'text-rose-700 bg-rose-50 border border-rose-200',
  };

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{action.label}</p>
          <p className="text-xs text-gray-500">{action.description}</p>
        </div>
        <span
          className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase', impactColors[action.impact])}
        >
          {action.impact}
        </span>
      </div>
      {action.preview && (
        <p className="text-[11px] text-gray-500">Preview: {action.preview}</p>
      )}
      <div className="flex gap-2">
        <button className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
          Preview
        </button>
        <button
          onClick={onAdd}
          className="text-xs font-medium text-gray-700 hover:text-gray-900"
        >
          Add to queue
        </button>
      </div>
    </div>
  );
}

function ConflictsRepairQueueBar({
  actions,
  appliedActions,
  onApply,
}: {
  actions: ConflictsRepairAction[];
  appliedActions: Set<string>;
  onApply: (actionId: string) => void;
}) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Pending repairs ({actions.length})
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {actions.map(action => (
              <div
                key={action.id}
                className="px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700 flex items-center gap-2"
              >
                {action.label}
                <button
                  className="text-blue-600 hover:text-blue-800"
                  onClick={() => onApply(action.id)}
                >
                  Apply
                </button>
              </div>
            ))}
            {actions.length === 0 && (
              <span className="text-xs text-gray-500">
                Select a move or capacity change to build a plan.
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500">Applied actions: {appliedActions.size}</div>
      </div>
    </div>
  );
}

function useMockConflictRows(): ConflictsDefenseRow[] {
  return useMemo(
    () => [
      {
        id: 'def-01',
        student: 'Wu Hanlin',
        targetSlot: 'Target: Feb 24 · 15:00 · Room 5',
        constraintSummary: 'Room full + Joosen unavailable',
        constraints: [
          {
            type: 'room',
            label: 'Room 5',
            status: 'conflict',
            reason: 'Room 5 fully booked on Feb 24 afternoon',
            conflictsWith: ['def-141', 'def-122'],
          },
          {
            type: 'supervisor',
            label: 'Prof. Wouter Joosen',
            status: 'conflict',
            reason: 'Already supervising at 15:00',
          },
          { type: 'coSupervisor', label: 'Dr. Eddy Truyen', status: 'ok' },
          {
            type: 'assessors',
            label: 'Panel',
            status: 'neutral',
            reason: 'Flexible',
          },
          { type: 'mentor', label: 'Mentor TBD', status: 'neutral' },
          {
            type: 'preferredDay',
            label: 'Feb 24',
            status: 'conflict',
            reason: 'Student can only defend before 16:00',
          },
        ],
        actions: [
          {
            id: 'move-01',
            label: 'Move to Feb 25 · 10:00 · Room 5',
            description: 'Swap with defense_141 to free 15:00 slot',
            type: 'move',
            impact: 'low',
            preview: 'Adds 1 defense Feb 25 morning',
          },
          {
            id: 'move-02',
            label: 'Move to Feb 26 · 11:00 · Room 6',
            description: 'Next available slot with same panel',
            type: 'move',
            impact: 'medium',
            preview: 'Shifts defense_23 to 26th',
          },
          {
            id: 'capacity-01',
            label: 'Add Room 21 (Feb 24 afternoon)',
            description: 'Temporary room unlock',
            type: 'capacity',
            impact: 'medium',
          },
          {
            id: 'capacity-02',
            label: 'Extend Joosen availability to 15:00',
            description: 'Request extra slot from supervisor',
            type: 'capacity',
            impact: 'high',
          },
        ],
      },
      {
        id: 'def-02',
        student: 'Aïcha Sanogo',
        targetSlot: 'Target: Feb 25 · 13:00 · Room 5',
        constraintSummary: 'Evaluator limit exceeded',
        constraints: [
          { type: 'room', label: 'Room 5', status: 'neutral' },
          {
            type: 'supervisor',
            label: 'Prof. Joosen',
            status: 'conflict',
            reason: 'Max 3 defenses/day reached',
          },
          {
            type: 'coSupervisor',
            label: 'Dr. Anke',
            status: 'ok',
          },
          {
            type: 'assessors',
            label: 'Panel B',
            status: 'conflict',
            reason: 'Assessor overlap with defense_67',
          },
          { type: 'mentor', label: 'Mentor Li', status: 'neutral' },
          { type: 'preferredDay', label: 'Feb 25', status: 'ok' },
        ],
        actions: [
          {
            id: 'move-10',
            label: 'Swap with defense_67 (Feb 26 · 14:00)',
            description: 'Frees assessor slot',
            type: 'swap',
            impact: 'low',
            preview: 'Maintains panel availability',
          },
          {
            id: 'move-11',
            label: 'Move to Feb 27 · 09:00 · Room 8',
            description: 'Next free slot for panel B',
            type: 'move',
            impact: 'medium',
          },
          {
            id: 'capacity-10',
            label: 'Allow 4 defenses/day for Joosen',
            description: 'Temporary cap increase',
            type: 'capacity',
            impact: 'high',
          },
        ],
      },
      {
        id: 'def-03',
        student: 'Fatoumata Bah',
        targetSlot: 'Target: Feb 24 · 11:00 · Room 3',
        constraintSummary: 'Mentor unavailable before noon',
        constraints: [
          { type: 'room', label: 'Room 3', status: 'ok' },
          { type: 'supervisor', label: 'Dr. Maria', status: 'ok' },
          { type: 'coSupervisor', label: 'Dr. Elena', status: 'neutral' },
          {
            type: 'assessors',
            label: 'Panel D',
            status: 'ok',
          },
          {
            type: 'mentor',
            label: 'Mentor Kofi',
            status: 'conflict',
            reason: 'Not available before 12:00',
          },
          {
            type: 'preferredDay',
            label: 'Feb 24',
            status: 'ok',
          },
        ],
        actions: [
          {
            id: 'move-20',
            label: 'Move to Feb 24 · 13:00 · Room 3',
            description: 'Keeps same day and room',
            type: 'move',
            impact: 'low',
          },
          {
            id: 'capacity-20',
            label: 'Request mentor availability 11:00',
            description: 'Ask for exception',
            type: 'capacity',
            impact: 'medium',
          },
        ],
      },
    ],
    []
  );
}
