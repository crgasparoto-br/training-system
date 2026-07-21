from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"expected snippet not found in {path}")
    target.write_text(source.replace(old, new, 1))


replace(
    "apps/api/src/modules/alunos/assessment-plan-notification.service.ts",
    """      select: {
        id: true,
        user: {
          select: {
            id: true,
          },
        },
        professor: {
          select: {
            contractId: true,
          },
        },
      },""",
    """      select: {
        id: true,
        contractId: true,
        user: {
          select: {
            id: true,
          },
        },
      },""",
)
replace(
    "apps/api/src/modules/prontuario/prontuario.service.ts",
    """  // Issue #268: contractId direto em Aluno é a fonte tenant-scoped correta.
  const resolvedContractId =
    aluno.contractId ||
    aluno.currentStudentContract?.contract.companyContractId ||
    aluno.professor?.contractId;

  if (fallbackContractId && resolvedContractId !== fallbackContractId) {""",
    """  // Issue #268: contractId direto em Aluno é obrigatório e canônico.
  const resolvedContractId = aluno.contractId;

  if (fallbackContractId && resolvedContractId !== fallbackContractId) {""",
)
