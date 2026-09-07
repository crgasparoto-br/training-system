export type DiscomfortType = 'peso' | 'formigamento' | 'agulhada' | 'dor';

export type BodyDiscomfortEntry = {
  regionId: string;
  regionName: string;
  discomfortTypes: DiscomfortType[];
  intensity: number;
  notes?: string;
};

export type BodyRegionShape =
  | {
      kind: 'ellipse';
      cx: number;
      cy: number;
      rx: number;
      ry: number;
    }
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | {
      kind: 'path';
      d: string;
    };

export type BodyRegion = {
  id: string;
  number: string;
  name: string;
  labelX: number;
  labelY: number;
  shape: BodyRegionShape;
};

export const DISCOMFORT_TYPE_OPTIONS: { value: DiscomfortType; label: string }[] = [
  { value: 'peso', label: 'Peso' },
  { value: 'formigamento', label: 'Formigamento' },
  { value: 'agulhada', label: 'Agulhada' },
  { value: 'dor', label: 'Dor' },
];

// ─── FRONT VIEW (anterior) ───────────────────────────────────────────────────
// Image dimensions: 400 × 600 px
// Coordinates calibrated to body-front.png; image and regions share one SVG viewBox.
// Center x ≈ 200
export const BODY_REGIONS_FRONT: BodyRegion[] = [
  // Head
  {
    id: '0', number: '0', name: 'Cabeça',
    labelX: 200, labelY: 65,
    shape: { kind: 'ellipse', cx: 200, cy: 65, rx: 23, ry: 34 },
  },
  // Neck
  {
    id: '1', number: '1', name: 'Pescoço',
    labelX: 200, labelY: 110,
    shape: { kind: 'ellipse', cx: 200, cy: 110, rx: 16, ry: 12 },
  },
  // Right shoulder (anatomical right = image left)
  {
    id: '6', number: '6', name: 'Ombro Direito',
    labelX: 145, labelY: 143,
    shape: { kind: 'ellipse', cx: 145, cy: 143, rx: 18, ry: 20 },
  },
  // Left shoulder (anatomical left = image right)
  {
    id: '7', number: '7', name: 'Ombro Esquerdo',
    labelX: 255, labelY: 143,
    shape: { kind: 'ellipse', cx: 255, cy: 143, rx: 18, ry: 20 },
  },
  // Chest / thorax
  {
    id: 'chest', number: 'T', name: 'Tórax',
    labelX: 200, labelY: 166,
    shape: { kind: 'ellipse', cx: 200, cy: 166, rx: 39, ry: 24 },
  },
  // Abdomen
  {
    id: 'abdomen', number: 'Ab', name: 'Abdômen',
    labelX: 200, labelY: 236,
    shape: { kind: 'ellipse', cx: 200, cy: 236, rx: 33, ry: 38 },
  },
  // Right upper arm (image left)
  {
    id: '8', number: '8', name: 'Braço Direito',
    labelX: 136, labelY: 189,
    shape: { kind: 'ellipse', cx: 136, cy: 189, rx: 13, ry: 22 },
  },
  // Left upper arm (image right)
  {
    id: '9', number: '9', name: 'Braço Esquerdo',
    labelX: 264, labelY: 189,
    shape: { kind: 'ellipse', cx: 264, cy: 189, rx: 13, ry: 22 },
  },
  // Right elbow
  {
    id: '10', number: '10', name: 'Cotovelo Direito',
    labelX: 125, labelY: 220,
    shape: { kind: 'ellipse', cx: 125, cy: 220, rx: 13, ry: 12 },
  },
  // Left elbow
  {
    id: '11', number: '11', name: 'Cotovelo Esquerdo',
    labelX: 275, labelY: 220,
    shape: { kind: 'ellipse', cx: 275, cy: 220, rx: 13, ry: 12 },
  },
  // Right forearm
  {
    id: '12', number: '12', name: 'Antebraço Direito',
    labelX: 115, labelY: 258,
    shape: { kind: 'ellipse', cx: 115, cy: 258, rx: 12, ry: 23 },
  },
  // Left forearm
  {
    id: '13', number: '13', name: 'Antebraço Esquerdo',
    labelX: 285, labelY: 258,
    shape: { kind: 'ellipse', cx: 285, cy: 258, rx: 12, ry: 23 },
  },
  // Right wrist
  {
    id: '14', number: '14', name: 'Punho Direito',
    labelX: 101, labelY: 291,
    shape: { kind: 'ellipse', cx: 101, cy: 291, rx: 10, ry: 10 },
  },
  // Left wrist
  {
    id: '15', number: '15', name: 'Punho Esquerdo',
    labelX: 299, labelY: 291,
    shape: { kind: 'ellipse', cx: 299, cy: 291, rx: 10, ry: 10 },
  },
  // Right hand
  {
    id: '16', number: '16', name: 'Mão Direita',
    labelX: 94, labelY: 319,
    shape: { kind: 'ellipse', cx: 94, cy: 319, rx: 14, ry: 20 },
  },
  // Left hand
  {
    id: '17', number: '17', name: 'Mão Esquerda',
    labelX: 306, labelY: 319,
    shape: { kind: 'ellipse', cx: 306, cy: 319, rx: 14, ry: 20 },
  },
  // Right thigh
  {
    id: '18', number: '18', name: 'Coxa Direita',
    labelX: 173, labelY: 353,
    shape: { kind: 'ellipse', cx: 173, cy: 353, rx: 20, ry: 34 },
  },
  // Left thigh
  {
    id: '19', number: '19', name: 'Coxa Esquerda',
    labelX: 227, labelY: 353,
    shape: { kind: 'ellipse', cx: 227, cy: 353, rx: 20, ry: 34 },
  },
  // Right knee
  {
    id: '20', number: '20', name: 'Joelho Direito',
    labelX: 176, labelY: 404,
    shape: { kind: 'ellipse', cx: 176, cy: 404, rx: 15, ry: 13 },
  },
  // Left knee
  {
    id: '21', number: '21', name: 'Joelho Esquerdo',
    labelX: 224, labelY: 404,
    shape: { kind: 'ellipse', cx: 224, cy: 404, rx: 15, ry: 13 },
  },
  // Right lower leg
  {
    id: '22', number: '22', name: 'Perna Direita',
    labelX: 172, labelY: 463,
    shape: { kind: 'ellipse', cx: 172, cy: 463, rx: 14, ry: 38 },
  },
  // Left lower leg
  {
    id: '23', number: '23', name: 'Perna Esquerda',
    labelX: 228, labelY: 463,
    shape: { kind: 'ellipse', cx: 228, cy: 463, rx: 14, ry: 38 },
  },
  // Right ankle
  {
    id: '24', number: '24', name: 'Tornozelo Direito',
    labelX: 174, labelY: 530,
    shape: { kind: 'ellipse', cx: 174, cy: 530, rx: 10, ry: 12 },
  },
  // Left ankle
  {
    id: '25', number: '25', name: 'Tornozelo Esquerdo',
    labelX: 226, labelY: 530,
    shape: { kind: 'ellipse', cx: 226, cy: 530, rx: 10, ry: 12 },
  },
  // Right foot
  {
    id: '26', number: '26', name: 'Pé Direito',
    labelX: 165, labelY: 556,
    shape: { kind: 'ellipse', cx: 165, cy: 556, rx: 14, ry: 13 },
  },
  // Left foot
  {
    id: '27', number: '27', name: 'Pé Esquerdo',
    labelX: 235, labelY: 556,
    shape: { kind: 'ellipse', cx: 235, cy: 556, rx: 14, ry: 13 },
  },
];

