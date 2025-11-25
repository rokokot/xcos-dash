# Defence Card Styling Guide

## Quick Start

The card styling system is now active with default theme that matches the current appearance. No visual changes until you customize.

## How to Customize Card Styles

### Option 1: Quick Tweaks (Recommended for testing)

Edit `src/config/cardStyles.config.ts` directly to test changes:

```typescript
// In cardStyles.config.ts, change values:
student: {
  fontSize: '18px',      // ← Change this
  fontWeight: 700,       // ← And this
  lineHeight: '1.3',
},
```

Refresh the page to see changes immediately.

### Option 2: Create Custom Theme (Recommended for permanent changes)

1. **Copy the example file:**
   ```bash
   cp src/config/customCardTheme.example.ts src/config/customCardTheme.ts
   ```

2. **Edit `customCardTheme.ts` with your changes**

3. **Update RosterDashboard.tsx:**
   ```typescript
   // Change this line (around line 34):
   import { defaultDefenceCardTheme } from '../../config/cardStyles.config';

   // To this:
   import { customCardTheme as defaultDefenceCardTheme } from '../../config/customCardTheme';
   ```

4. **Refresh the page** - changes apply immediately

## What You Can Customize

### Typography (Font Styling)

**File location:** `typography` section in config

**Available properties:**
- `fontFamily` - Font family name
- `fontSize` - Size in px or Tailwind class (`'16px'` or `'text-lg'`)
- `fontWeight` - Weight (300, 400, 600, 700, etc.)
- `lineHeight` - Line spacing (`'1.3'`, `'1.5'`, etc.)
- `letterSpacing` - Character spacing (`'0.5px'`, `'1px'`, etc.)
- `textTransform` - `'uppercase'`, `'lowercase'`, `'capitalize'`, `'none'`
- `textAlign` - `'left'`, `'center'`, `'right'`

**Elements you can style:**
- `programme` - Programme badge (CS, TI, etc.)
- `student` - Student name
- `supervisor` - Supervisor name
- `coSupervisor` - Co-supervisor name
- `assessors` - Assessor names
- `mentors` - Mentor names

**Example:**
```typescript
typography: {
  student: {
    fontWeight: 700,           // Bold student name
    fontSize: '18px',          // Larger
    letterSpacing: '0.5px',    // Slightly spaced
  },
  programme: {
    textTransform: 'uppercase', // CS → CS (all caps)
    fontWeight: 800,
  },
}
```

### Colors

**File location:** `colors` section in config

**Text colors:**
```typescript
colors: {
  text: {
    student: { color: 'white', opacity: 1 },
    supervisor: { color: 'white', opacity: 0.9 },
    programme: { color: 'white', opacity: 0.9 },
    locked: { color: 'white', opacity: 0.8 },
  },
}
```

**Background:**
```typescript
colors: {
  background: {
    opacity: 0.95,  // Card transparency (0-1)
    gradient: 'linear-gradient(...)', // Optional gradient overlay
  },
}
```

### Spacing

**File location:** `spacing` section in config

**Card internal spacing:**
```typescript
spacing: {
  card: {
    padding: '12px',      // Space inside card
    internalGap: '6px',   // Gap between student/supervisor lines
  },
}
```

**Cell spacing:**
```typescript
spacing: {
  cell: {
    padding: '10px',      // Space from card to timeslot border
    cardSpacing: '8px',   // Space between cards in compact mode
  },
}
```

**Stacking:**
```typescript
spacing: {
  stacking: {
    offset: 6,  // Pixel offset for stacked cards (individual mode)
  },
}
```

### Borders & Shadows

**Borders:**
```typescript
borders: {
  card: {
    radius: '12px',    // Border radius (roundness)
    width: '2px',
    style: 'solid',    // 'solid', 'dashed', 'dotted', 'none'
    color: 'rgba(255, 255, 255, 0.2)',
  },
  selected: {
    width: '3px',      // Selection border width
    color: '#10b981',  // Selection border color (green)
  },
}
```

