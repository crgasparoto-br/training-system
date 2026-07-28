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
number_helper = """function assessmentDetailNumber(value: string | number | boolean | null) {\n  if (typeof value === 'number') return Number.isFinite(value) ? value : null;\n  if (typeof value !== 'string' || !value.trim()) return null;\n  const parsed = Number(value.replace(',', '.'));\n  return Number.isFinite(parsed) ? parsed : null;\n}\n"""
angular_helper = number_helper + """\nfunction isAngularAssessmentDetail(\n  detail: CapacityAssessmentSourceOption['details'][number]\n) {\n  const descriptor = normalizeAssessmentLabel(detail.label);\n  const unit = normalizeAssessmentLabel(detail.unit ?? '');\n  return (\n    descriptor.includes('angulo') ||\n    descriptor.includes('amplitude') ||\n    unit === 'grau' ||\n    unit === 'graus' ||\n    unit === 'degree' ||\n    unit === 'degrees' ||\n    detail.unit === '°'\n  );\n}\n"""
replace_once(model, number_helper, angular_helper)
replace_once(
    model,
    """  for (const detail of details) {\n    const descriptor = normalizeAssessmentLabel(detail.label);\n""",
    """  for (const detail of details) {\n    if (!isAngularAssessmentDetail(detail)) continue;\n    const descriptor = normalizeAssessmentLabel(detail.label);\n""",
)

model_test = 'apps/web/src/pages/PhysicalAssessment/capacityPrescriptionScreen.model.test.ts'
replace_once(
    model_test,
    """        { label: 'Ângulo do joelho', value: 115, unit: 'graus' },\n""",
    """        { label: 'Ângulo do joelho', value: 115, unit: 'graus' },\n        { label: 'Força do ombro', value: 80, unit: 'kgf' },\n""",
)

api_test = 'apps/api/src/modules/capacity-prescriptions/capacity-prescription-assessment-parameters.test.ts'
replace_once(
    api_test,
    """          {\n            metricKey: 'extensao_dedos_angulo',\n            metricLabel: 'Extensão dos dedos',\n            valueText: '37,5',\n          },\n""",
    """          {\n            metricKey: 'extensao_dedos_angulo',\n            metricLabel: 'Extensão dos dedos',\n            valueText: '37,5',\n          },\n          {\n            metricKey: 'forca_ombro',\n            metricLabel: 'Força do ombro',\n            valueNumber: 80,\n            unit: 'kgf',\n          },\n""",
)

route_test = 'apps/api/tests/capacity-prescription-assessment-parameters.routes.test.ts'
replace_once(
    route_test,
    """            valueNumber: 142,\n            valueText: null,\n""",
    """            valueNumber: 142,\n            valueText: null,\n            unit: 'graus',\n""",
)
