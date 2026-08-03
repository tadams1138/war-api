export interface WarLifecycleFields {
  status: string;
  endsAt: Date | null;
}

/**
 * A War is treated as closed the instant `ends_at` passes, regardless of what the
 * `status` column currently holds (spec §6, "Effective Status").
 */
export function effectiveStatus(war: WarLifecycleFields, now: Date): string {
  if (war.endsAt !== null && war.endsAt.getTime() <= now.getTime()) {
    return 'closed';
  }
  return war.status;
}
