// Filter choices for the meal list (shared with the user page).
export const STATE_OPTIONS: [string, string][] = [["", "Any state"], ["succeeded", "Succeeded"], ["failed", "Failed"],
  ["retry_wait", "Retrying"], ["needs_clarification", "Needs clarification"], ["running", "Running"], ["queued", "Queued"],
  ["retried", "Took more than one attempt"], ["edited", "Changed by the user"], ["legacy", "Legacy (no operation)"]]
export const ROUTE_OPTIONS: [string, string][] = [["", "Any route"], ["agent", "Agent"], ["text-fast-route", "Text fast route"],
  ["photo-fast-route", "Photo fast route"], ["barcode", "Barcode"], ["structured-action", "Structured edit"]]
export const KIND_OPTIONS: [string, string][] = [["", "Any input"], ["text", "Text"], ["photo", "Photo"], ["voice", "Voice"]]
