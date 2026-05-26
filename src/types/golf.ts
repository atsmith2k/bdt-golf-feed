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
  /** Per-hole detail (when GHIN exposes hole_details). */
  holeDetails?: GhinHoleDetail[];
  /** Per-round statistics block embedded in the score (decimals 0-1). */
  roundStatistics?: GhinRoundStatistics;
}

/**
 * One entry in `hole_details[]` under a score row in
 * `/golfers/{id}/scores.json`. Rounds without shot tracking still have
 * the par/score/raw_score fields, which is enough to derive birdies/pars/
 * bogeys aggregations even when fairway/GIR/putt fields are null.
 */
export interface GhinHoleDetail {
  holeNumber: number;
  par: number;
  adjustedGrossScore: number;
  rawScore: number;
  putts?: number | null;
  fairwayHit?: boolean | null;
  girFlag?: boolean | null;
  driveAccuracy?: string | null;
  approachShotAccuracy?: string | null;
  strokeAllocation?: number | null;
  xHole?: boolean;
  mostLikelyScore?: number | null;
}

/**
 * Per-round summary stats embedded in each score in
 * `/golfers/{id}/scores.json`. All percentages are decimals in [0, 1] —
 * NOT whole numbers like the old `/statistics.json` aggregate endpoint.
 * Aggregations across rounds happen in the profile API.
 */
export interface GhinRoundStatistics {
  puttsTotal: number;
  onePuttOrBetterPercent: number;
  twoPuttPercent: number;
  threePuttOrWorsePercent: number;
  twoPuttOrBetterPercent: number;
  upAndDownsTotal: number;
  par3sAverage: number;
  par4sAverage: number;
  par5sAverage: number;
  parsPercent: number;
  birdiesOrBetterPercent: number;
  bogeysPercent: number;
  doubleBogeysPercent: number;
  tripleBogeysOrWorsePercent: number;
  fairwayHitsPercent: number;
  missedLeftPercent: number;
  missedRightPercent: number;
  missedLongPercent: number;
  missedShortPercent: number;
  girPercent: number;
}

export interface GhinHandicapRevision {
  date: string;
  handicap: string;
  /** Stable GHIN-assigned revision identifier from /handicap_history.json. */
  ghinRevisionId?: string;
  club?: string;
  /** Lowest handicap index as of this revision (e.g. "16.4"). */
  lowHandicapIndex?: string;
  /** True when this revision has a soft cap applied. */
  isSoftCap?: boolean;
  /** True when this revision has a hard cap applied. */
  isHardCap?: boolean;
  /**
   * Index value before the soft cap was applied — only present when
   * Hard_Soft_Cap == "Y". Useful for showing "would have been 20.1, capped to 19.8".
   */
  hiBeforeSoftCap?: string;
}

/**
 * Round-distribution + advanced stats from GHIN's `/statistics.json` endpoint.
 *
 * The "summary" half (birdies/pars/bogeys percentages, par 3/4/5 averages)
 * is computed by GHIN from the score history and is populated for any
 * golfer who's posted enough rounds. The "advanced" half (fairways, GIR,
 * putts) is only populated when the golfer enters shot-by-shot data —
 * most posted rounds skip this, so all-zero is the common case.
 */
