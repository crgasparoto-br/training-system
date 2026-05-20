const demoUsers = [
  { email: 'master@demo.com', role: 'master', description: 'Acesso total ao contrato' },
  { email: 'manager@demo.com', role: 'professor', functionCode: 'manager', description: 'Gestor com acesso ampliado' },
  { email: 'professor@demo.com', role: 'professor', functionCode: 'professor', description: 'Professor com escopo proprio' },
  { email: 'administrativo@demo.com', role: 'professor', functionCode: 'administrative', description: 'Administrativo com financeiro/contratos' },
  { email: 'aluno@demo.com', role: 'student', description: 'Aluno para validacao futura do app' },
];

console.log('Usuarios demo planejados para o harness local:');
for (const user of demoUsers) {
  console.log(`- ${user.email} (${user.role}${user.functionCode ? `/${user.functionCode}` : ''}): ${user.description}`);
}

console.log('\nEste script e intencionalmente nao-destrutivo.');
console.log('Proximo passo recomendado: integrar estes usuarios ao seed real quando os modelos de usuario/contrato estiverem estabilizados.');
