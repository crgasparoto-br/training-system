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
// Body occupies roughly x: 95–305, y: 15–590
// Center x ≈ 200
export const BODY_REGIONS_FRONT: BodyRegion[] = [
  // Head
  {
    id: '0', number: '0', name: 'Cabeça',
    labelX: 200, labelY: 48,
    shape: { kind: 'ellipse', cx: 200, cy: 50, rx: 38, ry: 42 },
  },
  // Neck
  {
    id: '1', number: '1', name: 'Pescoço',
    labelX: 200, labelY: 105,
    shape: { kind: 'rect', x: 181, y: 93, width: 38, height: 28, rx: 12 },
  },
  // Left shoulder (anatomical left = image right)
  {
    id: '6', number: '6', name: 'Ombro Direito',
    labelX: 126, labelY: 145,
    shape: { kind: 'ellipse', cx: 126, cy: 145, rx: 28, ry: 24 },
  },
  // Right shoulder (anatomical right = image left)
  {
    id: '7', number: '7', name: 'Ombro Esquerdo',
    labelX: 274, labelY: 145,
    shape: { kind: 'ellipse', cx: 274, cy: 145, rx: 28, ry: 24 },
  },
  // Chest / thorax
  {
    id: 'chest', number: 'T', name: 'Tórax',
    labelX: 200, labelY: 175,
    shape: { kind: 'rect', x: 155, y: 122, width: 90, height: 80, rx: 14 },
  },
  // Abdomen
  {
    id: 'abdomen', number: 'Ab', name: 'Abdômen',
    labelX: 200, labelY: 255,
    shape: { kind: 'rect', x: 160, y: 205, width: 80, height: 75, rx: 12 },
  },
  // Right upper arm (image left)
  {
    id: '8', number: '8', name: 'Braço Direito',
    labelX: 103, labelY: 205,
    shape: { kind: 'rect', x: 88, y: 170, width: 30, height: 72, rx: 14 },
  },
  // Left upper arm (image right)
  {
    id: '9', number: '9', name: 'Braço Esquerdo',
    labelX: 297, labelY: 205,
    shape: { kind: 'rect', x: 282, y: 170, width: 30, height: 72, rx: 14 },
  },
  // Right elbow
  {
    id: '10', number: '10', name: 'Cotovelo Direito',
    labelX: 96, labelY: 258,
    shape: { kind: 'ellipse', cx: 96, cy: 258, rx: 18, ry: 16 },
  },
  // Left elbow
  {
    id: '11', number: '11', name: 'Cotovelo Esquerdo',
    labelX: 304, labelY: 258,
    shape: { kind: 'ellipse', cx: 304, cy: 258, rx: 18, ry: 16 },
  },
  // Right forearm
  {
    id: '12', number: '12', name: 'Antebraço Direito',
    labelX: 82, labelY: 315,
    shape: { kind: 'rect', x: 67, y: 275, width: 28, height: 72, rx: 13 },
  },
  // Left forearm
  {
    id: '13', number: '13', name: 'Antebraço Esquerdo',
    labelX: 318, labelY: 315,
    shape: { kind: 'rect', x: 305, y: 275, width: 28, height: 72, rx: 13 },
  },
  // Right wrist
  {
    id: '14', number: '14', name: 'Punho Direito',
    labelX: 77, labelY: 360,
    shape: { kind: 'rect', x: 63, y: 347, width: 27, height: 26, rx: 11 },
  },
  // Left wrist
  {
    id: '15', number: '15', name: 'Punho Esquerdo',
    labelX: 323, labelY: 360,
    shape: { kind: 'rect', x: 310, y: 347, width: 27, height: 26, rx: 11 },
  },
  // Right hand
  {
    id: '16', number: '16', name: 'Mão Direita',
    labelX: 72, labelY: 400,
    shape: { kind: 'ellipse', cx: 72, cy: 400, rx: 22, ry: 26 },
  },
  // Left hand
  {
    id: '17', number: '17', name: 'Mão Esquerda',
    labelX: 328, labelY: 400,
    shape: { kind: 'ellipse', cx: 328, cy: 400, rx: 22, ry: 26 },
  },
  // Right thigh
  {
    id: '18', number: '18', name: 'Coxa Direita',
    labelX: 163, labelY: 385,
    shape: { kind: 'rect', x: 143, y: 285, width: 40, height: 110, rx: 18 },
  },
  // Left thigh
  {
    id: '19', number: '19', name: 'Coxa Esquerda',
    labelX: 237, labelY: 385,
    shape: { kind: 'rect', x: 217, y: 285, width: 40, height: 110, rx: 18 },
  },
  // Right knee
  {
    id: '20', number: '20', name: 'Joelho Direito',
    labelX: 163, labelY: 415,
    shape: { kind: 'ellipse', cx: 163, cy: 415, rx: 22, ry: 20 },
  },
  // Left knee
  {
    id: '21', number: '21', name: 'Joelho Esquerdo',
    labelX: 237, labelY: 415,
    shape: { kind: 'ellipse', cx: 237, cy: 415, rx: 22, ry: 20 },
  },
  // Right lower leg
  {
    id: '22', number: '22', name: 'Perna Direita',
    labelX: 161, labelY: 480,
    shape: { kind: 'rect', x: 143, y: 436, width: 36, height: 100, rx: 16 },
  },
  // Left lower leg
  {
    id: '23', number: '23', name: 'Perna Esquerda',
    labelX: 239, labelY: 480,
    shape: { kind: 'rect', x: 221, y: 436, width: 36, height: 100, rx: 16 },
  },
  // Right ankle
  {
    id: '24', number: '24', name: 'Tornozelo Direito',
    labelX: 158, labelY: 550,
    shape: { kind: 'rect', x: 144, y: 537, width: 28, height: 28, rx: 12 },
  },
  // Left ankle
  {
    id: '25', number: '25', name: 'Tornozelo Esquerdo',
    labelX: 242, labelY: 550,
    shape: { kind: 'rect', x: 228, y: 537, width: 28, height: 28, rx: 12 },
  },
  // Right foot
  {
    id: '26', number: '26', name: 'Pé Direito',
    labelX: 148, labelY: 580,
    shape: { kind: 'path', d: 'M130 565 H168 Q178 582 162 592 H122 Q115 582 130 565 Z' },
  },
  // Left foot
  {
    id: '27', number: '27', name: 'Pé Esquerdo',
    labelX: 252, labelY: 580,
    shape: { kind: 'path', d: 'M232 565 H270 Q285 582 278 592 H238 Q222 582 232 565 Z' },
  },
];

