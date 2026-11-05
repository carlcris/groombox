// PostgREST types every view column as nullable. Columns that come from NOT NULL table columns are
// narrowed here; a null means the view and the schema have drifted, so it fails loudly.
export function requireViewColumn<Value>(value: Value | null, column: string): Value {
  if (value === null) throw new Error(`View column ${column} was null.`);
  return value;
}
