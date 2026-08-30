# specs

The full specification for this repo is centralized in the sibling `war-infra` repo:
[`war-infra/specs/war-api-spec.md`](https://github.com/tadams1138/war-infra/blob/master/specs/war-api-spec.md).
Its §15 ("Implementation Status") tracks what's actually built here versus what the
document specifies but this repo hasn't implemented yet.

This repo used to keep its own narrower, repo-local copy of that document (adapted to the
"Core Voting Loop" slice). It was folded back into the canonical spec's §15 to remove a
second document that could silently drift from the first — two prose descriptions of the
same behavior, hand-maintained separately, with nothing forcing them to agree.

`features/*.feature` below is **not** a copy of anything — it's this repo's executable
Gherkin, bound to the acceptance tests via `@amiceli/vitest-cucumber` and run by `npm
test`. It covers only the scenarios for what's actually implemented (a subset of the
canonical spec's §14), and it's the one place where a spec/reality mismatch would actually
break CI rather than silently going stale.
