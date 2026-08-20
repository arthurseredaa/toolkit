Decisions: ./plan.md

# ZIP size preview — steps

Run from the repo root. **Commit after the task** as `feat(web): <what>`.

| Path | Owns |
|---|---|
| `apps/web/src/lib/selftest/zip-size.ts` | the predicted archive size |
| `apps/web/src/lib/selftest/zip-size.test.ts` | its unit test |

Both are pure — no browser APIs, so jsdom runs them as-is.

---

## Task 1 — zipSize from client-zip metadata

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/selftest/zip-size.ts`,
`apps/web/src/lib/selftest/zip-size.test.ts`

- [ ] **1.1** `zip-size.test.ts` — one case, importing `zipSize` from
      `./zip-size`, with this assertion verbatim:

```ts
expect(zipSize([{ name: 'a.txt', size: 10 }])).toBe(120)
```

      One case only. `plan.md` works out the 120-byte breakdown for exactly
      this input; a second case would need a second number nobody has
      computed.

- [ ] **1.2** `zip-size.ts` — exactly this body:

```ts
import { predictLength } from 'client-zip'

export function zipSize(files: { name: string; size: number }[]): number {
  return predictLength(files)
}
```

      Do not wrap the result in `Number()`, do not cast, do not add
      `@ts-expect-error`, do not change the declared return type.
      `predictLength` returns a `number` — see `plan.md` → API facts — so
      each of those would be hiding a mismatch rather than fixing one. If
      the gates disagree with the plan here, report that; do not work
      around it.