**Shadows:**
```typescript
shadows: {
  default: {
    offsetX: '0',
    offsetY: '4px',
    blur: '8px',
    spread: '0',
    color: 'rgba(0, 0, 0, 0.1)',
  },
  active: {  // Shadow when card is active/top of stack
    offsetY: '12px',
    blur: '24px',
    color: 'rgba(0, 0, 0, 0.2)',
  },
}
```

### Interaction States

**Selection:**
```typescript
states: {
  selected: {
    border: {
      width: '3px',
      color: '#10b981',  // Green selection border
    },
    shadow: {
      spread: '3px',
      color: 'rgba(16, 185, 129, 0.4)',  // Green glow
    },
  },
}
```

**Locked:**
```typescript
states: {
  locked: {
    opacity: 0.75,     // Card opacity when locked
    iconColor: 'white', // Lock icon color
  },
}
```

**Hover:**
```typescript
states: {
  hover: {
    brightness: 1.1,  // 10% brighter on hover (1.0 = no change)
  },
}
```

**Conflicts:**
```typescript
states: {
  conflicts: {
    doubleBooking: {
      ringWidth: '2px',
      ringColor: 'rgb(239, 68, 68)',  // Red ring
    },
    availability: {
      ringWidth: '1px',
      ringColor: 'rgb(251, 146, 60)',  // Orange ring
    },
  },
}
```

### View Modes

**Individual mode (stacked cards):**
```typescript
modes: {
  individual: {
    minHeight: '64px',
    showFullDetails: false,
  },
}
```

**Compact mode (list view):**
```typescript
modes: {
  compact: {
    minHeight: '42px',
    padding: '6px 8px',
    fontSize: 'text-xs',
    showFullDetails: false,
  },
}
```

## Common Customizations

### Make student names larger and bolder
```typescript
typography: {
  student: {
    fontWeight: 700,
    fontSize: '18px',
  },
}
```

### Add more card padding
```typescript
spacing: {
  card: {
    padding: '16px',
    internalGap: '8px',
  },
}
```

### Change selection color to green
```typescript
states: {
  selected: {
    border: { color: '#10b981' },
    shadow: { color: 'rgba(16, 185, 129, 0.4)' },
  },
}
```

### Make cards more rounded
```typescript
borders: {
  card: {
    radius: '16px',  // More rounded (was 8px)
  },
}
```

### Adjust compact mode spacing
```typescript
spacing: {
  cell: {
    cardSpacing: '10px',  // More space between compact cards
  },
}

modes: {
  compact: {
    minHeight: '48px',     // Taller compact cards
    padding: '8px 10px',   // More padding
  },
}
```

## Troubleshooting

**Changes not appearing?**
1. Check browser console for TypeScript errors
2. Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
3. Verify you're editing the right config file
4. Check import statement in RosterDashboard.tsx

**Cards look broken?**
1. Revert to default theme in RosterDashboard.tsx
2. Check for invalid CSS values (e.g., negative padding)
3. Verify color formats (`'rgb(...)'` or `'#hex'`)

**Want to reset everything?**
1. Delete `customCardTheme.ts`
2. Ensure RosterDashboard.tsx imports `defaultDefenceCardTheme`
3. Refresh the page

## File Locations

- **Type definitions:** `src/config/cardStyles.types.ts`
- **Default theme:** `src/config/cardStyles.config.ts`
- **Custom theme (create this):** `src/config/customCardTheme.ts`
- **Example theme:** `src/config/customCardTheme.example.ts`
- **Utilities:** `src/config/cardStyles.utils.ts`
- **Component:** `src/components/scheduler/DraggableDefenceCard.tsx`
- **Dashboard integration:** `src/components/dashboard/RosterDashboard.tsx`

## Design Documentation

Full architectural documentation: `docs/plans/2025-11-21-card-styling-system-design.md`
