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
- The executed path emits repository-owned exact-head evidence in `ci-validation-evidence.json`.
- CI does not merge pull requests automatically.

## FAST regression selection

For `FAST` web changes, changed test files are executed directly and Vitest `related` is used for changed JavaScript/TypeScript source files. CSS/assets are still covered by web type/lint/build as applicable. Access/auth/security paths never enter `FAST`.

## Full regression safety net

The complete database/browser/migration suite is not deleted. It remains mandatory for `CRITICAL` pull requests and for pushes covered by the workflow, so interactions that are not justified on every small PR are still exercised before promotion through the main development flow.

## Repository ownership and rollback

- Canonical classification policy: `config/ci-risk-policy.json`. Evaluator: `scripts/ci-risk-profile.mjs` and `scripts/ci-repository-risk-policy.mjs`.
- Workflow adapter: `scripts/ci-risk-classifier.mjs`; regression tests: `scripts/ci-risk-classifier.test.mjs`.
- No dependency on the Delivery V2 or an external repository is required at CI runtime. No AI/skills are executed in GitHub Actions.
- Run classification regressions with `node --test scripts/ci-risk-classifier.test.mjs`. Workflow changes are always CRITICAL, so the exact-head full gate and PostgreSQL/migration checks must succeed before promotion.
- During rollout, preserve the exact job check context `Validate repository` in branch protection. Confirm that it is emitted and succeeds for a fresh PR against `develop` and for the protected promotion path. Never remove the required check before a replacement is proven.
- Merge preview uses the GitHub synthetic merge commit and checks both the PR base and head parents. Execution gates check out the exact PR head SHA.
- Rollback if classification, preview, full regressions or branch protection behavior regresses: do not merge; revert the migration commit/PR on the candidate branch and re-run the original `Validate PR` workflow; preserve the same `Validate repository` status context and check its exact SHA before resuming promotion. Do not force-push protected branches or disable required status checks.
- Legacy `.delivery-v2/` files may be removed in a separate cleanup only after a green independent CI path and documented rollback evidence; keeping them during initial rollout is intentional, but the new workflow and classifier must not import them.
