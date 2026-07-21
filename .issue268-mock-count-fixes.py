from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"expected snippet not found in {path}: {old[:100]!r}")
    target.write_text(source.replace(old, new, 1))


replace(
    "apps/api/tests/profile-review.service.test.ts",
    "const aluno = { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() };",
    "const aluno = { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() };",
)
replace(
    "apps/api/tests/profile-review.service.test.ts",
    "aluno: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };",
    "aluno: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };",
)
replace(
    "apps/api/tests/profile-review.service.test.ts",
    "db.aluno.findFirst.mockImplementation((args: unknown) => db.aluno.findUnique(args));",
    "db.aluno.findFirst.mockImplementation((args: unknown) => db.aluno.findUnique(args));\n  db.aluno.count.mockResolvedValue(1);",
)
replace(
    "apps/api/tests/aluno-assessment-boundary.service.test.ts",
    "findFirst: jest.fn(),\n    },",
    "findFirst: jest.fn(),\n      count: jest.fn(),\n    },",
)
replace(
    "apps/api/tests/aluno-assessment-boundary.service.test.ts",
    "mockTx.aluno.findUniqueOrThrow.mockResolvedValue({ id: 'aluno-1' });",
    "mockTx.aluno.findUniqueOrThrow.mockResolvedValue({ id: 'aluno-1' });\n    mockTx.aluno.count.mockResolvedValue(1);",
)
