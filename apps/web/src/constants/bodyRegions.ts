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

export const BODY_REGIONS: BodyRegion[] = [
  { id: '0', number: '0', name: 'Cabeça', labelX: 150, labelY: 33, shape: { kind: 'ellipse', cx: 150, cy: 38, rx: 24, ry: 29 } },
  { id: '1', number: '1', name: 'Pescoço', labelX: 150, labelY: 73, shape: { kind: 'rect', x: 136, y: 65, width: 28, height: 22, rx: 8 } },
  { id: '2', number: '2', name: 'Trapézio', labelX: 150, labelY: 101, shape: { kind: 'path', d: 'M104 94 Q150 73 196 94 L184 121 Q150 108 116 121 Z' } },
  { id: '3', number: '3', name: 'Coluna Alta', labelX: 150, labelY: 128, shape: { kind: 'rect', x: 136, y: 108, width: 28, height: 43, rx: 13 } },
  { id: '4', number: '4', name: 'Coluna Média', labelX: 150, labelY: 178, shape: { kind: 'rect', x: 135, y: 153, width: 30, height: 57, rx: 14 } },
  { id: '5', number: '5', name: 'Coluna Baixa', labelX: 150, labelY: 231, shape: { kind: 'rect', x: 136, y: 212, width: 28, height: 42, rx: 13 } },
  { id: '5a', number: '5a', name: 'Nádega Direita', labelX: 129, labelY: 268, shape: { kind: 'ellipse', cx: 128, cy: 267, rx: 22, ry: 20 } },
  { id: '5b', number: '5b', name: 'Nádega Esquerda', labelX: 171, labelY: 268, shape: { kind: 'ellipse', cx: 172, cy: 267, rx: 22, ry: 20 } },
  { id: '6', number: '6', name: 'Ombro Direito', labelX: 91, labelY: 117, shape: { kind: 'ellipse', cx: 91, cy: 116, rx: 23, ry: 20 } },
  { id: '7', number: '7', name: 'Ombro Esquerdo', labelX: 209, labelY: 117, shape: { kind: 'ellipse', cx: 209, cy: 116, rx: 23, ry: 20 } },
  { id: '8', number: '8', name: 'Braço Direito', labelX: 67, labelY: 169, shape: { kind: 'rect', x: 52, y: 133, width: 28, height: 72, rx: 14 } },
  { id: '9', number: '9', name: 'Braço Esquerdo', labelX: 233, labelY: 169, shape: { kind: 'rect', x: 220, y: 133, width: 28, height: 72, rx: 14 } },
  { id: '10', number: '10', name: 'Cotovelo Direito', labelX: 59, labelY: 218, shape: { kind: 'ellipse', cx: 59, cy: 218, rx: 16, ry: 15 } },
  { id: '11', number: '11', name: 'Cotovelo Esquerdo', labelX: 241, labelY: 218, shape: { kind: 'ellipse', cx: 241, cy: 218, rx: 16, ry: 15 } },
  { id: '12', number: '12', name: 'Antebraço Direito', labelX: 49, labelY: 266, shape: { kind: 'rect', x: 35, y: 231, width: 27, height: 70, rx: 14 } },
  { id: '13', number: '13', name: 'Antebraço Esquerdo', labelX: 251, labelY: 266, shape: { kind: 'rect', x: 238, y: 231, width: 27, height: 70, rx: 14 } },
  { id: '14', number: '14', name: 'Punho Direito', labelX: 43, labelY: 314, shape: { kind: 'rect', x: 31, y: 300, width: 24, height: 27, rx: 11 } },
  { id: '15', number: '15', name: 'Punho Esquerdo', labelX: 257, labelY: 314, shape: { kind: 'rect', x: 245, y: 300, width: 24, height: 27, rx: 11 } },
  { id: '16', number: '16', name: 'Mão Direita', labelX: 36, labelY: 347, shape: { kind: 'ellipse', cx: 36, cy: 345, rx: 18, ry: 22 } },
  { id: '17', number: '17', name: 'Mão Esquerda', labelX: 264, labelY: 347, shape: { kind: 'ellipse', cx: 264, cy: 345, rx: 18, ry: 22 } },
  { id: '18', number: '18', name: 'Coxa Direita', labelX: 126, labelY: 344, shape: { kind: 'rect', x: 106, y: 287, width: 38, height: 112, rx: 18 } },
  { id: '19', number: '19', name: 'Coxa Esquerda', labelX: 174, labelY: 344, shape: { kind: 'rect', x: 156, y: 287, width: 38, height: 112, rx: 18 } },
  { id: '20', number: '20', name: 'Joelho Direito', labelX: 125, labelY: 421, shape: { kind: 'ellipse', cx: 125, cy: 421, rx: 19, ry: 18 } },
  { id: '21', number: '21', name: 'Joelho Esquerdo', labelX: 175, labelY: 421, shape: { kind: 'ellipse', cx: 175, cy: 421, rx: 19, ry: 18 } },
  { id: '22', number: '22', name: 'Perna Direita', labelX: 121, labelY: 488, shape: { kind: 'rect', x: 106, y: 438, width: 31, height: 101, rx: 15 } },
  { id: '23', number: '23', name: 'Perna Esquerda', labelX: 179, labelY: 488, shape: { kind: 'rect', x: 163, y: 438, width: 31, height: 101, rx: 15 } },
  { id: '24', number: '24', name: 'Tornozelo Direito', labelX: 117, labelY: 554, shape: { kind: 'rect', x: 104, y: 538, width: 26, height: 31, rx: 12 } },
  { id: '25', number: '25', name: 'Tornozelo Esquerdo', labelX: 183, labelY: 554, shape: { kind: 'rect', x: 170, y: 538, width: 26, height: 31, rx: 12 } },
  { id: '26', number: '26', name: 'Pé Direito', labelX: 103, labelY: 587, shape: { kind: 'path', d: 'M93 568 H129 Q139 587 121 598 H84 Q78 589 93 568 Z' } },
  { id: '27', number: '27', name: 'Pé Esquerdo', labelX: 197, labelY: 587, shape: { kind: 'path', d: 'M171 568 H207 Q222 589 216 598 H179 Q161 587 171 568 Z' } },
];
