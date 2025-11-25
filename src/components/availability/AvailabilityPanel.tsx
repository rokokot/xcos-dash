/**
 * panel v1 showing grid of timeslots with color status indicators
 * WIP v0.2.0 (29-10)
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { GripHorizontal } from 'lucide-react';
import { AvailabilityGrid, RosterInfo } from './AvailabilityGrid';
import { PersonAvailability, ViewGranularity, PersonRole, AvailabilityStatus } from './types';

export interface AvailabilityPanelProps {
  availabilities: PersonAvailability[];
  days: string[];
  dayLabels?: string[];
  timeSlots: string[];
  editable?: boolean;
  onPersonClick?: (personId: string) => void;
  onSlotClick?: (personId: string, day: string, timeSlot: string) => void;
  onSlotEdit?: (personId: string, day: string, timeSlot: string, newStatus: AvailabilityStatus, locked: boolean) => void;
  onDayLockToggle?: (personId: string, day: string, locked: boolean) => void;
  positioning?: 'fixed' | 'relative'; // For Storybook vs production
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  highlightedPersons?: string[]; // Person IDs to scroll to and highlight
  highlightedSlot?: { day: string; timeSlot: string }; // Time slot to highlight
  // Multi-roster support
  rosters?: RosterInfo[];
  activeRosterId?: string;
}

export function AvailabilityPanel({
  availabilities,
  days,
  dayLabels,
  timeSlots,
  editable = false,
  onPersonClick,
  onSlotClick,
  onSlotEdit,
  onDayLockToggle,
  positioning = 'fixed',
  isExpanded: controlledIsExpanded,
  onToggleExpanded,
  highlightedPersons = [],
  highlightedSlot,
  rosters,
  activeRosterId,
}: AvailabilityPanelProps) {
  const [internalIsExpanded, _setInternalIsExpanded] = useState(false);
  const [granularity, setGranularity] = useState<ViewGranularity>('day');
  const [roleFilter, setRoleFilter] = useState<PersonRole | 'all'>('all');
  const [panelHeight, setPanelHeight] = useState(525);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentDragHeight = useRef(0);

  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;
  // const _toggleExpanded = onToggleExpanded || (() => _setInternalIsExpanded(!internalIsExpanded));

  // Memoize filtered availabilities to prevent recalculation on every render
  const filteredAvailabilities = useMemo(() =>
    availabilities.filter((person) => roleFilter === 'all' || person.role === roleFilter),
    [availabilities, roleFilter]
  );

  const positionClasses = positioning === 'fixed'
    ? 'fixed bottom-0 left-0 right-0 z-50'
    : 'relative w-full';

  // Handle resize drag with direct DOM manipulation (zero re-renders)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;

      const deltaY = dragStartY.current - e.clientY;
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, dragStartHeight.current + deltaY));
      currentDragHeight.current = newHeight;

      // Direct DOM manipulation - bypasses React entirely
      panelRef.current.style.height = `${newHeight}px`;
    };

    const handleMouseUp = () => {
      // Commit final height to state
      if (currentDragHeight.current > 0) {
        setPanelHeight(currentDragHeight.current);
      }
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: true });
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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
      className={`${positionClasses} bg-white shadow-2xl ${isDragging ? '' : 'transition-all duration-300 ease-in-out'}`}
      style={{
        height: isExpanded ? `${panelHeight}px` : '0px',
        willChange: isDragging ? 'height' : 'auto'
      }}
    >
      {/* Resize handle */}
      {isExpanded && (
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-100 active:bg-blue-200 flex items-center justify-center group"
          onMouseDown={handleDragStart}
          style={{ zIndex: 100 }}
        >
          <GripHorizontal className="h-3 w-3 text-gray-400 group-hover:text-blue-600" />
        </div>
      )}

      {/* Content area */}
      {isExpanded && (
        <div
          className="h-full pt-2"
          style={{
            pointerEvents: isDragging ? 'none' : 'auto',
            minHeight: `${panelHeight - 10}px`,
            overflow: 'hidden'
          }}
        >
          <AvailabilityGrid
            availabilities={filteredAvailabilities}
            days={days}
            dayLabels={dayLabels}
            timeSlots={timeSlots}
            granularity={granularity}
            editable={editable}
            onPersonClick={onPersonClick}
            onSlotClick={onSlotClick}
            onSlotEdit={onSlotEdit}
            onDayLockToggle={onDayLockToggle}
            highlightedPersons={highlightedPersons}
            highlightedSlot={highlightedSlot}
            onGranularityChange={setGranularity}
            roleFilter={roleFilter}
            onRoleFilterChange={(role) => setRoleFilter(role as PersonRole | 'all')}
            rosters={rosters}
            activeRosterId={activeRosterId}
          />
        </div>
      )}
    </div>
  );
}
