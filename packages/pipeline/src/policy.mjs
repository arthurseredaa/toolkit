// The loop's policy: after the worker has run and the gates have been checked,
// what happens next?
//
// This is the deterministic half of the boundary. No model runs here — it is
// plain data in, plain decision out. That is what makes the loop repeatable.
//
// INPUT
//   gateRun.results  array of { name, cmd, status, out }
//                    status is 'passed' | 'failed' | 'skipped' | 'dry-run'
//   round            1-based, which attempt just finished
//   maxRounds        the cap (default 3)
//   task             { number, title, agents, boxes }
//
// OUTPUT — exactly one of:
//   { action: 'accept' }
//       gates are good enough. Tick the checkboxes, commit, next task.
//
//   { action: 'retry', hint }
//       run the worker again. `hint` is appended to its prompt — this is your
//       only channel to steer the next attempt.
//
//   { action: 'stop', reason }
//       give up and hand the tree back to the engineer. `reason` is printed.
//
// QUESTIONS WORTH DECIDING (there is no single right answer):
//   - Does a 'skipped' gate count as passing? A repo with no test script yet
//     will skip `pnpm -F web test` on every task of chunk 01.
//   - Should a failing typecheck be treated like a failing test, or differently?
//   - On the last allowed round, is it worth sending a different hint —
//     "this is your final attempt" — or does that change nothing?
//   - Is there a failure you would rather stop on immediately than retry?

// oxlint-disable-next-line no-unused-vars -- params are used once implemented
export function decideNext({ gateRun, round, maxRounds, task }) {
  // TODO(human): implement the policy described above.
}
