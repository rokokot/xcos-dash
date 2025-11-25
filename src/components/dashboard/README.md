# Roster Dashboard

Integrated dashboard for thesis defence scheduling with constraint solving visualization.

## Overview

The `RosterDashboard` component combines all navigation and panel prototypes with the existing MainRoster and AvailabilityPanel components to provide a complete scheduling interface.

## Features

- **Tabbed Workflow**: Setup, Participants, Schedule, Explain, Export
- **Filter Panel**: Collapsible left sidebar for filtering defences by status, programme, and participant
- **Detail Panel**: Right sidebar showing defence or participant details on selection
- **Main Roster**: Grid view of scheduled defences with card stacking support
- **Availability Panel**: Bottom drawer showing participant availability matrix (visible in Schedule tab)

## Data Integration

### CSV Format

The dashboard loads data from CSV files in `public/thesis-defences/`:

**Defences CSV** (`*_defences_*.csv`):
```csv
event_id,student,supervisor,co_supervisor,assessors,mentors,day,start_time,end_time,programme,room
defence-1,John Doe,Dr. Smith,,Dr. Jones|Prof. Lee,Dr. Brown,2021-06-23,09:00,10:00,CS,B101
```

**Availabilities CSV** (`*_availabilities_*.csv`):
```csv
person_id,name,role,day,time_slot,status
student-1,John Doe,student,2021-06-23,09:00,booked
student-1,John Doe,student,2021-06-23,10:00,available
```

### Loading Data

```typescript
import { RosterDashboard } from './components/dashboard';
import { parseDefencesCsv, parseAvailabilitiesCsv } from './data/thesisDefenceData';
import { transformAvailabilityData } from './data/availabilityDataTransform';

// Load and parse CSV
const defencesText = await fetch('/thesis-defences/CS_defences_june_2021.csv').then(r => r.text());
const availabilitiesText = await fetch('/thesis-defences/CS_availabilities_june_2021.csv').then(r => r.text());

const events = parseDefencesCsv(defencesText);
const availabilityRecords = parseAvailabilitiesCsv(availabilitiesText);
const availabilities = transformAvailabilityData(availabilityRecords);

const days = extractUniqueDays(events);
const timeSlots = extractUniqueTimeSlots(events);

<RosterDashboard
  events={events}
  availabilities={availabilities}
  days={days}
  timeSlots={timeSlots}
/>
```

## Storybook

View live examples in Storybook under `Components/Dashboard/RosterDashboard`:

### Available Stories

1. **Default** - Synthetic sample data with 5 defences
2. **EmptySchedule** - Empty roster view
3. **FullSchedule** - Extended sample data with 7 defences
4. **CSJune2021** - CS defences from June 2021 (real CSV data, 130+ defences)
5. **MDHSept2025** - MDH defences from September 2025 (real CSV data)

## Component Structure

```
RosterDashboard
├── TopBar (title, user info)
├── Breadcrumbs (navigation path)
├── TabWorkflow (horizontal tabs)
└── Content Area
    ├── FilterPanel (left, collapsible, Schedule tab only)
    ├── Tab Content
    │   ├── Setup tab (configuration forms)
    │   ├── Participants tab (list view)
    │   ├── Schedule tab (MainRoster + AvailabilityPanel)
    │   ├── Explain tab (MUS/repair placeholder)
    │   └── Export tab (download buttons)
    └── DetailPanel (right, slides in on selection)
```

## State Management

The dashboard manages:

- `activeTab` - Current tab selection
- `filterPanelCollapsed` - Filter panel visibility
- `detailPanelOpen` - Detail panel visibility
- `detailContent` - Current detail view (defence or participant)
- `filters` - Active filter state (status, programmes, search)

## Customization

### Theme

All components use light mode by default with Inter font. Theme can be customized via CSS variables or by modifying individual component theme props.

### Colors

Programme colors are defined in `MainRoster`:
```typescript
colorScheme={{
  'CS': '#709cecff',
  'TI': '#fcd561ff',
}}
```

### Layout

Responsive breakpoints:
- Mobile (<768px): Full-screen overlays for panels
- Tablet (768px-1024px): Reduced panel widths
- Desktop (>1024px): Full layout with all panels

## Future Integration

### Solver Backend

The EXPLAIN tab is prepared for MUS/MCS/OCUS visualization:

```typescript
case 'explain':
  return (
    <ExplanationView
      conflicts={conflictData}
      onRepairSelect={handleRepairSelection}
    />
  );
```

### Real-time Updates

Add WebSocket support for live constraint solving updates:

```typescript
useEffect(() => {
  const ws = new WebSocket('ws://localhost:8000/solver');
  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    handleSolverUpdate(update);
  };
}, []);
```

## Development

Run Storybook to develop and test:

```bash
cd frontend
npm run storybook
```

Navigate to `Components/Dashboard/RosterDashboard (CSV Data)` to see the dashboard with real data.
