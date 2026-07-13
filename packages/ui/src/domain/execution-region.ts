const EXECUTION_REGIONS = ["ntsc", "pal", "dendy"] as const;
export const REGION_PREFERENCES = ["auto", ...EXECUTION_REGIONS] as const;

export type ExecutionRegion = (typeof EXECUTION_REGIONS)[number];
export type RegionPreference = (typeof REGION_PREFERENCES)[number];

export function parseRegionPreference(value: string): RegionPreference {
  if (REGION_PREFERENCES.some((preference) => preference === value)) {
    return value as RegionPreference;
  }
  throw new Error(`Unsupported execution-region preference: ${value}`);
}
