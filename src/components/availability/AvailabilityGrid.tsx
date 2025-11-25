/**
 * availability Grid - shows person x time availability matrix
 * test and verify slot-level markers and day-level gradient?? views with inline editing??
 * WIP v0.2.0 (1-11)
 */
import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { AlertCircle, Lock, Check } from 'lucide-react';
import { PersonAvailability, ViewGranularity, AvailabilityStatus, SlotAvailability } from './types';

export interface RosterInfo {
  id: string;
  label: string;
  availabilities: PersonAvailability[];
}

export interface AvailabilityGridProps {
  availabilities: PersonAvailability[];
  days: string[];
  dayLabels?: string[];
  timeSlots: string[];
  granularity: ViewGranularity;
  editable?: boolean;
  onPersonClick?: (personId: string) => void;
  onSlotClick?: (personId: string, day: string, timeSlot: string) => void;
  onSlotEdit?: (personId: string, day: string, timeSlot: string, newStatus: AvailabilityStatus, locked: boolean) => void;
  onDayLockToggle?: (personId: string, day: string, locked: boolean) => void;
  highlightedPersons?: string[];
  highlightedSlot?: { day: string; timeSlot: string };
  onGranularityChange?: (granularity: ViewGranularity) => void;
  roleFilter?: string;
  onRoleFilterChange?: (role: string) => void;
  // Multi-roster support for daily view
  rosters?: RosterInfo[];
  activeRosterId?: string;
}

const statusOrder: AvailabilityStatus[] = ['available', 'unavailable', 'booked', 'empty'];

const statusColors: Record<AvailabilityStatus, string> = {
  available: '#55cc86ff',      // green
  unavailable: '#b12020ff',    // red
  booked: '#3B82F6',           // blue
  empty: '#9CA3AF',            // grey
};

const statusLabels: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  booked: 'Booked',
  empty: 'Not Set',
};

