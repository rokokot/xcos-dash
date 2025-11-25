import { memo, useEffect, useRef, useState, useMemo } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import { Lock, Check } from 'lucide-react';
import { DefenceEvent } from '../../types/schedule';
import { DefenceCardTheme } from '../../config/cardStyles.types';
import { defaultDefenceCardTheme } from '../../config/cardStyles.config';
import { mergeThemes, shadowToCss, applyTypography, getTextColor } from '../../config/cardStyles.utils';

export interface DraggableDefenceCardProps {
  event: DefenceEvent;
  isActive: boolean;
  isSelected: boolean;
  stackOffset: number;
  zIndex: number;
  colorScheme: Record<string, string>;
  cardStyle: {
    width?: string;
    minHeight?: string;
    padding?: string;
    fontSize?: string;
    showFullDetails?: boolean;
  };
  onClick: (e: React.MouseEvent) => void;
  onCheckboxClick?: (e: React.MouseEvent) => void;
  onLockToggle: () => void;
  compact?: boolean;
  theme?: Partial<DefenceCardTheme>; // Optional theme override
}

function DraggableDefenceCardComponent({
  event,
  isActive,
  isSelected,
  stackOffset,
  zIndex,
  colorScheme,
  cardStyle,
  onClick,
  onCheckboxClick,
  onLockToggle,
  compact = false,
  theme,
}: DraggableDefenceCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  // Merge theme with defaults - memoized to prevent recalculation
  const resolvedTheme = useMemo(
    () => mergeThemes(defaultDefenceCardTheme, theme),
    [theme]
  );

  // Setup draggable and droppable with pragmatic-dnd
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Don't make draggable if locked or not active
    if (event.locked || !isActive) return;

    return combine(
      draggable({
        element,
        getInitialData: () => ({
          type: 'defence-card',
          eventId: event.id,
          event: event,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          // Only allow defence cards to be dropped
          return source.data.type === 'defence-card' && source.data.eventId !== event.id;
        },
        getData: ({ input }) => {
          return attachClosestEdge(
            {
              type: 'defence-card',
              eventId: event.id,
            },
            {
              element,
              input,
              allowedEdges: ['top', 'bottom'],
            }
          );
        },
        onDrag: ({ self }) => {
          const edge = extractClosestEdge(self.data);
          setClosestEdge(edge);
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      })
    );
  }, [event.id, event.locked, isActive]);

  // Memoize expensive calculations
  const { style, programmeStyle, studentStyle, supervisorStyle, lockedIconColor } = useMemo(() => {
    // Determine mode-specific config
    const modeConfig = compact ? resolvedTheme.modes.compact : resolvedTheme.modes.individual;

    // Calculate stacking offset from theme
    const themeStackOffset = compact ? 0 : resolvedTheme.spacing.stacking.offset;
    const actualStackOffset = stackOffset ?? themeStackOffset;

    // Base card style with theme
    const baseColor = event.color || colorScheme[event.programme] || '#aeb6c4ff';
    const computedStyle: React.CSSProperties = {
      backgroundColor: baseColor,
      color: getTextColor(resolvedTheme.colors.text.student.color, resolvedTheme.colors.background.opacity),
      top: compact ? '0' : `${actualStackOffset}px`,
      position: compact ? 'relative' : 'absolute',
      width: cardStyle.width || '100%',
      minHeight: cardStyle.minHeight || modeConfig.minHeight,
      padding: cardStyle.padding || (compact ? modeConfig.padding : resolvedTheme.spacing.card.padding),
      borderRadius: resolvedTheme.borders.card.radius,
      fontSize: cardStyle.fontSize || (compact ? modeConfig.fontSize : undefined),
      zIndex: isDragging ? 1000 : zIndex,
      opacity: event.locked ? resolvedTheme.states.locked.opacity : (isActive ? 1 : 0.4),
      transform: isDragging ? 'scale(0.98)' : 'scale(1)',
      cursor: event.locked ? 'default' : (isActive ? (isDragging ? 'grabbing' : 'grab') : 'pointer'),
      transition: isDragging ? 'none' : 'opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
      pointerEvents: isActive ? 'auto' : 'none',
      boxShadow: isActive
        ? shadowToCss(resolvedTheme.shadows.active)
        : (event.locked ? shadowToCss(resolvedTheme.shadows.locked) : shadowToCss(resolvedTheme.shadows.default)),
    };

    // Apply gradient if specified
    if (resolvedTheme.colors.background.gradient) {
      computedStyle.background = resolvedTheme.colors.background.gradient;
    }

    const hasConflicts = event.conflicts && event.conflicts.length > 0;
    const hasDoubleBooking = event.conflicts && event.conflicts.some(c => c === 'double-booking');

    // Build dynamic classes for selection and conflicts
    const borderWidth = isSelected ? resolvedTheme.states.selected.border.width : resolvedTheme.borders.card.width;
    const borderColor = isSelected ? resolvedTheme.states.selected.border.color : resolvedTheme.borders.card.color;
    const borderStyle = isSelected ? resolvedTheme.states.selected.border.style : resolvedTheme.borders.card.style;

    // Apply selection shadow
    if (isSelected) {
      const selectionShadow = shadowToCss(resolvedTheme.states.selected.shadow);
      computedStyle.boxShadow = `${computedStyle.boxShadow}, ${selectionShadow}`;
      computedStyle.border = `${borderWidth} ${borderStyle} ${borderColor}`;
    } else {
      computedStyle.border = `${borderWidth} ${borderStyle} ${borderColor}`;
    }

    // Conflict ring styling via inline style (overrides Tailwind)
    let conflictRing = '';
    if (hasDoubleBooking) {
      conflictRing = `0 0 0 ${resolvedTheme.states.conflicts.doubleBooking.ringWidth} ${resolvedTheme.states.conflicts.doubleBooking.ringColor}`;
    } else if (hasConflicts) {
      conflictRing = `0 0 0 ${resolvedTheme.states.conflicts.availability.ringWidth} ${resolvedTheme.states.conflicts.availability.ringColor}`;
    }

    if (conflictRing) {
      computedStyle.boxShadow = `${computedStyle.boxShadow}, ${conflictRing}`;
    }

    // Typography styles for different elements
    const computedProgrammeStyle = applyTypography({
      color: getTextColor(resolvedTheme.colors.text.programme.color, resolvedTheme.colors.text.programme.opacity),
    }, resolvedTheme.typography.programme);

    const computedStudentStyle = applyTypography({
      color: getTextColor(resolvedTheme.colors.text.student.color, resolvedTheme.colors.text.student.opacity),
    }, resolvedTheme.typography.student);

    const computedSupervisorStyle = applyTypography({
      color: getTextColor(resolvedTheme.colors.text.supervisor.color, resolvedTheme.colors.text.supervisor.opacity),
    }, resolvedTheme.typography.supervisor);

    const computedLockedIconColor = resolvedTheme.states.locked.iconColor;

    return {
      style: computedStyle,
      programmeStyle: computedProgrammeStyle,
      studentStyle: computedStudentStyle,
      supervisorStyle: computedSupervisorStyle,
      lockedIconColor: computedLockedIconColor,
    };
  }, [resolvedTheme, compact, stackOffset, event.color, event.locked, event.conflicts, event.programme, colorScheme, cardStyle, isDragging, zIndex, isActive, isSelected]);

  return (
    <div
      ref={ref}
      className={compact ? 'relative' : 'absolute left-0'}
      style={{
        ...style,
        filter: isActive && !isDragging ? `brightness(${resolvedTheme.states.hover.brightness})` : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onMouseEnter={(e) => {
        if (isActive) {
          e.currentTarget.style.filter = `brightness(${resolvedTheme.states.hover.brightness})`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = '';
      }}
    >
      {/* Selection checkbox - only show in non-compact mode */}
      {!compact && (
        <div
          className={`absolute top-1.5 right-1.5 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
            isSelected
              ? 'bg-white border-white'
              : 'bg-transparent border-white/50 hover:border-white'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (onCheckboxClick) {
              onCheckboxClick(e);
            } else {
              const syntheticEvent = { ...e, ctrlKey: true } as React.MouseEvent;
              onClick(syntheticEvent);
            }
          }}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-gray-800" strokeWidth={3} />}
        </div>
      )}

      {/* Compact mode: condensed info with all participants */}
      {compact ? (
        <div className="flex items-center" style={{ gap: resolvedTheme.spacing.card.internalGap }}>
          {/* Selection checkbox */}
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 ${
              isSelected
                ? 'bg-white border-white'
                : 'bg-transparent border-white/60 hover:border-white'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (onCheckboxClick) {
                onCheckboxClick(e);
              } else {
                const syntheticEvent = { ...e, ctrlKey: true } as React.MouseEvent;
                onClick(syntheticEvent);
              }
            }}
          >
            {isSelected && <Check className="w-3 h-3 text-gray-800" strokeWidth={3} />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="truncate" style={studentStyle}>
              {event.student}
            </div>
            <div className="truncate" style={{ ...supervisorStyle, marginTop: resolvedTheme.spacing.card.internalGap }}>
              {event.supervisor}
              {event.coSupervisor && ` • ${event.coSupervisor}`}
              {event.assessors.length > 0 && ` • ${event.assessors.join(', ')}`}
              {event.mentors && event.mentors.length > 0 && ` • ${event.mentors.join(', ')}`}
            </div>
          </div>
          {event.locked && (
            <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: lockedIconColor }} strokeWidth={2} />
          )}
        </div>
      ) : (
        <>
          {/* Programme badge */}
          <div style={{ ...programmeStyle, marginBottom: resolvedTheme.spacing.card.internalGap }}>
            {event.programme}
          </div>

          {/* Student name with lock icon */}
          <div className="flex items-center" style={{ ...studentStyle, gap: resolvedTheme.spacing.card.internalGap }}>
            {event.student}
            {event.locked && (
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: lockedIconColor }} strokeWidth={2} />
            )}
          </div>

          {/* Supervisor */}
          <div style={{ ...supervisorStyle, marginTop: resolvedTheme.spacing.card.internalGap }}>
            {event.supervisor}
          </div>
        </>
      )}

      {/* Full details */}
      {cardStyle.showFullDetails && (
        <>
          {event.coSupervisor && (
            <div className={`${cardStyle.fontSize} opacity-90`}>
              Co-supervisor: {event.coSupervisor}
            </div>
          )}

          {event.assessors.length > 0 && (
            <div className={`${cardStyle.fontSize} opacity-90 mt-1`}>
              <span className="font-semibold">Assessors:</span>
              <div className="ml-1">
                {event.assessors.map((assessor, idx) => (
                  <div key={idx}>• {assessor}</div>
                ))}
              </div>
            </div>
          )}

          {event.mentors.length > 0 && (
            <div className={`${cardStyle.fontSize} opacity-90`}>
              <span className="font-semibold">Mentors:</span>
              <div className="ml-1">
                {event.mentors.map((mentor, idx) => (
                  <div key={idx}>• {mentor}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Drop indicators for sortable reordering */}
      {closestEdge && <DropIndicator edge={closestEdge} gap="4px" />}

    </div>
  );
}

export const DraggableDefenceCard = memo(DraggableDefenceCardComponent, (prevProps, nextProps) => {
  // Fast path for unchanged events
  if (prevProps.event === nextProps.event &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.stackOffset === nextProps.stackOffset &&
      prevProps.zIndex === nextProps.zIndex &&
      prevProps.cardStyle === nextProps.cardStyle &&
      prevProps.theme === nextProps.theme) {
    return true;
  }

  // Detailed comparison for conflicts array
  const prevConflicts = prevProps.event.conflicts;
  const nextConflicts = nextProps.event.conflicts;
  const conflictsEqual = prevConflicts === nextConflicts ||
    (!!prevConflicts && !!nextConflicts &&
      prevConflicts.length === nextConflicts.length &&
      prevConflicts.every((c, i) => c === nextConflicts[i])) ||
    (!prevConflicts && !nextConflicts);

  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.locked === nextProps.event.locked &&
    prevProps.event.student === nextProps.event.student &&
    prevProps.event.supervisor === nextProps.event.supervisor &&
    prevProps.event.programme === nextProps.event.programme &&
    prevProps.event.color === nextProps.event.color &&
    conflictsEqual &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.stackOffset === nextProps.stackOffset &&
    prevProps.zIndex === nextProps.zIndex &&
    prevProps.cardStyle.showFullDetails === nextProps.cardStyle.showFullDetails &&
    prevProps.theme === nextProps.theme
  );
});
