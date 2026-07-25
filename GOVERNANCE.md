# Governance

Tsumugu is currently maintained under a lightweight, maintainer-led governance model suitable for an experimental project.

## Project authority

Maintainers are responsible for:

- protecting the project's design principles;
- reviewing and merging changes;
- managing releases and security responses;
- maintaining public API stability;
- keeping package boundaries explicit;
- ensuring contributors receive clear, respectful feedback;
- documenting significant technical decisions.

The project principles take precedence over short-term convenience or feature count.

## Decision making

Routine changes are decided through issue and pull request review. Significant architecture or public API changes require an RFC.

Maintainers should seek consensus. When consensus cannot be reached, the repository owner makes the final decision and records the rationale.

## RFC process

An RFC should include:

- summary;
- motivation and user problem;
- detailed design;
- package ownership;
- public API impact;
- compatibility and migration;
- security implications;
- performance implications;
- alternatives considered;
- unresolved questions;
- prototype or usage evidence where applicable.

An accepted RFC authorizes a direction, not an unconditional implementation. Pull requests must still meet quality, testing, and architecture requirements.

## Architecture Decision Records

ADRs record decisions that have been accepted and explain their context, alternatives, consequences, and follow-up work. RFCs are proposals; ADRs are historical decisions. The two should not be conflated.

## Releases

Only maintainers may publish official packages and create releases. Releases must follow the documented versioning and changeset process once package publication begins.

Public API compatibility is governed by semantic versioning. Internal APIs are not compatibility commitments.

## Security decisions

Potential vulnerabilities are handled privately until a mitigation or disclosure plan is ready. Security fixes may use an accelerated review process, but their rationale and user-facing impact should be documented after disclosure is safe.

## Becoming a maintainer

Maintainer status is earned through sustained contributions that demonstrate:

- sound technical judgment;
- respect for the project's principles;
- reliable review and follow-through;
- constructive communication;
- care for security, compatibility, and contributor experience.

Maintainers are invited by existing maintainers. The process should become more formal if the maintainer group grows.

## Conflicts of interest

Maintainers should disclose material conflicts that could affect technical or governance decisions and recuse themselves when appropriate.

## Amendments

This governance model may be changed through an RFC. Changes should remain proportionate to the project's size and avoid process for its own sake.
