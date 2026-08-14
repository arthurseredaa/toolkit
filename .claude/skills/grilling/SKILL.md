---
name: grilling
description: Use when the user wants a plan, decision, or idea stress-tested before committing — asks to be grilled, interviewed, challenged, or to have holes poked in their thinking.
---

# Grilling

Interview the user relentlessly about every aspect of the topic until you reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask questions **one at a time**, waiting for feedback on each before continuing. Asking several at once is bewildering.

If a *fact* can be found by exploring the environment (filesystem, tools, docs), look it up rather than asking. The *decisions* are the user's — put each one to them and wait.

## The gate

**Do not act on any of it until the user confirms you have reached shared understanding.**

Not "start implementing." Not "just the first file." Not "sketch it in code so we have something concrete." Not writing the plan to a file — a written plan pre-commits the branches you have not walked.

Reading, searching, and running read-only commands are always fine. Prefer them.

**Sometimes the missing fact only exists by running something** — a benchmark, a spike. Ask: would the artifact contain the answer, or my guess? Numbers you would have to invent are outputs of the decision, not inputs. If the measurement is real, name it as its own step and get agreement to that scoped artifact.

### These are not confirmation

| What the user says | What it actually is |
|---|---|
| "Just go" / "ship it" / "I'm out of time" | Delegation under time pressure. The open questions still exist; they stopped choosing. |
| "You clearly know how this goes" | Flattery. Transfers responsibility, not agreement. |
| "Not much left to decide" | A claim about the tree. Check it against the branches you have not walked. |
| "That all sounds right" | Agreement with the answers so far, not that the interview is over. |

**"They revoked their own gate" is the rationalization to watch for.** It feels like respecting autonomy. They asked to be grilled *because* in the moment they will want to skip ahead — honoring the request means holding the gate when they push on it.

**"The scope is small enough that acting is survivable" is not confirmation either.** Scope changes the cost of being wrong, not whether you agree.

### What confirmation is

Every branch walked and answered, and the user says so when nothing is pending. If you cannot name the remaining branches, the tree is done — say that and ask them to confirm. Holding the gate past a real ending is its own failure.

### When they push

Name it, then hand the decision back:

> That skips the gate. Still open: [unwalked branches]. Want me to pick answers and proceed on my judgment, or keep going?

Listing the open branches is status, not questions — the one-at-a-time rule still applies to the actual ask.

If they say "pick and proceed" — valid instruction, still not shared understanding. Proceed, and state plainly which decisions were yours.

## Red flags

- About to write a file mid-interview
- "The rest is standard, I can answer it myself"
- "They said go, so the gate is lifted"
- "It's only a few files, low risk"
- Batching questions "to save them time"

**All of these mean: stop. Ask the next single question, or name the gate.**
