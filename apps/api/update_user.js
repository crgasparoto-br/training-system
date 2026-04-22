import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = "crgasparoto@gmail.com";
  console.log("Buscando usuario:", email);
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: { professor: { include: { contract: true } } }
  });

  if (!user) {
    console.error("Usuario nao encontrado");
    process.exit(1);
  }

  if (!user.professor) {
    console.error("Usuario nao e um professor");
    process.exit(1);
  }

  const cnpj = Math.floor(Math.random() * 90000000000000 + 10000000000000).toString();
  console.log("Atualizando contrato para academy e role para master");
  
  await prisma.professor.update({
    where: { id: user.professor.id },
    data: {
      role: "master",
      contract: {
        update: {
          type: "academy",
          document: user.professor.contract.document.length < 14 ? cnpj : user.professor.contract.document
        }
      }
    }
  });

  console.log("Update concluido");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
