/**
 * Roster Dashboard -  dashboard for various scheduling use-cases
 *
 * v0.2.0 (02-11) - Added drag-and-drop, lock mechanism, history management
 */
import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
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
import { PersonAvailability } from '../availability/types';
import { GlobalObjective, LocalObjective } from '../../types/objectives';
import { DefenceEvent, ScheduleState, ScheduleAction } from '../../types/schedule';
import { Roster } from '../../types/roster';
import { useScheduleHistory } from '../../hooks/useScheduleHistory';
import { DraggableDefenceCard } from '../scheduler/DraggableDefenceCard';
import { DroppableTimeSlot } from '../scheduler/DroppableTimeSlot';
import { generateGridFromTimeHorizon } from '../../utils/gridGenerator';
import { generatePlaceholderAvailabilities } from '../../utils/availabilityGenerator';
import { loadProgrammeData } from '../../services/programmeDataLoader';
import { logger } from '../../utils/logger';
import { showToast } from '../../utils/toast';
import { detectEventConflicts } from '../../lib/availabilityLoader';
import { defaultDefenceCardTheme } from '../../config/cardStyles.config';

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
  const initialState: ScheduleState = {
    events: initialEvents,
    locks: new Map(),
    solverMetadata: null,
    conflicts: [],
  };

  const { currentState, canUndo, canRedo, push, undo, redo } = useScheduleHistory(initialState);

  // Roster management with global counter for proper naming
  const rosterCounterRef = useRef(1);
  const [rosters, setRosters] = useState<Roster[]>([
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
  ]);
  const [activeRosterId, setActiveRosterId] = useState('roster-1');

  const [activeTab, setActiveTab] = useState<string>('schedule');
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(true);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailContent, setDetailContent] = useState<DetailContent>(null);
  const [detailEditable, setDetailEditable] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [activeCardIndex, setActiveCardIndex] = useState<Record<string, number>>({});
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('individual');
  const [availabilities, setAvailabilities] = useState<PersonAvailability[]>(initialAvailabilities);
  const [availabilityExpanded, setAvailabilityExpanded] = useState(false);
  const [highlightedSlot, setHighlightedSlot] = useState<{ day: string; timeSlot: string } | null>(null);
  const [highlightedPersons, setHighlightedPersons] = useState<string[]>([]);
  const [toolbarPosition, setToolbarPosition] = useState<'top' | 'right'>('top');

  // Bottom panel state
  const [bottomPanelTab, setBottomPanelTab] = useState<'availability' | 'objectives'>('availability');
  const [objectivesExpanded, setObjectivesExpanded] = useState(false);

  // Objectives state
  const [globalObjectives, setGlobalObjectives] = useState<GlobalObjective[]>([
    { id: 'minimize-gaps', type: 'minimize-gaps', label: 'Minimize schedule gaps', description: 'Reduce idle time between defences', enabled: true, weight: 5 },
    { id: 'balance-workload', type: 'balance-workload', label: 'Balance workload', description: 'Distribute defences evenly across assessors', enabled: false, weight: 3 },
    { id: 'preference-satisfaction', type: 'preference-satisfaction', label: 'Satisfy preferences', description: 'Schedule in preferred time slots', enabled: true, weight: 7 },
  ]);
  const [localObjectives, setLocalObjectives] = useState<LocalObjective[]>([]);

  // Ref for schedule grid rows to enable scrolling to specific slots
  const timeSlotRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Grid structure derived from time horizon or props
  const [days, setDays] = useState<string[]>(propDays);
  const [dayLabels, setDayLabels] = useState<string[]>(propDayLabels || propDays);
  const [timeSlots, setTimeSlots] = useState<string[]>(propTimeSlots);
  const [gridSource] = useState<'props' | 'timehorizon'>(
    propDays.length > 0 && propTimeSlots.length > 0 ? 'props' : 'timehorizon'
  );
  const [horizonMergeEnabled, setHorizonMergeEnabled] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    status: {
      scheduled: true,
      unscheduled: true,
      withConflicts: false,
    },
    programmes: [],
    participantSearch: '',
  });

  // Scheduling context
  const [schedulingContext, setSchedulingContext] = useState<SchedulingContext>({
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
  });

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

  const events = currentState?.events || [];

  // Monitor drag and drop with pragmatic-dnd
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const dropTarget = location.current.dropTargets[0];
        if (!dropTarget) return;

        // Extract data from source (dragged card)
        const sourceData = source.data;
        invariant(sourceData.type === 'defence-card');
        invariant(typeof sourceData.eventId === 'string');

        const targetData = dropTarget.data;

        // Case 1: Reordering within same timeslot (dropped on another card)
        if (targetData.type === 'defence-card') {
          const sourceEvent = events.find(e => e.id === sourceData.eventId);
          const targetEvent = events.find(e => e.id === targetData.eventId);

          if (!sourceEvent || !targetEvent) return;

          // Check if dragging selected events
          const isMultiSelect = selectedEvents.has(sourceData.eventId);
          const eventsToMove = isMultiSelect ? Array.from(selectedEvents) : [sourceData.eventId];

          // Only reorder if they're in the same timeslot
          if (sourceEvent.day === targetEvent.day && sourceEvent.startTime === targetEvent.startTime) {
            const closestEdge = extractClosestEdge(targetData);

            // Get all events in this timeslot
            let cellEvents = events.filter(
              e => e.day === sourceEvent.day && e.startTime === sourceEvent.startTime
            );

            if (isMultiSelect) {
              // For multi-select, remove all selected events first
              const selectedSet = new Set(eventsToMove);
              const nonSelected = cellEvents.filter(e => !selectedSet.has(e.id));
              const selectedItems = cellEvents.filter(e => selectedSet.has(e.id));

              // Find target position
              const targetIndex = nonSelected.findIndex(e => e.id === targetEvent.id);
              if (targetIndex === -1) return;

              // Insert selected items at target position
              const insertIndex = closestEdge === 'bottom' ? targetIndex + 1 : targetIndex;
              const reorderedCellEvents = [
                ...nonSelected.slice(0, insertIndex),
                ...selectedItems,
                ...nonSelected.slice(insertIndex),
              ];

              // Update the full events array
              const cellEventsSet = new Set(reorderedCellEvents.map(e => e.id));
              const updatedEvents = [
                ...events.filter(e => !cellEventsSet.has(e.id)),
                ...reorderedCellEvents,
              ];

              push({
                type: 'manual-edit',
                timestamp: Date.now(),
                description: `Reordered ${eventsToMove.length} defences in ${sourceEvent.day} ${sourceEvent.startTime}`,
                data: { eventIds: eventsToMove, targetEventId: targetEvent.id },
              }, {
                ...currentState!,
                events: updatedEvents,
              });
            } else {
              // Single item reorder
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

              // Update the full events array
              const cellEventsSet = new Set(reorderedCellEvents.map(e => e.id));
              const updatedEvents = [
                ...events.filter(e => !cellEventsSet.has(e.id)),
                ...reorderedCellEvents,
              ];

              push({
                type: 'manual-edit',
                timestamp: Date.now(),
                description: `Reordered ${sourceEvent.student} in ${sourceEvent.day} ${sourceEvent.startTime}`,
                data: { sourceEventId: sourceEvent.id, targetEventId: targetEvent.id },
              }, {
                ...currentState!,
                events: updatedEvents,
              });
            }
          } else {
            // Different timeslots - treat as move to target's timeslot
            handleDrop(sourceData.eventId, targetEvent.day!, targetEvent.startTime!);
          }
          return;
        }

        // Case 2: Moving to a timeslot
        if (targetData.type === 'time-slot') {
          invariant(typeof targetData.day === 'string');
          invariant(typeof targetData.timeSlot === 'string');
          handleDrop(sourceData.eventId, targetData.day, targetData.timeSlot);
        }
      },
    });
  }, [currentState, events, selectedEvents, push]);

  // Handler for loading programme data
  const handleLoadProgrammeData = async (programmeId: string) => {
    const data = await loadProgrammeData(programmeId);
    if (data) {
      // Extract days and time slots efficiently in one pass
      const daySet = new Set<string>();
      const slotSet = new Set<string>();
      let minHour = 24;
      let maxHour = 0;

      data.events.forEach(event => {
        if (event.day) daySet.add(event.day);
        if (event.startTime) {
          slotSet.add(event.startTime);
          const hour = parseInt(event.startTime.split(':')[0]);
          if (hour < minHour) minHour = hour;
          if (hour > maxHour) maxHour = hour;
        }
      });

      // Sort once
      const sortedDays = Array.from(daySet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      // Use discovered hour range or defaults
      const startHour = minHour < 24 ? minHour : 8;
      const endHour = maxHour > 0 ? maxHour + 1 : 17;

      // Generate complete time slots
      const completeTimeSlots: string[] = [];
      for (let hour = startHour; hour <= endHour; hour++) {
        completeTimeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      }

      // Create day labels once
      const labels = sortedDays.map(day => {
        const date = new Date(day + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      });

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

      // Update global grid to match active roster
      setDays(sortedDays);
      setDayLabels(labels);
      setTimeSlots(completeTimeSlots);

      // Update current state and availabilities
      push({
        type: 'manual-edit',
        timestamp: Date.now(),
        description: `Loaded ${data.dataset.description}`,
        data: { programmeId, eventCount: data.events.length }
      }, updatedState);
      setAvailabilities(data.availabilities);

      // Update time horizon to match dataset
      if (sortedDays.length > 0) {
        setSchedulingContext(prev => ({
          ...prev,
          timeHorizon: {
            startDate: sortedDays[0],
            endDate: sortedDays[sortedDays.length - 1],
            startHour,
            endHour,
            excludeWeekends: prev.timeHorizon?.excludeWeekends ?? true,
          },
        }));
      }

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

  // Memoize booking map calculation to avoid recomputation
  const bookingMap = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();

    events.forEach(event => {
      // Defensive: skip events without required data
      if (!event || !event.day || !event.startTime || !event.id) return;

      const slotKey = `${event.day}_${event.startTime}`;

      // Collect all participants, filtering out nulls/undefined
      const participants: string[] = [];
      if (event.student) participants.push(event.student);
      if (event.supervisor) participants.push(event.supervisor);
      if (event.coSupervisor) participants.push(event.coSupervisor);
      if (event.assessors) participants.push(...event.assessors.filter(Boolean));
      if (event.mentors) participants.push(...event.mentors.filter(Boolean));

      participants.forEach(person => {
        if (!person) return; // Skip null/empty names

        if (!map.has(person)) {
          map.set(person, new Map());
        }
        const personSlots = map.get(person)!;
        if (!personSlots.has(slotKey)) {
          personSlots.set(slotKey, []);
        }
        personSlots.get(slotKey)!.push(event.id);
      });
    });

    return map;
  }, [events]);

  // Track previous booking map for change detection
  const prevBookingMapRef = useRef<Map<string, Map<string, string[]>>>();

  // Sync availability grid with schedule only when bookings actually change
  useEffect(() => {
    if (events.length === 0 || availabilities.length === 0) return;

    // Check if bookings actually changed
    const bookingsChanged = (() => {
      const prev = prevBookingMapRef.current;
      if (!prev || prev.size !== bookingMap.size) return true;

      for (const [person, slots] of bookingMap.entries()) {
        const prevSlots = prev.get(person);
        if (!prevSlots || prevSlots.size !== slots.size) return true;

        for (const [slotKey, eventIds] of slots.entries()) {
          const prevEventIds = prevSlots.get(slotKey);
          if (!prevEventIds ||
              prevEventIds.length !== eventIds.length ||
              !prevEventIds.every((id, i) => id === eventIds[i])) {
            return true;
          }
        }
      }
      return false;
    })();

    if (!bookingsChanged) return;
    prevBookingMapRef.current = bookingMap;

    // Reduced timeout for faster feedback (50ms -> 16ms, one frame)
    const timeoutId = setTimeout(() => {
      setAvailabilities(prevAvailabilities => {
        return prevAvailabilities.map(person => {
          const personSlots = bookingMap.get(person.name);
          const conflicts: Array<{ day: string; timeSlot: string; conflictingEvents: string[] }> = [];

          // Only update if this person has bookings or had bookings
          const hadBookings = Object.values(person.availability).some(daySlots =>
            Object.values(daySlots).some(slot =>
              typeof slot === 'object' && slot.status === 'booked'
            )
          );

          if (!personSlots && !hadBookings) {
            return person; // No changes for this person
          }

          const newAvailability = { ...person.availability };

          // Clear all previous 'booked' statuses
          for (const day in newAvailability) {
            for (const slot in newAvailability[day]) {
              const current = newAvailability[day][slot];
              if (typeof current === 'object' && current.status === 'booked') {
                newAvailability[day][slot] = { status: 'available', locked: current.locked };
              }
            }
          }

          // Set new 'booked' statuses and detect conflicts
          if (personSlots) {
            personSlots.forEach((eventIds, slotKey) => {
              const [day, slot] = slotKey.split('_');

              // Ensure day exists in availability
              if (!newAvailability[day]) {
                newAvailability[day] = {};
              }

              // Get or create slot - CRITICAL: always book the slot even if it didn't exist before
              const current = newAvailability[day][slot];
              const locked = typeof current === 'object' ? current.locked : false;
              newAvailability[day][slot] = { status: 'booked', locked };

              if (eventIds.length > 1) {
                conflicts.push({
                  day,
                  timeSlot: slot,
                  conflictingEvents: eventIds,
                });
              }
            });
          }

          return {
            ...person,
            availability: newAvailability,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
          };
        });
      });
    }, 16); // One frame at 60fps for near-instant updates

    return () => clearTimeout(timeoutId);
  }, [bookingMap, availabilities.length, events.length]);

  // Track previous roster sync values for deep change detection
  const prevRosterSyncRef = useRef<{
    currentState: ScheduleState | null;
    availabilities: PersonAvailability[];
    activeRosterId: string;
  }>();

  // Sync active roster state when currentState or availabilities change (debounced)
  useEffect(() => {
    if (!currentState || !activeRosterId) return;

    // Deep equality check for state changes
    const stateChanged = (() => {
      const prev = prevRosterSyncRef.current;
      if (!prev || prev.activeRosterId !== activeRosterId) return true;
      if (prev.currentState?.events.length !== currentState.events.length) return true;
      if (prev.availabilities.length !== availabilities.length) return true;

      // Check if events array actually changed (reference check is sufficient due to immutability)
      if (prev.currentState?.events !== currentState.events) return true;

      return false;
    })();

    if (!stateChanged) return;

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
      crumbs.push({ label: 'Thesis Defences' });
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
      // Use functional update to avoid stale closure and enable instant deselection
      setSelectedEvent(prev => {
        // Check if clicking the same event - deselect it
        if (prev === eventId) {
          setDetailPanelOpen(false);
          setDetailContent(null);
          setHighlightedPersons([]);
          setHighlightedSlot(null);
          return null;
        } else {
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
            setDetailPanelOpen(true);

            // Set highlighted persons and slot for availability panel scrolling
            const participantNames = getEventParticipants(event);
            const participantIds = availabilities
              .filter(p => participantNames.includes(p.name))
              .map(p => p.id);
            setHighlightedPersons(participantIds);

            // Set highlighted slot if defence is scheduled
            if (event.day && event.startTime) {
              setHighlightedSlot({ day: event.day, timeSlot: event.startTime });
            } else {
              setHighlightedSlot(null);
            }
          }
          return eventId;
        }
      });
    }
    onEventClick?.(eventId);
  }, [events, availabilities, onEventClick]);

  const handleParticipantClick = (personId: string) => {
    const person = availabilities.find(p => p.id === personId);
    if (person) {
      setDetailContent({
        type: 'participant',
        id: person.id,
        name: person.name,
        role: person.role,
      });
      setDetailPanelOpen(true);
    }
  };

  // Helper function to extract all participants from an event
  const getEventParticipants = (event: DefenceEvent): string[] => {
    const participants: string[] = [event.student, event.supervisor];
    if (event.coSupervisor) participants.push(event.coSupervisor);
    participants.push(...event.assessors);
    if (event.mentors) participants.push(...event.mentors);
    return participants;
  };

  // Update availability status based on schedule conflicts
  const updateAvailabilitiesFromSchedule = (events: DefenceEvent[]) => {
    // Create a map of person -> time slots where they're booked
    const bookingMap = new Map<string, Set<string>>();

    // First pass: collect all bookings
    events.forEach(event => {
      if (event.day && event.startTime) {
        const slotKey = `${event.day}_${event.startTime}`;
        const participants = getEventParticipants(event);

        participants.forEach(person => {
          if (!bookingMap.has(person)) {
            bookingMap.set(person, new Set());
          }
          bookingMap.get(person)!.add(slotKey);
        });
      }
    });

    // Update availabilities to reflect bookings
    const updatedAvailabilities = availabilities.map(person => {
      const newAvailability = { ...person.availability };
      const personBookings = bookingMap.get(person.name) || new Set();

      // Clear all previous 'booked' statuses
      Object.keys(newAvailability).forEach(day => {
        Object.keys(newAvailability[day]).forEach(slot => {
          const current = newAvailability[day][slot];
          if (typeof current === 'object' && current.status === 'booked') {
            newAvailability[day][slot] = { status: 'available', locked: current.locked };
          }
        });
      });

      // Set new 'booked' statuses
      personBookings.forEach(slotKey => {
        const [day, slot] = slotKey.split('_');
        if (newAvailability[day]?.[slot]) {
          const current = newAvailability[day][slot];
          const locked = typeof current === 'object' ? current.locked : false;
          newAvailability[day][slot] = { status: 'booked', locked };
        }
      });

      return {
        ...person,
        availability: newAvailability,
      };
    });

    setAvailabilities(updatedAvailabilities);
  };

  const handleDrop = async (eventId: string, day: string, timeSlot: string) => {
    if (!currentState) return;

    // If multiple events are selected and the dragged event is one of them, move all selected events
    const eventsToMove = selectedEvents.has(eventId)
      ? Array.from(selectedEvents)
      : [eventId];

    const updatedEvents = currentState.events.map(e => {
      if (eventsToMove.includes(e.id)) {
        return {
          ...e,
          day: day,
          startTime: timeSlot,
        };
      }
      return e;
    });

    // Update availability status immediately to reflect the schedule change
    updateAvailabilitiesFromSchedule(updatedEvents);

    // Validate with backend
    try {
      const response = await fetch('http://localhost:8000/api/schedule/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: updatedEvents }),
      });

      const result = await response.json();

      // Always update conflicts, even if empty (to clear previous conflicts)
      const conflicts = result.conflicts || [];
      const conflictIds = new Set(
        conflicts.flatMap((c: any) => c.affected_defence_ids || [])
      );

      const eventsWithConflicts = updatedEvents.map(event => ({
        ...event,
        conflicts: conflictIds.has(event.id)
          ? conflicts
              .filter((c: any) => c.affected_defence_ids?.includes(event.id))
              .map((c: any) => c.type)
          : [],
      }));

      const validatedState: ScheduleState = {
        ...currentState,
        events: eventsWithConflicts,
        conflicts: conflicts,
      };

      const action: ScheduleAction = {
        type: 'drag-defence',
        timestamp: Date.now(),
        description: eventsToMove.length > 1
          ? `Moved ${eventsToMove.length} defences to ${day} ${timeSlot}${conflicts.length > 0 ? ' - conflicts detected' : ''}`
          : `Moved defence ${eventId} to ${day} ${timeSlot}${conflicts.length > 0 ? ' - conflicts detected' : ''}`,
        data: { eventId, eventsToMove, newDay: day, newTimeSlot: timeSlot },
      };

      push(action, validatedState);
    } catch (error) {
      logger.error('Validation failed:', error);
      showToast.error('Failed to validate schedule. Please try again.');

      // Still push the state even if validation fails
      const action: ScheduleAction = {
        type: 'drag-defence',
        timestamp: Date.now(),
        description: eventsToMove.length > 1
          ? `Moved ${eventsToMove.length} defences to ${day} ${timeSlot}`
          : `Moved defence ${eventId} to ${day} ${timeSlot}`,
        data: { eventId, eventsToMove, newDay: day, newTimeSlot: timeSlot },
      };

      const newState: ScheduleState = {
        ...currentState,
        events: updatedEvents,
      };

      push(action, newState);
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
      description: `Toggled lock for defence ${eventId}`,
      data: { eventId },
    };

    push(action, {
      ...currentState,
      events: updatedEvents,
    });
  }, [currentState, push]);

  const handleAvailabilitySlotClick = (personId: string, day: string, timeSlot: string) => {
    // Set highlighted slot
    setHighlightedSlot({ day, timeSlot });

    // Clear highlight after 3 seconds
    setTimeout(() => setHighlightedSlot(null), 3000);

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
        const participants = [event.student, event.supervisor];
        if (event.coSupervisor) participants.push(event.coSupervisor);
        participants.push(...event.assessors);
        if (event.mentors) participants.push(...event.mentors);

        const person = availabilities.find(p => p.id === personId);
        return person && participants.includes(person.name);
      });

      if (eventIndex !== -1) {
        setActiveCardIndex(prev => ({
          ...prev,
          [cellKey]: eventIndex,
        }));
      }
    }
  };

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

  const handleDeleteSelection = () => {
    if (!currentState || selectedEvents.size === 0) return;

    const remainingEvents = currentState.events.filter(e => !selectedEvents.has(e.id));
    const deletedIds = Array.from(selectedEvents);

    const action: ScheduleAction = {
      type: 'manual-edit',
      timestamp: Date.now(),
      description: `Deleted ${deletedIds.length} defence(s)`,
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
      description: 'Deleted all defences',
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
      description: `Deleted defence ${defenceId}`,
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
      title: 'New Defence',
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
      description: existingIndex >= 0 ? `Updated defence ${defenceEvent.id}` : `Added new defence`,
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

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const isScheduled = event.startTime && event.endTime;
      if (!filters.status.scheduled && isScheduled) return false;
      if (!filters.status.unscheduled && !isScheduled) return false;
      if (!filters.programmes.includes(event.programme)) return false;
      if (filters.participantSearch) {
        const search = filters.participantSearch.toLowerCase();
        const searchableText = [
          event.student,
          event.supervisor,
          event.coSupervisor || '',
          ...event.assessors,
          ...event.mentors,
        ].join(' ').toLowerCase();
        if (!searchableText.includes(search)) return false;
      }
      return true;
    });
  }, [events, filters]);

  const stats = useMemo(() => ({
    total: events.length,
    scheduled: events.filter(e => e.startTime && e.endTime).length,
    unscheduled: events.filter(e => !e.startTime || !e.endTime).length,
    conflicts: currentState?.conflicts.length || 0,
  }), [events, currentState?.conflicts]);

  // Map rosters to availability roster format for multi-roster view
  const availabilityRosters = useMemo<RosterInfo[]>(() => {
    return rosters.map(roster => ({
      id: roster.id,
      label: roster.label,
      availabilities: roster.availabilities,
    }));
  }, [rosters]);

  // Memoize roster list for toolbar to prevent unnecessary re-renders
  const toolbarRosters = useMemo(() => rosters.map(r => ({ id: r.id, label: r.label })), [rosters]);

  const getCellKey = (day: string, time: string) => `${day}-${time}`;

  const eventsByCell = useMemo(() => {
    const map = new Map<string, DefenceEvent[]>();
    filteredEvents.forEach(event => {
      if (event.day && event.startTime) {
        const key = getCellKey(event.day, event.startTime);
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(event);
      }
    });
    return map;
  }, [filteredEvents]);

  const getEventsForCell = (day: string, time: string) => {
    return eventsByCell.get(getCellKey(day, time)) || [];
  };

  const getActiveIndex = (day: string, time: string) => {
    const key = getCellKey(day, time);
    return activeCardIndex[key] || 0;
  };

  const colorScheme: Record<string, string> = {
    TI: '#6bc7eeff',
    CS: '#658fc0ff',
  };

  const renderScheduleGrid = () => {
    // Show message only if no grid structure exists
    if (days.length === 0 || timeSlots.length === 0) {
      return (
        <div className="flex-1 p-6 overflow-auto bg-gray-50">
          <div className="max-w-4xl mx-auto text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">No schedule grid configured</p>
            <p className="text-sm">Configure the time horizon in the Setup tab to create a schedule grid.</p>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex-1 overflow-auto">
          <div className="w-full border rounded-lg bg-white">
            {/* Grid */}
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 border-r-2 border-r-gray-300 p-3 text-left font-semibold sticky left-0 z-10 bg-gray-100">
                      Time / Day
                    </th>
                    {days.map((day, idx) => (
                      <th
                        key={day}
                        className="border border-gray-200 p-3 text-center font-semibold min-w-[200px]"
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
                      <td className="border border-gray-200 border-r-2 border-r-gray-300 p-3 font-medium sticky left-0 z-10 bg-gray-50">
                        {time}
                      </td>
                      {days.map((day) => {
                        const cellEvents = getEventsForCell(day, time);
                        const activeIndex = getActiveIndex(day, time);
                        const hasMultipleEvents = cellEvents.length > 1;
                        const cellId = getCellKey(day, time);
                        const isHighlighted = highlightedSlot?.day === day && highlightedSlot?.timeSlot === time;

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
                            className={isHighlighted ? 'bg-blue-50' : ''}
                            onAddEvent={handleAddDefence}
                          >
                            {cellEvents.length > 0 && cardViewMode === 'individual' && (
                              <div className="relative min-h-[120px]">
                                <div className="relative">
                                  {cellEvents.map((event, idx) => {
                                    const isActive = idx === activeIndex;
                                    const stackOffset = hasMultipleEvents ? Math.min(idx, 3) * 4 : 0;
                                    const zIndex = isActive ? 20 : 10 - idx;

                                    return (
                                      <DraggableDefenceCard
                                        key={event.id}
                                        event={event}
                                        isActive={isActive}
                                        isSelected={selectedEvent === event.id || selectedEvents.has(event.id)}
                                        stackOffset={stackOffset}
                                        zIndex={zIndex}
                                        colorScheme={colorScheme}
                                        cardStyle={{
                                          width: '100%',
                                          minHeight: '64px',
                                          padding: '10px',
                                          fontSize: 'text-xs',
                                          showFullDetails: false,
                                        }}
                                        theme={defaultDefenceCardTheme}
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
                                {cellEvents.map((event) => (
                                  <DraggableDefenceCard
                                    key={event.id}
                                    event={event}
                                    isActive={true}
                                    isSelected={selectedEvent === event.id || selectedEvents.has(event.id)}
                                    stackOffset={0}
                                    zIndex={10}
                                    colorScheme={colorScheme}
                                    cardStyle={{
                                      width: '100%',
                                      minHeight: '42px',
                                      padding: '6px 8px',
                                      fontSize: 'text-xs',
                                      showFullDetails: false,
                                    }}
                                    theme={defaultDefenceCardTheme}
                                    onClick={(e) => {
                                      const multiSelect = e.ctrlKey || e.metaKey;
                                      handleEventClick(event.id, multiSelect);
                                    }}
                                    onLockToggle={() => handleLockToggle(event.id)}
                                    compact={true}
                                  />
                                ))}
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
                onAddDefence={handleAddDefence}
                onGenerateSchedule={() => logger.debug('Generate schedule')}
                onReoptimize={() => logger.debug('Re-optimize')}
                onQuickSolve={(preset) => logger.debug('Quick solve:', preset)}
                onSolverSettings={() => logger.debug('Solver settings')}
                onImportData={() => logger.debug('Import data')}
                onExportResults={() => logger.debug('Export results')}
                onSaveSnapshot={() => logger.debug('Save snapshot')}
                onLoadSnapshot={() => logger.debug('Load snapshot')}
                onShowConflicts={() => logger.debug('Show conflicts')}
                onValidateSchedule={() => logger.debug('Validate schedule')}
                onViewStatistics={() => logger.debug('View statistics')}
                onExplainInfeasibility={() => logger.debug('Explain infeasibility')}
                onDeleteSelection={handleDeleteSelection}
                onDeleteAll={handleDeleteAll}
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
                  onAddDefence={handleAddDefence}
                  onGenerateSchedule={() => logger.debug('Generate schedule')}
                  onReoptimize={() => logger.debug('Re-optimize')}
                  onQuickSolve={(preset) => logger.debug('Quick solve:', preset)}
                  onSolverSettings={() => logger.debug('Solver settings')}
                  onImportData={() => logger.debug('Import data')}
                  onExportResults={() => logger.debug('Export results')}
                  onSaveSnapshot={() => logger.debug('Save snapshot')}
                  onLoadSnapshot={() => logger.debug('Load snapshot')}
                  onShowConflicts={() => logger.debug('Show conflicts')}
                  onValidateSchedule={() => logger.debug('Validate schedule')}
                  onViewStatistics={() => logger.debug('View statistics')}
                  onExplainInfeasibility={() => logger.debug('Explain infeasibility')}
                  onDeleteSelection={handleDeleteSelection}
                  onDeleteAll={handleDeleteAll}
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
            {currentState && currentState.conflicts.length > 0 ? (
              <div className="space-y-4">
                {currentState.conflicts.map((conflict, idx) => (
                  <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <h3 className="font-semibold text-red-900">{conflict.type}</h3>
                        <p className="text-sm text-red-800 mt-1">{conflict.description}</p>
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
          />
        )}

        {renderTabContent()}

        {detailPanelOpen && (
          <DetailPanel
            isOpen={detailPanelOpen}
            onClose={() => {
              setDetailPanelOpen(false);
              setDetailEditable(false);
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
          />
        )}
      </div>

      {/* Bottom panel with tabs */}
      <div className="relative">
        {/* Tab bar */}
        <div className="flex border-t border-gray-200 bg-white">
          <button
            onClick={() => {
              setBottomPanelTab('availability');
              setAvailabilityExpanded(!availabilityExpanded);
              setObjectivesExpanded(false);
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              bottomPanelTab === 'availability' && availabilityExpanded
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Availability
          </button>
          <button
            onClick={() => {
              setBottomPanelTab('objectives');
              setObjectivesExpanded(!objectivesExpanded);
              setAvailabilityExpanded(false);
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              bottomPanelTab === 'objectives' && objectivesExpanded
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Objectives
          </button>
        </div>

        {/* Availability Panel - keep mounted for instant switching */}
        <div style={{ display: bottomPanelTab === 'availability' ? 'block' : 'none' }}>
          <AvailabilityPanel
            availabilities={availabilities}
            days={days}
            dayLabels={dayLabels}
            timeSlots={timeSlots}
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
          />
        </div>

        {/* Objectives Panel */}
        {bottomPanelTab === 'objectives' && (
          <ObjectivesPanel
            globalObjectives={globalObjectives}
            localObjectives={localObjectives}
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
          />
        )}
      </div>
    </div>
  );
}
