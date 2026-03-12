import type { CapabilityDefinition } from '@sisu/protocol';

// ---------------------------------------------------------------------------
// MC capability registry
// ---------------------------------------------------------------------------

export const MC_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'board.tasks',
    name: 'Board Tasks',
    description: 'Read and write board tasks',
    version: '1.0.0',
  },
  {
    id: 'docs.read',
    name: 'Documents Read',
    description: 'Read documents',
    version: '1.0.0',
  },
  {
    id: 'docs.write',
    name: 'Documents Write',
    description: 'Write documents',
    version: '1.0.0',
  },
  {
    id: 'calendar.plan',
    name: 'Calendar Planning',
    description: 'Calendar event planning',
    version: '1.0.0',
  },
  {
    id: 'office.observe',
    name: 'Office Observe',
    description: 'Observe office activities',
    version: '1.0.0',
  },
];

/**
 * Returns the full list of MC capability definitions.
 */
export function getMcCapabilities(): CapabilityDefinition[] {
  return MC_CAPABILITIES;
}

/**
 * Returns just the capability IDs for registration.
 */
export function getCapabilityIds(): string[] {
  return MC_CAPABILITIES.map((c) => c.id);
}
