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
- `DELIVERY_V2_RISK_PROFILE` may promote a PR to a higher level but never downgrades observed risk.
- Pull requests validate merge-preview compatibility separately from the exact PR head.
- Push events covered by the workflow always execute `CRITICAL` validation.
- The final required status remains exactly `Validate repository` because the active `main` ruleset depends on that context.
- The executed path emits exact-head evidence in `orquestrador-artifact.json`.
- CI does not merge pull requests automatically.

## FAST regression selection

For `FAST` web changes, changed test files are executed directly and Vitest `related` is used for changed JavaScript/TypeScript source files. CSS/assets are still covered by web type/lint/build as applicable. Access/auth/security paths never enter `FAST`.

## Full regression safety net

The complete database/browser/migration suite is not deleted. It remains mandatory for `CRITICAL` pull requests and for pushes covered by the workflow, so interactions that are not justified on every small PR are still exercised before promotion through the main development flow.
