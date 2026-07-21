from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"expected snippet not found in {path}: {old[:100]!r}")
    target.write_text(source.replace(old, new, count))


replace(
    "apps/api/src/modules/alunos/aluno.service.ts",
    "const resolveAlunoCompanyContractId = (alunoLike: {\n  professor?:",
    "const resolveAlunoCompanyContractId = (alunoLike: {\n  contractId?: string | null;\n  professor?:",
)
replace(
    "apps/api/src/modules/alunos/aluno.service.ts",
    "  alunoLike.currentStudentContract?.contract?.companyContractId ||\n  alunoLike.professor?.contractId ||",
    "  alunoLike.contractId ||\n  alunoLike.currentStudentContract?.contract?.companyContractId ||\n  alunoLike.professor?.contractId ||",
)
replace(
    "apps/api/src/modules/prontuario/prontuario.service.ts",
    "  const resolvedContractId =\n    aluno.currentStudentContract?.contract.companyContractId ||\n    aluno.professor?.contractId ||\n    aluno.contractId;",
    "  const resolvedContractId =\n    aluno.contractId ||\n    aluno.currentStudentContract?.contract.companyContractId ||\n    aluno.professor?.contractId;",
)
replace(
    "apps/api/src/modules/alunos/student-financial-contract.service.ts",
    "  const scopedContractId =\n    currentAluno.currentStudentContract?.contract.companyContractId ||\n    currentAluno.professor?.contractId ||\n    currentAluno.contractId;",
    "  const scopedContractId =\n    currentAluno.contractId ||\n    currentAluno.currentStudentContract?.contract.companyContractId ||\n    currentAluno.professor?.contractId;",
)
replace(
    "apps/api/src/modules/alunos/profile-review.service.ts",
    "    if (!aluno.professor) {\n      throw new Error('Aluno ainda não possui professor vinculado (registro incompleto)');\n    }\n\n    const [settings, policy]",
    "    const [settings, policy]",
)
replace(
    "apps/api/src/modules/alunos/profile-review.service.ts",
    "contractId: aluno.professor.contractId,",
    "contractId: aluno.contractId,",
)
replace(
    "apps/api/src/modules/alunos/profile-review.service.ts",
    "    if (!review.aluno.professor) {\n      throw new Error('Aluno ainda não possui professor vinculado (registro incompleto)');\n    }\n\n    const now",
    "    const now",
)
replace(
    "apps/api/src/modules/alunos/profile-review.service.ts",
    "contractId: review.aluno.professor.contractId,",
    "contractId: review.aluno.contractId,",
)
replace(
    "apps/api/src/modules/alunos/profile-review-dispatch.service.ts",
    "        id: true,\n        createdAt: true,\n        user:",
    "        id: true,\n        contractId: true,\n        createdAt: true,\n        user:",
)
replace(
    "apps/api/src/modules/alunos/profile-review-dispatch.service.ts",
    "      // Issue #268: aluno ativo sempre tem professor e conta vinculados;\n      // filtro status: ACTIVE_STUDENT acima já exclui leads incompletos.\n      if (!aluno.professor || !aluno.user) continue;",
    "      if (!aluno.user) continue;",
)
replace(
    "apps/api/src/modules/alunos/profile-review-dispatch.service.ts",
    "contractId: aluno.professor.contractId,",
    "contractId: aluno.contractId,",
)
replace(
    "apps/api/src/modules/alunos/assessment-plan-notification.service.ts",
    "      select: {\n        id: true,\n        user:",
    "      select: {\n        id: true,\n        contractId: true,\n        user:",
)
replace(
    "apps/api/src/modules/alunos/assessment-plan-notification.service.ts",
    "      // Issue #268: aluno ativo sempre tem professor; leads (sem professor)\n      // já são excluídos pelo filtro status: ACTIVE_STUDENT acima.\n      if (!aluno.professor) continue;\n      try {\n        const created = await this.dispatchForAluno(aluno.id, aluno.professor.contractId, {",
    "      try {\n        const created = await this.dispatchForAluno(aluno.id, aluno.contractId, {",
)
replace(
    "apps/api/tests/profile-review-dispatch.service.test.ts",
    "    createdAt: new Date('2025-01-01'),\n    user:",
    "    contractId: CONTRACT_ID,\n    createdAt: new Date('2025-01-01'),\n    user:",
)
replace(
    "apps/api/tests/profile-review-dispatch.service.test.ts",
    "    professor: { contractId: CONTRACT_ID },",
    "    professor: { contractId: 'legacy-professor-contract' },",
)
