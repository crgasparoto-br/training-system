# AI Routing Patch Path Postfix Smoke Test

This file is a non-executable smoke artifact for Delivery V2 issue `#444`.

It exists to validate the following workflow boundaries:

- the worker reads the authoritative issue context from the orchestrator materialized contract
- the scope guard approves only this authorized path
- the threat detection resolves the single materialized `*.patch` deterministically by postfix instead of depending on `aw.patch`
- the resulting pull request contains only this file
- the Delivery V2 release status flow can proceed without a functional code change

Contract snapshot:

- repository: `crgasparoto-br/training-system`
- issue: `#444`
- authoritative issue contract: `/tmp/gh-aw/agent/delivery-v2-target-issue.json`
- base branch: `develop`
- risk: `standard`
- authorized change path: `apps/api/tests/AI_ROUTING_PATCH_PATH_POSTFIX_SMOKE_TEST.md`

No application behavior changes are intended or required by this smoke.