// ─── BACK VIEW (posterior) ───────────────────────────────────────────────────
// Same image size 400 × 600 px
// Body occupies roughly x: 90–310, y: 15–590
export const BODY_REGIONS_BACK: BodyRegion[] = [
  // Head (back)
  {
    id: '0b', number: '0', name: 'Cabeça',
    labelX: 200, labelY: 48,
    shape: { kind: 'ellipse', cx: 200, cy: 50, rx: 38, ry: 42 },
  },
  // Neck (back)
  {
    id: '1b', number: '1', name: 'Pescoço',
    labelX: 200, labelY: 105,
    shape: { kind: 'rect', x: 181, y: 93, width: 38, height: 28, rx: 12 },
  },
  // Trapezius
  {
    id: '2', number: '2', name: 'Trapézio',
    labelX: 200, labelY: 135,
    shape: { kind: 'path', d: 'M140 122 Q200 105 260 122 L248 155 Q200 140 152 155 Z' },
  },
  // Upper back / thoracic spine
  {
    id: '3', number: '3', name: 'Coluna Alta',
    labelX: 200, labelY: 175,
    shape: { kind: 'rect', x: 183, y: 155, width: 34, height: 46, rx: 14 },
  },
  // Mid back
  {
    id: '4', number: '4', name: 'Coluna Média',
    labelX: 200, labelY: 230,
    shape: { kind: 'rect', x: 182, y: 203, width: 36, height: 58, rx: 14 },
  },
  // Lower back / lumbar
  {
    id: '5', number: '5', name: 'Coluna Baixa',
    labelX: 200, labelY: 282,
    shape: { kind: 'rect', x: 183, y: 263, width: 34, height: 42, rx: 13 },
  },
  // Right shoulder blade area
  {
    id: '6b', number: '6', name: 'Ombro Direito',
    labelX: 128, labelY: 148,
    shape: { kind: 'ellipse', cx: 128, cy: 148, rx: 28, ry: 24 },
  },
  // Left shoulder blade area
  {
    id: '7b', number: '7', name: 'Ombro Esquerdo',
    labelX: 272, labelY: 148,
    shape: { kind: 'ellipse', cx: 272, cy: 148, rx: 28, ry: 24 },
  },
  // Right buttock
  {
    id: '5a', number: '5a', name: 'Nádega Direita',
    labelX: 165, labelY: 325,
    shape: { kind: 'ellipse', cx: 165, cy: 325, rx: 30, ry: 28 },
  },
  // Left buttock
  {
    id: '5b', number: '5b', name: 'Nádega Esquerda',
    labelX: 235, labelY: 325,
    shape: { kind: 'ellipse', cx: 235, cy: 325, rx: 30, ry: 28 },
  },
  // Right upper arm (back)
  {
    id: '8b', number: '8', name: 'Braço Direito',
    labelX: 103, labelY: 205,
    shape: { kind: 'rect', x: 88, y: 170, width: 30, height: 72, rx: 14 },
  },
  // Left upper arm (back)
  {
    id: '9b', number: '9', name: 'Braço Esquerdo',
    labelX: 297, labelY: 205,
    shape: { kind: 'rect', x: 282, y: 170, width: 30, height: 72, rx: 14 },
  },
  // Right elbow (back)
  {
    id: '10b', number: '10', name: 'Cotovelo Direito',
    labelX: 96, labelY: 258,
    shape: { kind: 'ellipse', cx: 96, cy: 258, rx: 18, ry: 16 },
  },
  // Left elbow (back)
  {
    id: '11b', number: '11', name: 'Cotovelo Esquerdo',
    labelX: 304, labelY: 258,
    shape: { kind: 'ellipse', cx: 304, cy: 258, rx: 18, ry: 16 },
  },
  // Right forearm (back)
  {
    id: '12b', number: '12', name: 'Antebraço Direito',
    labelX: 82, labelY: 315,
    shape: { kind: 'rect', x: 67, y: 275, width: 28, height: 72, rx: 13 },
  },
  // Left forearm (back)
  {
    id: '13b', number: '13', name: 'Antebraço Esquerdo',
    labelX: 318, labelY: 315,
    shape: { kind: 'rect', x: 305, y: 275, width: 28, height: 72, rx: 13 },
  },
  // Right thigh (back)
  {
    id: '18b', number: '18', name: 'Coxa Direita',
    labelX: 163, labelY: 400,
    shape: { kind: 'rect', x: 143, y: 355, width: 40, height: 110, rx: 18 },
  },
  // Left thigh (back)
  {
    id: '19b', number: '19', name: 'Coxa Esquerda',
    labelX: 237, labelY: 400,
    shape: { kind: 'rect', x: 217, y: 355, width: 40, height: 110, rx: 18 },
  },
  // Right knee (back)
  {
    id: '20b', number: '20', name: 'Joelho Direito',
    labelX: 163, labelY: 480,
    shape: { kind: 'ellipse', cx: 163, cy: 480, rx: 22, ry: 20 },
  },
  // Left knee (back)
  {
    id: '21b', number: '21', name: 'Joelho Esquerdo',
    labelX: 237, labelY: 480,
    shape: { kind: 'ellipse', cx: 237, cy: 480, rx: 22, ry: 20 },
  },
  // Right calf
  {
    id: '22b', number: '22', name: 'Perna Direita',
    labelX: 161, labelY: 535,
    shape: { kind: 'rect', x: 143, y: 502, width: 36, height: 80, rx: 16 },
  },
  // Left calf
  {
    id: '23b', number: '23', name: 'Perna Esquerda',
    labelX: 239, labelY: 535,
    shape: { kind: 'rect', x: 221, y: 502, width: 36, height: 80, rx: 16 },
  },
];

// Legacy export for backward compatibility (all regions combined)
export const BODY_REGIONS: BodyRegion[] = [...BODY_REGIONS_FRONT, ...BODY_REGIONS_BACK];
