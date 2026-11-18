// Pure decision table for the background auto-follow check, kept separate so
// every combination is covered by tests.
//
// Inputs:
//   autoFollow  "auto" | "ask" | "off"
//   updated     the installed client no longer matches the localized build
//   running     the client process is running
//   postQuit    triggered by the client's own quit (e.g. "restart to update")
//   declined    the user already said "no" to this exact build
//
// Actions:
//   none              do nothing
//   localize          localize silently now (client is not running)
//   take-over         localize the client the updater just relaunched
//   wait-then-localize wait until the user closes the client, then localize
//   ask               show the "update detected, localize now?" dialog
export function decideAutoFollow({ autoFollow, updated, running, postQuit = false, declined = false }) {
  if (autoFollow === "off" || !updated) return "none";
  if (autoFollow === "ask") return declined ? "none" : "ask";
  if (!running) return "localize";
  return postQuit ? "take-over" : "wait-then-localize";
}
