export interface FamilyMember {
  id: string;
  name: string;
  kana: string;
  repo?: string;
  site?: string;
}
export interface FamilyGroup {
  id: string;
  en: string;
  ja: string;
  members: string[];
}
export const FAMILY: FamilyMember[];
export const FAMILY_GROUPS: FamilyGroup[];
export const FAMILY_PITCH: Record<string, string>;
export const FAMILY_PITCH_JA: Record<string, string>;
export function familySite(id: string): string;