export const AvailabilityGrid = memo(function AvailabilityGrid({
  availabilities,
  days,
  dayLabels,
  timeSlots,
  granularity,
  editable = false,
  onPersonClick,
  onSlotClick,
  onSlotEdit,
  onDayLockToggle,
  highlightedPersons = [],
  highlightedSlot,
  onGranularityChange,
  roleFilter,
  onRoleFilterChange,
  rosters = [],
  activeRosterId,
}: AvailabilityGridProps) {
  const [editingSlot, setEditingSlot] = useState<{ personId: string; day: string; slot: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const personRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  //  dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Only close if clicking outside the dropdown
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        // Check if we're clicking on another slot marker (which will open a new dropdown)
        const clickedSlot = (target as HTMLElement).closest('[data-slot-marker]');
        if (!clickedSlot) {
          setEditingSlot(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Scroll to highlighted persons
  useEffect(() => {
    if (highlightedPersons.length > 0) {
      const firstPersonId = highlightedPersons[0];
      const rowElement = personRowRefs.current.get(firstPersonId);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [highlightedPersons]);

  const getSlotData = (person: PersonAvailability, day: string, slot: string): SlotAvailability => {
    const data = person.availability[day]?.[slot];
    if (!data) return { status: 'empty', locked: false };
    if (typeof data === 'string') return { status: data, locked: false };
    return data;
  };

  // Get slot data from a specific roster's availability
  const getSlotDataFromRoster = (rosterId: string, personName: string, day: string, slot: string): SlotAvailability => {
    const roster = rosters.find(r => r.id === rosterId);
    if (!roster) return { status: 'empty', locked: false };

    const person = roster.availabilities.find(p => p.name === personName);
    if (!person) return { status: 'empty', locked: false };

    return getSlotData(person, day, slot);
  };


  const hasConflict = (person: PersonAvailability, day: string, slot?: string): boolean => {
    if (!person.conflicts) return false;
    return person.conflicts.some(
      c => c.day === day && (slot === undefined || c.timeSlot === slot)
    );
  };

  const isDayLocked = (person: PersonAvailability, day: string): boolean => {
    return person.dayLocks?.[day] || false;
  };

  // Merge and sort participants across all rosters intelligently
  const sortedAvailabilities = useMemo(() => {
    const isMultiRoster = rosters && rosters.length > 1;

    if (!isMultiRoster) {
      // Single roster: simple sort with highlights first
      return [...availabilities].sort((a, b) => {
        const aHighlighted = highlightedPersons.includes(a.id);
        const bHighlighted = highlightedPersons.includes(b.id);

        if (aHighlighted && !bHighlighted) return -1;
        if (!aHighlighted && bHighlighted) return 1;

        return a.name.localeCompare(b.name);
      });
    }

    // Multi-roster: merge participants and sort by overlap count
    const personMap = new Map<string, { person: PersonAvailability; rosterCount: number }>();

    // Count how many rosters each person appears in
    rosters.forEach(roster => {
      roster.availabilities.forEach(person => {
        const existing = personMap.get(person.name);
        if (existing) {
          existing.rosterCount += 1;
        } else {
          personMap.set(person.name, { person, rosterCount: 1 });
        }
      });
    });

    // Convert to array and sort
    return Array.from(personMap.values())
      .sort((a, b) => {
        // Highlighted persons first
        const aHighlighted = highlightedPersons.includes(a.person.id);
        const bHighlighted = highlightedPersons.includes(b.person.id);

        if (aHighlighted && !bHighlighted) return -1;
        if (!aHighlighted && bHighlighted) return 1;

        // Then by roster count (people in more rosters first - they're the constraints)
        if (a.rosterCount !== b.rosterCount) {
          return b.rosterCount - a.rosterCount;
        }

        // Finally alphabetically
        return a.person.name.localeCompare(b.person.name);
      })
      .map(item => item.person);
  }, [availabilities, highlightedPersons, rosters?.length]);

  return (
    <div className="w-full h-full overflow-auto" style={{ contain: 'layout paint' }}>
      <table className="border-collapse" style={{ minWidth: '100%' }}>
        <thead className="sticky top-0 z-30">
          <tr className="bg-gray-50">
            <th className="border p-2 sm:p-3 text-left text-sm sm:text-base font-semibold text-gray-700 sticky left-0 bg-gray-50 z-40 w-[180px] shadow-sm">
              <div className="flex items-center gap-2">
                <span>Person</span>
                <span className="text-xs font-normal text-gray-500">({availabilities.length})</span>
              </div>
            </th>
            {days.map((day, idx) => (
              <th
                key={day}
                className="border p-2 sm:p-3 text-center text-sm sm:text-base font-semibold text-gray-700"
                style={{
                  minWidth: granularity === 'slot'
                    ? `${timeSlots.length * 36 + 24}px`
                    : '120px',
                  width: granularity === 'slot'
                    ? `${timeSlots.length * 36 + 24}px`
                    : '120px'
                }}
              >
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm md:text-base">
                    {dayLabels?.[idx] || day}
                    {granularity === 'slot' && (
                      <span className="text-[10px] sm:text-xs font-normal text-gray-500"> ({timeSlots.length})</span>
                    )}
                  </span>
                  {granularity === 'slot' && (
                    <div className="flex gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-normal text-gray-600">
                      {timeSlots.map((slot) => (
                        <div key={slot} className="w-8 sm:w-9 text-center flex-shrink-0">
                          {slot}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedAvailabilities.map((person) => {
            const isHighlighted = highlightedPersons.includes(person.id);
            return (
            <tr
              key={person.id}
              ref={(el) => {
                if (el) {
                  personRowRefs.current.set(person.id, el);
                } else {
                  personRowRefs.current.delete(person.id);
                }
              }}
              className={`hover:bg-gray-50 transition-colors ${isHighlighted ? 'bg-blue-50' : ''}`}
            >
              <td
                className={`border p-2 sm:p-3 sticky left-0 z-20 cursor-pointer hover:bg-blue-50 shadow-sm ${isHighlighted ? 'bg-blue-50' : 'bg-white'}`}
                onClick={() => onPersonClick?.(person.id)}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-xs sm:text-sm md:text-base truncate">{person.name}</div>
                    <div className="text-[10px] sm:text-xs text-gray-500 capitalize">{person.role}</div>
                  </div>
                  {person.conflicts && person.conflicts.length > 0 && (
                    <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-500 flex-shrink-0" />
                  )}
                </div>
              </td>

              {days.map((day) => {
                const dayLocked = isDayLocked(person, day);
                return (
                <td
                  key={`${person.id}-${day}`}
                  className="border p-1.5 sm:p-2 align-middle relative group"
                  style={{ backgroundColor: dayLocked ? 'rgba(0, 0, 0, 0.03)' : undefined }}
                  onDoubleClick={() => {
                    if (editable) {
                      onDayLockToggle?.(person.id, day, !dayLocked);
                    }
                  }}
                  title={editable ? 'Double-click to lock/unlock entire day' : undefined}
                >
                  {/*  lock icon style info */}
                  {dayLocked && (
                    <Lock className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 h-3 w-3 sm:h-4 sm:w-4 text-gray-500 z-10" strokeWidth={2} />
                  )}

                  {granularity === 'slot' ? (
                    // slot-level view: individual
                    <div className="flex gap-1 sm:gap-1.5 justify-center overflow-visible">
                      {timeSlots.map((slot) => {
                        const slotData = getSlotData(person, day, slot);
                        const conflict = hasConflict(person, day, slot);
                        const isEditing = editingSlot?.personId === person.id &&
                                        editingSlot?.day === day &&
                                        editingSlot?.slot === slot;
                        const isHighlightedSlot = highlightedSlot?.day === day && highlightedSlot?.timeSlot === slot && isHighlighted;

                        return (
                          <div
                            key={slot}
                            data-slot-marker="true"
                            className="relative cursor-pointer hover:scale-110 active:scale-95 transition-transform touch-manipulation flex items-center justify-center w-8 sm:w-9 flex-shrink-0"
                            style={{ zIndex: isEditing ? 100 : 1 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (editable) {
                                setEditingSlot({ personId: person.id, day, slot });
                              }
                              onSlotClick?.(person.id, day, slot);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (editable) {
                                onSlotEdit?.(person.id, day, slot, slotData.status, !slotData.locked);
                                setEditingSlot(null);
                              }
                            }}
                            title={editable ? 'Click to edit, double-click to lock/unlock' : `${slot}: ${statusLabels[slotData.status]}${slotData.locked ? ' (LOCKED)' : ''}${conflict ? ' (CONFLICT)' : ''}`}
                          >
                            <div
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg shadow-sm flex items-center justify-center ${
                                isHighlightedSlot
                                  ? 'border-2 border-gray-700'
                                  : 'border-2 border-white'
                              }`}
                              style={{
                                backgroundColor: statusColors[slotData.status],
                                opacity: slotData.status === 'unavailable' ? 0.5 : 1,
                              }}
                            >
                              {slotData.locked && !dayLocked && (
                                <Lock className="h-2 w-2 sm:h-3 sm:w-3 text-white drop-shadow-md" strokeWidth={2.5} />
                              )}
                            </div>
                            {conflict && (
                              <AlertCircle className="absolute top-0 right-0 h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-600 bg-white rounded-full" strokeWidth={3} />
                            )}

                            {/* Edit dropdown */}
                            {isEditing && editable && (
                              <div
                                ref={dropdownRef}
                                className="absolute top-8 left-1/2 -translate-x-1/2 bg-white border border-gray-300 rounded-lg shadow-2xl min-w-[180px] p-2"
                                style={{ zIndex: 1000 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="text-xs font-semibold text-gray-700 mb-2 px-2">{slot}</div>
                                {statusOrder.map((status) => (
                                  <button
                                    key={status}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors ${
                                      slotData.status === status ? 'bg-gray-50' : ''
                                    }`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      // If clicking the current status, reset to 'empty', otherwise set to new status
                                      const newStatus = slotData.status === status ? 'empty' : status;
                                      onSlotEdit?.(person.id, day, slot, newStatus, slotData.locked || false);
                                      setEditingSlot(null);
                                    }}
                                  >
                                    <div
                                      className="w-4 h-4 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: statusColors[status] }}
                                    />
                                    <span className="text-sm text-gray-900">{statusLabels[status]}</span>
                                    {slotData.status === status && (
                                      <Check className="h-4 w-4 ml-auto text-green-600" />
                                    )}
                                  </button>
                                ))}
                                <div className="border-t border-gray-200 my-2" />
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSlotEdit?.(person.id, day, slot, slotData.status, !slotData.locked);
                                    setEditingSlot(null);
                                  }}
                                >
                                  <Lock className={`h-4 w-4 flex-shrink-0 ${slotData.locked ? 'text-gray-700' : 'text-gray-400'}`} />
                                  <span className="text-sm text-gray-900">
                                    {slotData.locked ? 'Unlock' : 'Lock'} preference
                                  </span>
                                  {slotData.locked && (
                                    <Check className="h-4 w-4 ml-auto text-green-600" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : rosters.length > 1 ? (
                    // Multi-roster daily view: stacked rows for each roster
                    <div className="flex flex-col gap-1.5">
                      {rosters.map((roster) => {
                        const isActiveRoster = roster.id === activeRosterId;
                        return (
                          <div
                            key={roster.id}
                            className={`relative h-12 rounded flex gap-0.5 overflow-hidden ${
                              isActiveRoster
                                ? 'border-2 border-blue-500 shadow-sm bg-blue-50/20'
                                : 'border border-gray-200'
                            }`}
                            style={{
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {timeSlots.map((slot) => {
                              const slotData = getSlotDataFromRoster(roster.id, person.name, day, slot);
                              return (
                                <div
                                  key={slot}
                                  className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity relative"
                                  style={{
                                    backgroundColor: statusColors[slotData.status],
                                    opacity: slotData.status === 'unavailable' ? 0.5 : 1,
                                  }}
                                  title={`${roster.label} - ${slot}: ${statusLabels[slotData.status]}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSlotClick?.(person.id, day, slot);
                                  }}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Single roster daily view: vertical bars for each slot
                    <div className="relative h-16 rounded flex gap-0.5 overflow-hidden">
                      {timeSlots.map((slot) => {
                        const slotData = getSlotData(person, day, slot);
                        const conflict = hasConflict(person, day, slot);
                        return (
                          <div
                            key={slot}
                            className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity relative"
                            style={{
                              backgroundColor: statusColors[slotData.status],
                              opacity: slotData.status === 'unavailable' ? 0.5 : 1,
                              outline: conflict ? '2px solid #dc2626' : 'none',
                              outlineOffset: '-2px',
                            }}
                            title={`${slot}: ${statusLabels[slotData.status]}${conflict ? ' (CONFLICT)' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSlotClick?.(person.id, day, slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </td>
              );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t p-2 sm:p-3 mt-2 sm:mt-4 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:gap-6 text-xs sm:text-sm">
          <span className="font-semibold text-gray-700 hidden sm:inline">Legend:</span>
          {(Object.keys(statusColors) as AvailabilityStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-gray-300 flex-shrink-0"
                style={{ backgroundColor: statusColors[status] }}
              />
              <span className="text-gray-700 capitalize whitespace-nowrap">{statusLabels[status]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0">
              <Lock className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-gray-700 whitespace-nowrap">Locked</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-500 flex-shrink-0" />
            <span className="text-gray-700 whitespace-nowrap">Conflict</span>
          </div>

          {/* View and Role filters */}
          {onGranularityChange && (
            <>
              <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">View:</label>
                <select
                  value={granularity}
                  onChange={(e) => onGranularityChange(e.target.value as ViewGranularity)}
                  className="px-3 py-1 text-sm border rounded bg-white min-w-[120px]"
                >
                  <option value="slot">Time Slots</option>
                  <option value="day">Daily</option>
                </select>
              </div>
            </>
          )}

          {onRoleFilterChange && roleFilter !== undefined && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Role:</label>
              <select
                value={roleFilter}
                onChange={(e) => onRoleFilterChange(e.target.value)}
                className="px-3 py-1 text-sm border rounded bg-white min-w-[120px]"
              >
                <option value="all">All</option>
                <option value="student">Students</option>
                <option value="supervisor">Supervisors</option>
                <option value="assessor">Assessors</option>
                <option value="mentor">Mentors</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
