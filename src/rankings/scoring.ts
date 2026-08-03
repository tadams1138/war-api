export interface ScorableContestant {
  id: string;
  name: string;
  winCount: number;
  appearanceCount: number;
}

export interface RankedContestant {
  rank: number | null;
  contestant: ScorableContestant;
}

/**
 * Ranks contestants by raw win count (spec §9). Ties are broken by fewer
 * appearances, then alphabetically by name. Contestants with zero
 * appearances are unranked (`rank: null`) and sort after every ranked
 * contestant.
 */
export function rankContestants(contestants: ScorableContestant[]): RankedContestant[] {
  const ranked = contestants.filter((c) => c.appearanceCount > 0);
  const unranked = contestants.filter((c) => c.appearanceCount === 0);

  const byScore = (a: ScorableContestant, b: ScorableContestant): number =>
    b.winCount - a.winCount || a.appearanceCount - b.appearanceCount || a.name.localeCompare(b.name);

  ranked.sort(byScore);
  unranked.sort((a, b) => a.name.localeCompare(b.name));

  return [
    ...ranked.map((contestant, index) => ({ rank: index + 1, contestant })),
    ...unranked.map((contestant) => ({ rank: null, contestant })),
  ];
}
