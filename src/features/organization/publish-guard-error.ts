// A change refused because it would take the last required item from a published branch
// (SET-10). It carries the message to show; the database does not enforce this rule.
export class PublishGuardError extends Error {}
