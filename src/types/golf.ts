export interface GhinGolferDetails {
  ghinNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender?: string;
  handicapIndex: string;
  handicapIndexValue: number;
  association?: string;
  club?: string;
  state?: string;
  country?: string;
  lowHandicapIndex?: string;
  lowHandicapIndexValue?: number;
  lowHandicapDate?: string;
  revisionDate?: string;
  status?: string;
  isSoftCap?: boolean;
  isHardCap?: boolean;
}

export interface GhinScore {
  id: string;
  date: string;
  courseName: string;
  score: number;
  adjustedGrossScore: number;
  netScore: number;
  courseRating?: string;
  courseSlope?: string;
  playingConditions?: string;
  teeColor?: string;
  /** 9 or 18 — distinguishes a 9-hole round in feed copy. */
  numberOfHoles?: number;
  /** GHIN-provided "to par" string e.g. "+6", "+14", "E". */
  toParDisplay?: string;
  /** Handicap index as of when this score was posted (string form, e.g. "17.4"). */
  handicapIndexAtTime?: string;
}

export interface GhinHandicapRevision {
  date: string;
  handicap: string;
  club?: string;
}

export type FeedEventType =
  | 'SCORE_POSTED'
  | 'HANDICAP_CHANGED'
  | 'LOW_ROUND_ALERT'
  | 'MILESTONE'
  | 'ADMIN_ANNOUNCEMENT';

export type FeedEventImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FeedEventDTO {
  id: string;
  golferId: string | null;
  golferName?: string | null;
  type: FeedEventType;
  headline: string;
  details: string | null;
  importance: FeedEventImportance;
  createdAt: string;
}

export interface RosterEntryDTO {
  id: string;
  ghinNumber: string;
  fullName: string;
  handicapIndex: string;
  handicapIndexValue: number;
  club: string | null;
  trend: 'UP' | 'DOWN' | 'FLAT';
  trendDelta: number;
  lastSyncedAt: string;
}