export interface GhinGolferStatistics {
  totalSummaryRounds: number;
  totalStatsRounds: number;
  scoreSummary: {
    birdiesOrBetterPercent: number | null;
    parsPercent: number | null;
    bogeysPercent: number | null;
    doubleBogeysPercent: number | null;
    tripleBogeysOrWorsePercent: number | null;
    parsOrBetter: number | null;
    par3sAverage: number | null;
    par4sAverage: number | null;
    par5sAverage: number | null;
  };
  advancedStats: {
    fairwayHitsPercent: number | null;
    missedLeftPercent: number | null;
    missedRightPercent: number | null;
    girPercent: number | null;
    onePuttOrBetterPercent: number | null;
    twoPuttPercent: number | null;
    threePuttOrWorsePercent: number | null;
    putts: number | null;
    upAndDownsTotal: number | null;
  };
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

/** Compact score row, sized for the profile page. */
export interface ProfileScoreDTO {
  id: string;
  datePlayed: string;
  courseName: string;
  adjustedGrossScore: number;
  score: number;
  netScore: number;
  courseRating: string | null;
  courseSlope: string | null;
  teeColor: string | null;
  numberOfHoles: number | null;
  toParDisplay: string | null;
  handicapIndexAtTime: string | null;
  /** Strokes vs. course rating (signed integer or "E"). */
  vsRating: string | null;
}

export interface ProfileRevisionDTO {
  revisionDate: string;
  handicapIndex: string;
  handicapIndexValue: number;
  club: string | null;
  lowHandicapIndex: string | null;
  isSoftCap: boolean;
  isHardCap: boolean;
  hiBeforeSoftCap: string | null;
}

export interface ProfileStatisticsDTO {
  totalSummaryRounds: number;
  totalStatsRounds: number;
  scoreSummary: {
    birdiesOrBetterPercent: number | null;
    parsPercent: number | null;
    bogeysPercent: number | null;
    doubleBogeysPercent: number | null;
    tripleBogeysOrWorsePercent: number | null;
    parsOrBetter: number | null;
    par3sAverage: number | null;
    par4sAverage: number | null;
    par5sAverage: number | null;
  };
  advancedStats: {
    fairwayHitsPercent: number | null;
    missedLeftPercent: number | null;
    missedRightPercent: number | null;
    girPercent: number | null;
    onePuttOrBetterPercent: number | null;
    twoPuttPercent: number | null;
    threePuttOrWorsePercent: number | null;
    putts: number | null;
    upAndDownsTotal: number | null;
  };
  updatedAt: string;
}

export interface ProfileFeedEventDTO {
  id: string;
  type: FeedEventType;
  headline: string;
  details: string | null;
  importance: FeedEventImportance;
  createdAt: string;
}

export interface ProfileCourseStatDTO {
  courseName: string;
  rounds: number;
  bestAdjustedGross: number;
  averageAdjustedGross: number;
}

export interface ProfileStatsDTO {
  rounds: {
    total: number;
    eighteenHole: number;
    nineHole: number;
  };
  lowest: {
    adjustedGross18: number | null;
    adjustedGross9: number | null;
    net18: number | null;
  };
  averages: {
    adjustedGross18: number | null;
    net18: number | null;
    differentialLast20: number | null;
  };
  scoringTrend: {
    /** Last-five-round adjusted-gross average minus prior-five average. Null if not enough data. */
    deltaLast5VsPrior5: number | null;
  };
  bestVsRating: {
    scoreId: string;
    courseName: string;
    datePlayed: string;
    diff: number;
    adjustedGross: number;
    courseRating: string;
  } | null;
  /** Most recent round date played, ISO-ish string from GHIN. */
  lastPlayedAt: string | null;
  /** Number of distinct courses with at least one posted round. */
  uniqueCourses: number;
}

export interface ProfileHandicapPointDTO {
  /** ISO date string (best effort — score date or revision date). */
  date: string;
  value: number;
  /** Original display string ("+3.6"/"0.4"/"NH"). */
  label: string;
}

export interface GolferProfileDTO {
  id: string;
  ghinNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  handicapIndex: string;
  handicapIndexValue: number;
  lowHandicapIndex: string | null;
  club: string | null;
  association: string | null;
  status: string;
  revisionDate: string | null;
  createdAt: string;
  lastSyncedAt: string;
  trend: 'UP' | 'DOWN' | 'FLAT';
  trendDelta: number;
  stats: ProfileStatsDTO;
  recentScores: ProfileScoreDTO[];
  revisions: ProfileRevisionDTO[];
  handicapHistory: ProfileHandicapPointDTO[];
  courseBreakdown: ProfileCourseStatDTO[];
  events: ProfileFeedEventDTO[];
  /** Most recent active cap on the latest revision row, if any. */
  activeCap: 'SOFT' | 'HARD' | null;
  /** GHIN-derived round distribution + advanced stats, when available. */
  statistics: ProfileStatisticsDTO | null;
}
