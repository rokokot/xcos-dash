/**
 * Programme Data Loader Service
 * Maps programmes to their corresponding defence/exam datasets
 */

import { parseDefencesCsv, parseAvailabilitiesCsv } from '../data/thesisDefenceData';
import { transformAvailabilityData } from '../data/availabilityDataTransform';
import { DefenceEvent } from '../types/schedule';
import { PersonAvailability } from '../components/availability/types';

export interface ProgrammeDataset {
  defencesFile: string;
  availabilitiesFile?: string;
  period: string;
  description: string;
}

// Map programme IDs to their datasets
export const programmeDatasets: Record<string, ProgrammeDataset> = {
  // Master in Computer Science (CS) - June 2021
  'ma-ir-cs': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'CS Master thesis defences from June 2021',
  },
  'ma-eng-cs': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'CS Master thesis defences from June 2021',
  },

  // Master in Engineering Technology (TI) - June 2021 (shares CS dataset)
  'ma-ir-ti': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'TI Master thesis defences from June 2021 (combined with CS)',
  },
  'ma-eng-ti': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'TI Master thesis defences from June 2021 (combined with CS)',
  },

  // Master in Digital Humanities (DH) - September 2025
  'ma-eng-digital-hum': {
    defencesFile: '/data/thesis-defences/MDH_defences_sept_2025.csv',
    availabilitiesFile: '/data/thesis-defences/MDH_availabilities_sept_2025.csv',
    period: 'September 2025',
    description: 'Digital Humanities Master thesis defences from September 2025',
  },
};

export interface LoadedProgrammeData {
  events: DefenceEvent[];
  availabilities: PersonAvailability[];
  dataset: ProgrammeDataset;
}

/**
 * Load defence and availability data for a given programme
 */
export async function loadProgrammeData(programmeId: string): Promise<LoadedProgrammeData | null> {
  const dataset = programmeDatasets[programmeId];

  if (!dataset) {
    console.error('No dataset found for programme:', programmeId);
    return null;
  }

  try {
    // Fetch defences
    const defencesResponse = await fetch(dataset.defencesFile);
    if (!defencesResponse.ok) {
      throw new Error(`Failed to fetch defences: ${defencesResponse.statusText}`);
    }
    const defencesText = await defencesResponse.text();
    const events = parseDefencesCsv(defencesText);

    // Check for duplicate IDs and fix them
    const idCounts = new Map<string, number>();
    const uniqueEvents = events.map(event => {
      const count = idCounts.get(event.id) || 0;
      idCounts.set(event.id, count + 1);

      if (count > 0) {
        // Duplicate found - create unique ID
        const uniqueId = `${event.id}-dup-${count}`;
        console.warn(`Duplicate event ID detected: ${event.id}, renaming to ${uniqueId}`);
        return { ...event, id: uniqueId };
      }
      return event;
    });

    // Fetch availabilities if provided
    let availabilities: PersonAvailability[] = [];
    if (dataset.availabilitiesFile) {
      try {
        const availabilitiesResponse = await fetch(dataset.availabilitiesFile);
        if (availabilitiesResponse.ok) {
          const availabilitiesText = await availabilitiesResponse.text();
          const parsedAvailabilities = parseAvailabilitiesCsv(availabilitiesText);
          availabilities = transformAvailabilityData(parsedAvailabilities);
        }
      } catch (error) {
        console.warn('Failed to load availabilities, continuing without:', error);
      }
    }

    return {
      events: uniqueEvents,
      availabilities,
      dataset,
    };
  } catch (error) {
    console.error('Failed to load programme data:', error);
    return null;
  }
}

/**
 * Check if a programme has associated data
 */
export function hasProgrammeData(programmeId: string): boolean {
  return programmeId in programmeDatasets;
}

/**
 * Get dataset info without loading the full data
 */
export function getProgrammeDatasetInfo(programmeId: string): ProgrammeDataset | null {
  return programmeDatasets[programmeId] || null;
}
