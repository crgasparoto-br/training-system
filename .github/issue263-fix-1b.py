from pathlib import Path

ROOT = Path.cwd()
for relative in ("apps/api/prisma/schema.prisma", "prisma/schema.prisma"):
    path = ROOT / relative
    text = path.read_text()
    text = text.replace(
        "  aluno                Aluno               @relation(fields: [alunoId], references: [id], onDelete: Cascade)\n",
        "  aluno                Aluno?              @relation(fields: [alunoId], references: [id], onDelete: Cascade)\n"
        "  collaborator         Professor?          @relation(\"ContractCollaborator\", fields: [collaboratorId], references: [id], onDelete: Restrict)\n",
    )
    text = text.replace(
        "  professor            Professor?          @relation(fields: [professorId], references: [id], onDelete: SetNull)\n",
        "  professor            Professor?          @relation(\"ContractResponsibleProfessor\", fields: [professorId], references: [id], onDelete: SetNull)\n",
    )
    path.write_text(text)

if (ROOT / "apps/api/prisma/schema.prisma").read_text() != (ROOT / "prisma/schema.prisma").read_text():
    raise RuntimeError("Canonical Prisma schemas differ after relation patch")