// ─── BACK VIEW (posterior) ───────────────────────────────────────────────────
// Same image size 400 × 600 px
// Coordinates calibrated to body-back-clinical.png in the same SVG viewBox.
// Posterior anatomical right is on the right of the image; persisted IDs stay unchanged.
export const BODY_REGIONS_BACK: BodyRegion[] = [
  // Head (back)
  {
    id: '0b', number: '0', name: 'Cabeça',
    labelX: 200, labelY: 69,
    shape: { kind: 'ellipse', cx: 200, cy: 69, rx: 23, ry: 34 },
  },
  // Neck (back)
  {
    id: '1b', number: '1', name: 'Pescoço',
    labelX: 200, labelY: 109,
    shape: { kind: 'ellipse', cx: 200, cy: 109, rx: 16, ry: 10 },
  },
  // Trapezius
  {
    id: '2', number: '2', name: 'Trapézio',
    labelX: 200, labelY: 132,
    shape: { kind: 'ellipse', cx: 200, cy: 132, rx: 34, ry: 12 },
  },
  // Upper back / thoracic spine
  {
    id: '3', number: '3', name: 'Coluna Alta',
    labelX: 200, labelY: 170,
    shape: { kind: 'ellipse', cx: 200, cy: 170, rx: 15, ry: 22 },
  },
  // Mid back
  {
    id: '4', number: '4', name: 'Coluna Média',
    labelX: 200, labelY: 220,
    shape: { kind: 'ellipse', cx: 200, cy: 220, rx: 15, ry: 22 },
  },
  // Lower back / lumbar
  {
    id: '5', number: '5', name: 'Coluna Baixa',
    labelX: 200, labelY: 266,
    shape: { kind: 'ellipse', cx: 200, cy: 266, rx: 17, ry: 20 },
  },
  // Right shoulder blade area
  {
    id: '6b', number: '6', name: 'Ombro Direito',
    labelX: 256, labelY: 146,
    shape: { kind: 'ellipse', cx: 256, cy: 146, rx: 17, ry: 20 },
  },
  // Left shoulder blade area
  {
    id: '7b', number: '7', name: 'Ombro Esquerdo',
    labelX: 144, labelY: 146,
    shape: { kind: 'ellipse', cx: 144, cy: 146, rx: 17, ry: 20 },
  },
  // Right buttock
  {
    id: '5a', number: '5a', name: 'Nádega Direita',
    labelX: 228, labelY: 305,
    shape: { kind: 'ellipse', cx: 228, cy: 305, rx: 23, ry: 20 },
  },
  // Left buttock
  {
    id: '5b', number: '5b', name: 'Nádega Esquerda',
    labelX: 172, labelY: 305,
    shape: { kind: 'ellipse', cx: 172, cy: 305, rx: 23, ry: 20 },
  },
  // Right upper arm (back)
  {
    id: '8b', number: '8', name: 'Braço Direito',
    labelX: 264, labelY: 190,
    shape: { kind: 'ellipse', cx: 264, cy: 190, rx: 12, ry: 22 },
  },
  // Left upper arm (back)
  {
    id: '9b', number: '9', name: 'Braço Esquerdo',
    labelX: 136, labelY: 190,
    shape: { kind: 'ellipse', cx: 136, cy: 190, rx: 12, ry: 22 },
  },
  // Right elbow (back)
  {
    id: '10b', number: '10', name: 'Cotovelo Direito',
    labelX: 275, labelY: 225,
    shape: { kind: 'ellipse', cx: 275, cy: 225, rx: 12, ry: 12 },
  },
  // Left elbow (back)
  {
    id: '11b', number: '11', name: 'Cotovelo Esquerdo',
    labelX: 125, labelY: 225,
    shape: { kind: 'ellipse', cx: 125, cy: 225, rx: 12, ry: 12 },
  },
  // Right forearm (back)
  {
    id: '12b', number: '12', name: 'Antebraço Direito',
    labelX: 287, labelY: 262,
    shape: { kind: 'ellipse', cx: 287, cy: 262, rx: 12, ry: 22 },
  },
  // Left forearm (back)
  {
    id: '13b', number: '13', name: 'Antebraço Esquerdo',
    labelX: 113, labelY: 262,
    shape: { kind: 'ellipse', cx: 113, cy: 262, rx: 12, ry: 22 },
  },
  // Right thigh (back)
  {
    id: '18b', number: '18', name: 'Coxa Direita',
    labelX: 230, labelY: 368,
    shape: { kind: 'ellipse', cx: 230, cy: 368, rx: 18, ry: 36 },
  },
  // Left thigh (back)
  {
    id: '19b', number: '19', name: 'Coxa Esquerda',
    labelX: 170, labelY: 368,
    shape: { kind: 'ellipse', cx: 170, cy: 368, rx: 18, ry: 36 },
  },
  // Right knee (back)
  {
    id: '20b', number: '20', name: 'Joelho Direito',
    labelX: 229, labelY: 422,
    shape: { kind: 'ellipse', cx: 229, cy: 422, rx: 14, ry: 13 },
  },
  // Left knee (back)
  {
    id: '21b', number: '21', name: 'Joelho Esquerdo',
    labelX: 171, labelY: 422,
    shape: { kind: 'ellipse', cx: 171, cy: 422, rx: 14, ry: 13 },
  },
  // Right calf
  {
    id: '22b', number: '22', name: 'Perna Direita',
    labelX: 232, labelY: 474,
    shape: { kind: 'ellipse', cx: 232, cy: 474, rx: 14, ry: 34 },
  },
  // Left calf
  {
    id: '23b', number: '23', name: 'Perna Esquerda',
    labelX: 168, labelY: 474,
    shape: { kind: 'ellipse', cx: 168, cy: 474, rx: 14, ry: 34 },
  },
];

// Legacy export for backward compatibility (all regions combined)
export const BODY_REGIONS: BodyRegion[] = [...BODY_REGIONS_FRONT, ...BODY_REGIONS_BACK];
