/** A common shape for mutation results shared across domain services. */
export type MutationOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'notFound' }
  | { kind: 'forbidden' }
  | { kind: 'notDraft' }
  | { kind: 'validationError'; errors: string[] };
