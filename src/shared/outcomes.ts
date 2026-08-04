/** The individual failure variants domain services can return, exported
 * separately so a service needing only some of them can compose exactly the
 * set it owns rather than importing a type naming states it does not have
 * (design review finding 13). */
export interface NotFound {
  kind: 'notFound';
}
export interface Forbidden {
  kind: 'forbidden';
}
export interface NotDraft {
  kind: 'notDraft';
}
export interface NotActive {
  kind: 'notActive';
}
export interface ValidationError {
  kind: 'validationError';
  errors: string[];
}

/** The common case: not found / not owned / War no longer a draft / invalid input. */
export type MutationFailure = NotFound | Forbidden | NotDraft | ValidationError;

/** A common shape for mutation results shared across domain services. The
 * failure set defaults to the common case but is a parameter, so a service
 * needing a different set (e.g. `NotActive` instead of `NotDraft`) composes
 * its own union instead of the shared type acquiring every state anyone
 * needs, or a bespoke union being declared from scratch. */
export type MutationOutcome<T, F extends { kind: string } = MutationFailure> = { kind: 'ok'; value: T } | F;
