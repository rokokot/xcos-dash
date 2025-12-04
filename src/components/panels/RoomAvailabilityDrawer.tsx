import { memo, MouseEvent } from 'react';
import clsx from 'clsx';
import { DefenceEvent } from '../../types/schedule';

export interface RoomAvailabilityDrawerProps {
  rooms: RoomAvailabilityRoom[];
  days: string[];
  timeSlots: string[];
  highlightedSlot?: { day: string; timeSlot: string } | null;
  onSlotSelect?: (room: string, day: string, timeSlot: string) => void;
  columnWidth?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}

export interface RoomAvailabilityRoom {
  id: string;
  label: string;
  slots: Record<string, Record<string, RoomAvailabilityCell>>;
}

export interface RoomAvailabilityCell {
  status: 'available' | 'booked';
  events: DefenceEvent[];
}

const STATUS_CLASS: Record<RoomAvailabilityCell['status'], string> = {
  available: 'bg-emerald-200 border border-white shadow-sm',
  booked: 'bg-blue-500 border border-blue-400 shadow',
};

export const RoomAvailabilityDrawer = memo(function RoomAvailabilityDrawer({
  rooms,
  days,
  timeSlots,
  highlightedSlot,
  onSlotSelect,
  columnWidth = 220,
  isOpen = true,
  onToggle,
}: RoomAvailabilityDrawerProps) {
  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggle?.();
  };
  return (
    <div className="mt-4 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden" data-prevent-clear="true">
      <div className="px-4 py-2 flex justify-end bg-gray-50 border-b border-gray-100" data-prevent-clear="true">
        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handleToggle}
          className="text-base font-medium text-blue-600 hover:text-blue-800"
        >
          {isOpen ? 'Hide rooms' : 'Show rooms'}
        </button>
      </div>
      <div className="overflow-x-auto" style={{ display: isOpen ? 'block' : 'none' }} data-prevent-clear="true">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-4 py-3 text-left text-base font-semibold text-gray-700 w-[180px]">
                Rooms
              </th>
              {days.map((day, dayIdx) => (
                <th
                  key={`room-day-${day}`}
                  className={clsx(
                    'px-4 py-3 text-lg font-semibold text-gray-700 text-center',
                    dayIdx > 0 && 'border-l-[3px] border-gray-200'
                  )}
                  colSpan={timeSlots.length}
                  style={{
                    minWidth: `${columnWidth}px`,
                    width: `${columnWidth}px`,
                  }}
                >
                  {formatDayLabel(day)}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-3 py-2" />
              {days.map((day, dayIdx) =>
                timeSlots.map((slot, slotIdx) => (
                  <th
                    key={`${day}-${slot}`}
                    className={clsx(
                      'px-1 py-1 text-xs uppercase tracking-wide text-gray-500',
                      slotIdx === 0 && dayIdx > 0 && 'border-l-[3px] border-gray-200'
                    )}
                    style={{ width: `${columnWidth / timeSlots.length}px` }}
                  >
                    {slot.substring(0, 5)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => (
              <tr key={room.id} className="odd:bg-white even:bg-gray-50/60 text-base">
                <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-3 text-base font-semibold text-gray-900 w-[180px]">
                  {room.label}
                </td>
                {days.map((day, dayIdx) =>
                  timeSlots.map((slot, slotIdx) => {
                    const cell = room.slots[day]?.[slot];
                    const status = cell?.status ?? 'available';
                    const events = cell?.events ?? [];
                    const isHighlighted =
                      highlightedSlot?.day === day && highlightedSlot?.timeSlot === slot && events.length === 0;

                    return (
                      <td
                        key={`${room.id}-${day}-${slot}`}
                        className={clsx(
                          'px-0.5 py-1',
                          slotIdx === 0 && dayIdx > 0 && 'border-l-[3px] border-gray-200'
                        )}
                        style={{ width: `${columnWidth / timeSlots.length}px` }}
                      >
                        <button
                          className={clsx(
                            'w-full aspect-square w-2 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                            STATUS_CLASS[status],
                            isHighlighted && 'ring-2 ring-offset-1 ring-blue-500'
                          )}
                          onClick={() => onSlotSelect?.(room.id, day, slot)}
                          title={
                            events.length > 0
                              ? events.map(evt => evt.student || evt.title).join(', ')
                              : `${room.label} free @ ${slot}`
                          }
                          >
                            {events.length > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </button>
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function formatDayLabel(day: string) {
  const date = new Date(day);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const DEFAULT_ROOM_NAMES = [
  '200C 00.01',
  '200C 00.02',
  '200C 00.03',
  '200C 00.04',
  '200B 01.14',
  '200B 01.16',
  '200B 01.18',
  'Ruby',
  'Python',
  'Java',
];

export function buildRoomAvailabilityRooms(
  events: DefenceEvent[],
  days: string[],
  timeSlots: string[]
): RoomAvailabilityRoom[] {
  const roomSet = new Set(DEFAULT_ROOM_NAMES);
  const eventsByRoom = new Map<string, DefenceEvent[]>();

  events.forEach(event => {
    const roomName = event.room || 'Unassigned';
    roomSet.add(roomName);
    if (!eventsByRoom.has(roomName)) {
      eventsByRoom.set(roomName, []);
    }
    eventsByRoom.get(roomName)!.push(event);
  });

  const createEmptySchedule = (): RoomAvailabilityRoom['slots'] => {
    const schedule: RoomAvailabilityRoom['slots'] = {};
    days.forEach(day => {
      schedule[day] = {};
      timeSlots.forEach(slot => {
        schedule[day][slot] = { status: 'available', events: [] };
      });
    });
    return schedule;
  };

  return Array.from(roomSet).map(roomName => {
    const schedule = createEmptySchedule();
    const roomEvents = eventsByRoom.get(roomName);

    roomEvents?.forEach(event => {
      if (!event.day || !event.startTime) return;
      const daySchedule = schedule[event.day];
      if (!daySchedule) return;
      const slot = daySchedule[event.startTime];
      if (!slot) return;
      slot.status = 'booked';
      slot.events = [...slot.events, event];
    });

    return {
      id: roomName,
      label: roomName,
      slots: schedule,
    };
  });
}
