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

// Map programme IDs (with optional subtype) to their datasets
export const programmeDatasets: Record<string, ProgrammeDataset> = {
  // Master in Computer Science (CS) - Final defenses - June 2021
  'ma-ir-cs': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'CS Master final thesis defenses from June 2021',
  },
  // Master in Computer Science (CS) - Intermediate presentations - 2026
  'ma-ir-cs:intermediate': {
    defencesFile: '/data/intermediate-presentations/intermediate_presentations_2026.csv',
    availabilitiesFile: '/data/intermediate-presentations/intermediate_availabilities_2026.csv',
    period: '2026',
    description: 'CS Master intermediate presentations from 2026',
  },

  // Master in Engineering Technology (TI) - June 2021 (shares CS dataset)
  'ma-ir-ti': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'TI Master thesis defenses from June 2021 (combined with CS)',
  },
  'ma-eng-ti': {
    defencesFile: '/data/thesis-defences/CS_defences_june_2021.csv',
    availabilitiesFile: '/data/thesis-defences/CS_availabilities_june_2021.csv',
    period: 'June 2021',
    description: 'TI Master thesis defenses from June 2021 (combined with CS)',
  },

  // Master in Digital Humanities (DH) - September 2025
  'ma-eng-digital-hum': {
    defencesFile: '/data/thesis-defences/MDH_defences_sept_2025.csv',
    availabilitiesFile: '/data/thesis-defences/MDH_availabilities_sept_2025.csv',
    period: 'September 2025',
    description: 'Digital Humanities Master thesis defenses from September 2025',
  },
};

export interface LoadedProgrammeData {
  events: DefenceEvent[];
  availabilities: PersonAvailability[];
  dataset: ProgrammeDataset;
  extractedTimeHorizon?: {
    startDate: string;
    endDate: string;
    startHour: number;
    endHour: number;
  };
}

/**
 * Load defense and availability data for a given programme
 * @param datasetKey Programme ID or full dataset key (e.g., 'ma-ir-cs' or 'ma-ir-cs:intermediate')
 */
export async function loadProgrammeData(
  datasetKey: string
): Promise<LoadedProgrammeData | null> {
  const dataset = programmeDatasets[datasetKey];

  if (!dataset) {
    console.error('No dataset found for key:', datasetKey);
    return null;
  }

  try {
    // Fetch defenses
    const defencesResponse = await fetch(dataset.defencesFile);
    if (!defencesResponse.ok) {
      throw new Error(`Failed to fetch defenses: ${defencesResponse.statusText}`);
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

    // Extract time horizon from data
    let extractedTimeHorizon: LoadedProgrammeData['extractedTimeHorizon'];

    // Collect all dates from events and availabilities
    const allDates: string[] = [];
    const allHours: number[] = [];

    // From events
    uniqueEvents.forEach(event => {
      if (event.day) allDates.push(event.day);
      if (event.startTime) {
        const hour = parseInt(event.startTime.split(':')[0]);
        if (!isNaN(hour)) allHours.push(hour);
      }
      if (event.endTime) {
        const hour = parseInt(event.endTime.split(':')[0]);
        if (!isNaN(hour)) allHours.push(hour);
      }
    });

    // From availabilities
    availabilities.forEach(person => {
      Object.keys(person.availability).forEach(day => {
        allDates.push(day);
        Object.keys(person.availability[day]).forEach(timeSlot => {
          const hour = parseInt(timeSlot.split(':')[0]);
          if (!isNaN(hour)) allHours.push(hour);
        });
      });
    });

    // If we have dates, extract time horizon
    if (allDates.length > 0) {
      const sortedDates = [...new Set(allDates)].sort();
      const sortedHours = [...new Set(allHours)].sort((a, b) => a - b);

      extractedTimeHorizon = {
        startDate: sortedDates[0],
        endDate: sortedDates[sortedDates.length - 1],
        startHour: sortedHours.length > 0 ? sortedHours[0] : 8,
        endHour: sortedHours.length > 0 ? sortedHours[sortedHours.length - 1] + 1 : 17,
      };

      console.log('✓ Extracted time horizon from data:', extractedTimeHorizon);
    }

    return {
      events: uniqueEvents,
      availabilities,
      dataset,
      extractedTimeHorizon,
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

/**
 * Get all datasets for a programme (base + variants like :intermediate)
 * Returns array of {key, dataset} for all matching datasets
 */
export function getAllProgrammeDatasets(programmeId: string): Array<{key: string, dataset: ProgrammeDataset}> {
  const results: Array<{key: string, dataset: ProgrammeDataset}> = [];

  // Check base programme ID
  if (programmeId in programmeDatasets) {
    results.push({
      key: programmeId,
      dataset: programmeDatasets[programmeId]
    });
  }

  // Check for variants (e.g., programmeId:intermediate)
  Object.keys(programmeDatasets).forEach(key => {
    if (key.startsWith(`${programmeId}:`) && key !== programmeId) {
      results.push({
        key: key,
        dataset: programmeDatasets[key]
      });
    }
  });

  return results;
}
