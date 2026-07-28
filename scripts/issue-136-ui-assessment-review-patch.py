from pathlib import Path


def replace_once(path: str, needle: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if replacement in text:
        return
    if needle not in text:
        raise SystemExit(f'insertion point not found: {path}')
    target.write_text(text.replace(needle, replacement, 1), encoding='utf-8')


model = 'apps/web/src/pages/PhysicalAssessment/capacityPrescriptionScreen.model.ts'
replace_once(
    model,
    "  description?: string | null;\n  ref: CapacityPrescriptionSourceRef;\n",
    "  description?: string | null;\n  assessmentDetails?: CapacityAssessmentSourceOption['details'];\n  ref: CapacityPrescriptionSourceRef;\n",
)

helper_anchor = '''function formatAssessmentDetails(source: CapacityAssessmentSourceOption) {\n  const details = source.details\n    .filter((item) => item.value !== null && item.value !== undefined && item.value !== '')\n    .slice(0, 4)\n    .map((item) => `${item.label}: ${String(item.value)}${item.unit ? ` ${item.unit}` : ''}`);\n  return [source.category, source.status, ...details].filter(Boolean).join(' · ');\n}\n'''
helper_replacement = helper_anchor + '''\nconst flexibilityArticulationAliases = [\n  { name: 'Coluna cervical', aliases: ['coluna_cervical', 'cervical', 'pescoco'] },\n  { name: 'Ombro', aliases: ['ombro'] },\n  { name: 'Cotovelo', aliases: ['cotovelo'] },\n  { name: 'Punho', aliases: ['punho'] },\n  { name: 'Dedos', aliases: ['dedos', 'dedo'] },\n  { name: 'Quadril', aliases: ['quadril'] },\n  { name: 'Joelho', aliases: ['joelho'] },\n  { name: 'Tornozelo', aliases: ['tornozelo'] },\n] as const;\n\nfunction normalizeAssessmentLabel(value: string) {\n  return value\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, '_')\n    .replace(/^_+|_+$/g, '');\n}\n\nfunction assessmentDetailNumber(value: string | number | boolean | null) {\n  if (typeof value === 'number') return Number.isFinite(value) ? value : null;\n  if (typeof value !== 'string' || !value.trim()) return null;\n  const parsed = Number(value.replace(',', '.'));\n  return Number.isFinite(parsed) ? parsed : null;\n}\n\nexport function mergeFlexibilityArticulationsFromAssessmentDetails(\n  current: FlexibilityArticulationParameters[],\n  details: CapacityAssessmentSourceOption['details']\n): FlexibilityArticulationParameters[] {\n  const merged = current.map((item) => ({ ...item }));\n  const indexByName = new Map(\n    merged.map((item, index) => [normalizeAssessmentLabel(item.name), index])\n  );\n\n  for (const detail of details) {\n    const descriptor = normalizeAssessmentLabel(detail.label);\n    const articulation = flexibilityArticulationAliases.find((candidate) =>\n      candidate.aliases.some((alias) => descriptor.includes(alias))\n    );\n    const angle = assessmentDetailNumber(detail.value);\n    if (!articulation || angle === null) continue;\n\n    const normalizedName = normalizeAssessmentLabel(articulation.name);\n    const existingIndex = indexByName.get(normalizedName);\n    if (existingIndex !== undefined) {\n      const existing = merged[existingIndex];\n      if (existing.angle === null || existing.angle === undefined) {\n        merged[existingIndex] = { ...existing, angle };\n      }\n      continue;\n    }\n\n    indexByName.set(normalizedName, merged.length);\n    merged.push({ name: articulation.name, angle, priority: 'medium' });\n  }\n\n  return merged;\n}\n'''
replace_once(model, helper_anchor, helper_replacement)
replace_once(
    model,
    "      description: formatAssessmentDetails(assessment),\n      ref: assessment.ref,\n",
    "      description: formatAssessmentDetails(assessment),\n      assessmentDetails: assessment.details,\n      ref: assessment.ref,\n",
)

screen = 'apps/web/src/pages/PhysicalAssessment/CapacityPrescriptionScreen.tsx'
replace_once(
    screen,
    "  mergeTechnicalSourceSuggestions,\n  type CapacityDrafts,\n",
    "  mergeFlexibilityArticulationsFromAssessmentDetails,\n  mergeTechnicalSourceSuggestions,\n  type CapacityDrafts,\n",
)
old_toggle = '''  const toggleTechnicalSource = (key: string) => {\n    setSelectedSourceKeys((current) => {\n      const nextForCapacity = new Set(current[activeCapacity]);\n      if (nextForCapacity.has(key)) nextForCapacity.delete(key);\n      else nextForCapacity.add(key);\n      return { ...current, [activeCapacity]: nextForCapacity };\n    });\n  };\n'''
new_toggle = '''  const toggleTechnicalSource = (key: string) => {\n    const source = activeTechnicalSources.find((item) => item.key === key);\n    const selecting = !activeSelectedSourceKeys.has(key);\n\n    setSelectedSourceKeys((current) => {\n      const nextForCapacity = new Set(current[activeCapacity]);\n      if (nextForCapacity.has(key)) nextForCapacity.delete(key);\n      else nextForCapacity.add(key);\n      return { ...current, [activeCapacity]: nextForCapacity };\n    });\n\n    if (\n      selecting &&\n      activeCapacity === 'flexibility' &&\n      source?.assessmentDetails?.length\n    ) {\n      setDrafts((current) => ({\n        ...current,\n        flexibility: {\n          ...current.flexibility,\n          flexibilityArticulations:\n            mergeFlexibilityArticulationsFromAssessmentDetails(\n              current.flexibility.flexibilityArticulations,\n              source.assessmentDetails ?? [],\n            ),\n        },\n      }));\n    }\n  };\n'''
replace_once(screen, old_toggle, new_toggle)

model_test = Path('apps/web/src/pages/PhysicalAssessment/capacityPrescriptionScreen.model.test.ts')
model_test_text = model_test.read_text(encoding='utf-8')
if 'mergeFlexibilityArticulationsFromAssessmentDetails' not in model_test_text:
    model_test_text = model_test_text.replace(
        "  mergeTechnicalSourceSuggestions,\n",
        "  mergeFlexibilityArticulationsFromAssessmentDetails,\n  mergeTechnicalSourceSuggestions,\n",
        1,
    )
if "preenche ângulos da avaliação" not in model_test_text:
    insertion = r'''

  it('preenche ângulos da avaliação sem sobrescrever revisão manual', () => {
    const result = mergeFlexibilityArticulationsFromAssessmentDetails(
      [{ name: 'Ombro', angle: 150, priority: 'high' }],
      [
        { label: 'Flexão de ombro', value: 142, unit: 'graus' },
        { label: 'Extensão dos dedos', value: '37,5', unit: 'graus' },
        { label: 'Ângulo do joelho', value: 115, unit: 'graus' },
      ],
    );

    expect(result).toEqual([
      { name: 'Ombro', angle: 150, priority: 'high' },
      { name: 'Dedos', angle: 37.5, priority: 'medium' },
      { name: 'Joelho', angle: 115, priority: 'medium' },
    ]);
  });
'''
    closing = '\n});\n'
    position = model_test_text.rfind(closing)
    if position < 0:
        raise SystemExit('model test closing not found')
    model_test_text = model_test_text[:position] + insertion + model_test_text[position:]
model_test.write_text(model_test_text, encoding='utf-8')

screen_test = Path('apps/web/src/pages/PhysicalAssessment/CapacityPrescriptionScreen.test.tsx')
screen_test_text = screen_test.read_text(encoding='utf-8')
if "exibe ângulo derivado" not in screen_test_text:
    insertion = r'''

  it('exibe ângulo derivado para revisão ao selecionar a avaliação', async () => {
    const user = userEvent.setup();
    mocks.listAssessmentSources.mockResolvedValueOnce([
      {
        ref: {
          type: 'flexibility_assessment',
          id: 'flex-assessment-1',
          label: 'Flexibilidade de ombro',
          origin: 'FLEX-001',
          responsibleProfessorId: 'professor-a',
        },
        category: 'flexibility',
        status: 'completed',
        details: [{ label: 'Flexão de ombro', value: 142, unit: 'graus' }],
      },
    ]);

    render(<CapacityPrescriptionScreen />);
    await user.selectOptions(await screen.findByLabelText('Aluno'), 'aluno-b');
    await user.click(await screen.findByRole('tab', { name: /Flexibilidade/i }));
    await user.click(
      await screen.findByRole('checkbox', { name: /Flexibilidade de ombro/i }),
    );

    expect(await screen.findByText('Ombro')).toBeInTheDocument();
    expect(screen.getByLabelText('Ângulo avaliado')).toHaveValue(142);
  });
'''
    closing = '\n});\n'
    position = screen_test_text.rfind(closing)
    if position < 0:
        raise SystemExit('screen test closing not found')
    screen_test_text = screen_test_text[:position] + insertion + screen_test_text[position:]
screen_test.write_text(screen_test_text, encoding='utf-8')

replace_once(
    'docs/product/capacity-prescription-runtime-invariants.md',
    "Quando uma versão manual de **Flexibilidade** referencia avaliações físicas selecionadas pelo professor, o backend procura medições numéricas associadas às articulações suportadas e preenche ângulos ainda vazios. Valores já revisados manualmente pelo professor prevalecem. O preenchimento automático nunca publica treino nem substitui a validação profissional.\n",
    "Quando uma versão manual de **Flexibilidade** referencia avaliações físicas selecionadas pelo professor, a interface preenche imediatamente as articulações e os ângulos reconhecidos para revisão antes do versionamento. O backend repete a derivação como defesa de fronteira e preenche somente ângulos ainda vazios. Valores já revisados manualmente pelo professor prevalecem. O preenchimento automático nunca publica treino nem substitui a validação profissional.\n",
)
