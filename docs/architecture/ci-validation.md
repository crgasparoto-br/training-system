# CI validation policy

The `Validate PR` workflow uses deterministic risk classification to keep small changes fast without removing the full regression safety net.

## Risk profiles

| Profile | Typical changes | Required validation |
| --- | --- | --- |
| `FAST` | isolated web components/pages, styles, assets, ordinary docs | merge-preview type compatibility, exact-head web type-check/lint, related Vitest tests, affected web build, architecture/docs checks when applicable |
| `STANDARD` | ordinary application logic outside sensitive boundaries | merge-preview type compatibility, exact-head type-check, lint, non-database test suite, build, architecture, access catalog and documentation checks |
| `CRITICAL` | Prisma/migrations/database, auth/access/security/privacy, shared packages, CI/workflows, dependency/config changes, critical validation scripts, unknown paths | complete historical gate including PostgreSQL, migrations, ADPT/lifecycle regressions, full tests, build, real-browser validation, architecture, access and docs |

## Safety rules

- Classification is path-based and deterministic; no LLM decides the CI level.
- Unknown paths fail closed to `CRITICAL`.
- `FAST` is an explicit allowlist, not an extension-based default. Static/image/style extensions only inherit `FAST` when the path is already inside a trusted web/documentation root; an unknown `.svg`, `.png`, `.css` or similar path remains `CRITICAL`.
- Known frontend authentication/access/session entrypoints are checked before the general web allowlists. Sensitive filenames such as route guards, login/sign-in pages and auth/session stores remain `CRITICAL` even when they live under `components`, `pages` or `stores`.
- `CI_RISK_PROFILE` may promote a PR to a higher level but never downgrades observed risk.
- Pull requests validate merge-preview compatibility separately from the exact PR head.
- Push events covered by the workflow always execute `CRITICAL` validation.
- The final required status remains exactly `Validate repository` because the active `main` ruleset depends on that context.
- The executed path emits exact-head evidence in `ci-validation-evidence.json`.
- CI does not merge pull requests automatically.

## FAST regression selection

For `FAST` web changes, changed test files are executed directly and Vitest `related` is used for changed JavaScript/TypeScript source files. CSS/assets are still covered by web type/lint/build as applicable. Access/auth/security paths never enter `FAST`.

## Full regression safety net

The complete database/browser/migration suite is not deleted. It remains mandatory for `CRITICAL` pull requests and for pushes covered by the workflow, so interactions that are not justified on every small PR are still exercised before promotion through the main development flow.

## Local policy and independence

Risk classification is owned by `scripts/ci-risk-policy.json`, `scripts/ci-risk-profile.mjs`, and `scripts/ci-repository-risk-policy.mjs`, invoked by `scripts/delivery-v2-ci-classifier.mjs` (compatibility entrypoint, not an orchestrator dependency). The workflow uses only files in this repository and does not invoke AI or remote skills. The local policy replaces the generated orchestrator policy and lock as the active source of truth. CI risk rule changes are themselves CRITICAL.

The legacy `.delivery-v2/` package and lock are retained temporarily for rollback only. They are not imported, executed, or verified by the active Validate PR workflow. Remove those legacy files in a separate reviewed change only after an exact-head successful run confirms the replacement. Do not re-enable the legacy package implicitly.

### Verification and rollback

1. Run `node --test scripts/delivery-v2-ci-classifier.test.mjs` against the proposed commit; check sensitive paths, unknown paths, and requested risk promotion.
2. Open a PR against `develop`; confirm the CRITICAL path executes its PostgreSQL, migrations, authentication/access, full tests, browser, merge-preview, and exact-head gates.
3. Verify the required GitHub status context remains exactly `Validate repository` and is successful for the exact PR head SHA. Recheck branch protection before promotion to `main`.
4. If a regression occurs, revert the workflow, classifier, tests, and local policy changes together to the previous known-good commit via a new PR. The retained `.delivery-v2/` files support investigation but must never be treated as proof that the new workflow passed. Do not bypass required checks or merge automatically.


### Evidence matrix and branch protection checklist

A successful CRITICAL run on the migration PR demonstrates the CRITICAL path only. The classifier unit tests cover FAST, STANDARD, CRITICAL, combined path precedence, explicit promotion and fail-closed behavior, but do not substitute for end-to-end FAST and STANDARD workflow runs. Before merging, create representative non-sensitive FAST and STANDARD PRs targeting `develop` (or use existing qualifying runs); verify that each selects only its corresponding gate, that merge preview passes, and that `Validate repository` succeeds on the exact PR head SHA. Record links to both runs in the migration PR.

Branch protection/rulesets must be reviewed in GitHub repository Settings > Rules > Rulesets (and legacy Branches rules when applicable) for both `develop` and `main`. Confirm the required status check is spelled **`Validate repository`** and is reported by the expected GitHub Actions app; do not add per-profile job names as mandatory contexts, because two profiles are skipped by design. Confirm the rule applies to the intended branches and prevents unvalidated merging. Capture the rule identifier or a settings screenshot in the PR review; a passing job alone cannot establish which status contexts branch protection requires.

After each amendment to the PR, re-check the **new** head SHA and its workflow run; a prior green SHA is not sufficient. Changes to this document or the classifier also require the CRITICAL path. Do not remove `.delivery-v2/` as part of this evidence-only follow-up; treat its eventual removal as a separate reviewed change.
