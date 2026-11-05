// A setup change a screen refuses: taking the last required item from a published branch (SET-10),
// or deactivating a branch with upcoming bookings. It carries the message to show; the database
// does not enforce these rules.
export class SetupGuardError extends Error {}
