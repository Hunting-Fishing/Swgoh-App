# GAC Tactical Source Packs — v1 Release Classification

Release date: 2026-08-21

## B03 — 3v3 tactical source pack

**Release state: source-blocked-production-safe.**

The 3v3 research pipeline exists and contains reviewed candidates, but those candidates remain quarantined because at least one required promotion fact is still unverified. The production strategy catalog therefore remains empty.

Current 3v3 research may establish matchup relevance, exact historical composition, canonical Base IDs, or recent tactical context. It may **not** promote execution guidance unless the same record also has explicit Datacron scope, current-version validity, and a source-supported move/target sequence.

This is intentional fail-closed behavior. The application continues to provide historical counter evidence, roster-fit planning, Datacron risk analysis, execution confirmation, and cleanup without inventing an opener or kill order.

## B04 — 5v5 tactical source pack

**Release state: source-blocked-production-safe.**

The dedicated artifact `public/data/gac-strategy-source-candidates-5v5.json` defines the 5v5 quarantine state. It contains zero candidates at v1 release because no reviewed 5v5 source record currently satisfies every promotion requirement.

An empty candidate list is not interpreted as “no tactics exist.” It means “no tactic has crossed this application's evidence threshold yet.”

## Promotion requirements

A tactic may enter `public/data/gac-strategy-records.json` only when all of the following are true:

1. Canonical Base IDs are verified against current game data.
2. Defender composition is exact.
3. Attacker composition is exact; truthful undersized attacks are allowed.
4. Source provenance and source date are captured.
5. Current-version validity is reviewed.
6. Attacker Datacron scope is explicit.
7. Defender Datacron scope is explicit.
8. The execution sequence is supported by the reviewed source and paraphrased safely.
9. Copyright/paraphrase review is complete.
10. The source-audit pipeline reports the candidate safe for promotion.

`presence: "any"` for a Datacron is an explicit source claim. It must never be used as a substitute for unknown Datacron evidence.

## v1 production catalog

At release, the approved production strategy catalog contains **zero records**. This is a valid and safe production configuration. Exact-match execution guidance stays locked until approved records are added later.
