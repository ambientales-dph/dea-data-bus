import asRulesRaw from '@/app/lib/rules-seeder-as.json';
import dataRulesRaw from '@/app/lib/rules-seeder-data.json';
import csRulesRaw from '@/app/lib/rules-seeder-cs.json';
import airRulesRaw from '@/app/lib/rules-seeder-air.json';

export type EnvironmentalMatrix = 'agua_superficial' | 'agua_subterranea' | 'suelo' | 'aire';

export interface RuleMetadata {
  usoRecurso?: string;
  fuenteNormativa?: string;
  autoridadAplicacion?: string;
  comentarioTecnico?: string;
  esSembrada?: boolean;
  grupo?: string;
}

export interface RuleCriterion {
  operador: 'MENOR' | 'MAYOR' | 'MENOR_IGUAL' | 'MAYOR_IGUAL' | 'ENTRE' | 'RANGO' | 'IGUAL' | string;
  valor?: number | string;
  min?: number;
  max?: number;
  valorMin?: number;
  valorMax?: number;
  unidad?: string;
}

export interface GuidelineRule {
  idRegla: string;
  analyteId?: string;
  analito: string;
  planillaId?: string;
  tipoRegla?: string;
  nombreRegla: string;
  criterio: RuleCriterion;
  metadata: RuleMetadata;
  activo?: boolean;
}

export interface GuidelineViolation {
  idRegla: string;
  nombreRegla: string;
  fuenteNormativa: string;
  autoridadAplicacion?: string;
  comentarioTecnico?: string;
  operador: string;
  limiteTexto: string;
  valorIngresado: number;
  unidadIngresada: string;
  valorReferencia?: number | string;
}

export interface EvaluationResult {
  hasViolations: boolean;
  violations: GuidelineViolation[];
  primaryViolation?: GuidelineViolation;
  summaryTooltip: string;
}

const asRules = asRulesRaw as unknown as GuidelineRule[];
const dataRules = dataRulesRaw as unknown as GuidelineRule[];
const csRules = csRulesRaw as unknown as GuidelineRule[];
const airRules = airRulesRaw as unknown as GuidelineRule[];

function cleanText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza y convierte unidades comunes de calidad de agua, suelo y aire
 */
export function convertUnit(val: number, fromUnit: string, toUnit: string): number {
  const f = (fromUnit || '').trim().toLowerCase().replace(/[\u00b5\u03bc]/g, 'u');
  const t = (toUnit || '').trim().toLowerCase().replace(/[\u00b5\u03bc]/g, 'u');

  if (!f || !t || f === t) return val;

  // Conductividad eléctrica
  if ((f === 'ms/cm' || f === 'ds/m') && t === 'us/cm') return val * 1000;
  if (f === 'us/cm' && (t === 'ms/cm' || t === 'ds/m')) return val / 1000;
  if (f === 's/m' && t === 'us/cm') return val * 10000;
  if (f === 'us/cm' && t === 's/m') return val / 10000;

  // Concentración de masa (líquidos)
  const getMgL = (v: number, unit: string): number | null => {
    if (unit === 'g/l') return v * 1000;
    if (unit === 'mg/l' || unit === 'ppm' || unit === 'mgcaco3/l') return v;
    if (unit === 'ug/l' || unit === 'ppb') return v / 1000;
    if (unit === 'ng/l' || unit === 'ppt') return v / 1000000;
    return null;
  };

  const fromMgL = getMgL(val, f);
  if (fromMgL !== null) {
    if (t === 'mg/l' || t === 'ppm' || t === 'mgcaco3/l') return fromMgL;
    if (t === 'ug/l' || t === 'ppb') return fromMgL * 1000;
    if (t === 'g/l') return fromMgL / 1000;
    if (t === 'ng/l' || t === 'ppt') return fromMgL * 1000000;
  }

  // Concentración en aire (ug/m3)
  if (f === 'mg/m3' && t === 'ug/m3') return val * 1000;
  if (f === 'ug/m3' && t === 'mg/m3') return val / 1000;

  return val;
}

/**
 * Obtiene las reglas asociadas a la matriz
 */
export function getRulesForMatrix(matrix: EnvironmentalMatrix): GuidelineRule[] {
  switch (matrix) {
    case 'agua_superficial':
      return asRules;
    case 'agua_subterranea':
      return dataRules;
    case 'suelo':
      return csRules;
    case 'aire':
      return airRules;
    default:
      return [];
  }
}

/**
 * Busca reglas coincidentes para un analito
 */
export function findMatchingRules(analyteName: string, matrix: EnvironmentalMatrix): GuidelineRule[] {
  const rules = getRulesForMatrix(matrix);
  const cleanName = cleanText(analyteName);

  if (!cleanName) return [];

  // 1. Coincidencia exacta de nombre o analyteId
  const exact = rules.filter(r => {
    if (r.activo === false) return false;
    const cR = cleanText(r.analito);
    const cId = cleanText(r.analyteId || '');
    return cleanName === cR || cleanName === cId;
  });

  if (exact.length > 0) return exact;

  // 2. Coincidencia por inclusión de palabra clave o símbolo (e.g. Conductividad -> Conductividad Eléctrica, PM10, CO)
  return rules.filter(r => {
    if (r.activo === false) return false;
    const cR = cleanText(r.analito);
    const cId = cleanText(r.analyteId || '');

    // Palabras separadas para acrónimos como PM10, NO2, CO, SO2
    const wordsR = cR.split(' ');
    if (wordsR.includes(cleanName)) return true;

    if (cleanName.length >= 3 && (cR.includes(cleanName) || cleanName.includes(cR) || cId.includes(cleanName))) {
      return true;
    }
    return false;
  });
}

/**
 * Evalúa si un valor numérico vulnera una regla específica
 */
export function evaluateSingleRule(
  rule: GuidelineRule,
  inputValue: number,
  inputUnit: string
): GuidelineViolation | null {
  const crit = rule.criterio;
  if (!crit) return null;

  const ruleUnit = crit.unidad || inputUnit;
  const convertedVal = convertUnit(inputValue, inputUnit, ruleUnit);
  const op = crit.operador;

  let isViolated = false;
  let limiteTexto = '';

  if (op === 'MAYOR') {
    const numLimit = typeof crit.valor === 'number' ? crit.valor : parseFloat(crit.valor as string);
    if (!isNaN(numLimit)) {
      limiteTexto = `Máx: ${numLimit} ${ruleUnit}`;
      if (convertedVal > numLimit) {
        isViolated = true;
      }
    }
  } else if (op === 'MENOR_IGUAL') {
    // La norma exige <= valor. Vulnerado si convertedVal > valor
    const numLimit = typeof crit.valor === 'number' ? crit.valor : parseFloat(crit.valor as string);
    if (!isNaN(numLimit)) {
      limiteTexto = `Máx: ${numLimit} ${ruleUnit}`;
      if (convertedVal > numLimit) {
        isViolated = true;
      }
    }
  } else if (op === 'MENOR') {
    // La regla alerta si se cae por debajo de este límite (e.g. OD < 5)
    const numLimit = typeof crit.valor === 'number' ? crit.valor : parseFloat(crit.valor as string);
    if (!isNaN(numLimit)) {
      limiteTexto = `Mín: ${numLimit} ${ruleUnit}`;
      if (convertedVal < numLimit) {
        isViolated = true;
      }
    }
  } else if (op === 'MAYOR_IGUAL') {
    // La norma exige >= valor (e.g. pH >= 6, Alcalinidad >= 30). Vulnerado si convertedVal < valor
    const numLimit = typeof crit.valor === 'number' ? crit.valor : parseFloat(crit.valor as string);
    if (!isNaN(numLimit)) {
      limiteTexto = `Mín: ${numLimit} ${ruleUnit}`;
      if (convertedVal < numLimit) {
        isViolated = true;
      }
    }
  } else if (op === 'ENTRE' || op === 'RANGO') {
    const min = crit.min ?? crit.valorMin ?? 0;
    const max = crit.max ?? crit.valorMax ?? 0;
    limiteTexto = `Rango: ${min} - ${max} ${ruleUnit}`;
    if (convertedVal < min || convertedVal > max) {
      isViolated = true;
    }
  } else if (op === 'IGUAL') {
    if (crit.valor === 'Ausencia' || crit.valor === 0) {
      limiteTexto = `Exige Ausencia (0)`;
      if (convertedVal > 0) {
        isViolated = true;
      }
    }
  }

  if (isViolated) {
    return {
      idRegla: rule.idRegla,
      nombreRegla: rule.nombreRegla,
      fuenteNormativa: rule.metadata.fuenteNormativa || rule.nombreRegla,
      autoridadAplicacion: rule.metadata.autoridadAplicacion,
      comentarioTecnico: rule.metadata.comentarioTecnico,
      operador: op,
      limiteTexto,
      valorIngresado: inputValue,
      unidadIngresada: inputUnit,
      valorReferencia: crit.valor ?? `${crit.min ?? crit.valorMin} - ${crit.max ?? crit.valorMax}`
    };
  }

  return null;
}

/**
 * Evalúa una lectura de analito contra todas sus reglas normativas
 */
export function evaluateReading(
  matrix: EnvironmentalMatrix,
  analyteName: string,
  rawVal: string | number | undefined | null,
  unit: string
): EvaluationResult {
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return { hasViolations: false, violations: [], summaryTooltip: '' };
  }

  // Parsear número considerando comas o puntos
  const cleanValStr = String(rawVal).trim().replace(',', '.');
  const numVal = parseFloat(cleanValStr);

  if (isNaN(numVal)) {
    return { hasViolations: false, violations: [], summaryTooltip: '' };
  }

  const matchingRules = findMatchingRules(analyteName, matrix);
  if (matchingRules.length === 0) {
    return { hasViolations: false, violations: [], summaryTooltip: '' };
  }

  const violations: GuidelineViolation[] = [];

  for (const rule of matchingRules) {
    const violation = evaluateSingleRule(rule, numVal, unit);
    if (violation) {
      violations.push(violation);
    }
  }

  if (violations.length === 0) {
    return { hasViolations: false, violations: [], summaryTooltip: '' };
  }

  // Generar resumen formateado para el Tooltip
  const primary = violations[0];
  const lines: string[] = [];

  if (violations.length === 1) {
    lines.push(`⚠️ Vulneración Normativa:`);
    lines.push(`• Norma: ${primary.fuenteNormativa}`);
    lines.push(`• Límite: ${primary.limiteTexto} (Ingresado: ${numVal} ${unit})`);
    if (primary.comentarioTecnico) {
      lines.push(`• Detalle: ${primary.comentarioTecnico}`);
    }
  } else {
    lines.push(`⚠️ Vulneración de ${violations.length} Niveles Guía:`);
    violations.forEach((v, idx) => {
      lines.push(`${idx + 1}. ${v.fuenteNormativa} (${v.limiteTexto})`);
      if (v.comentarioTecnico && idx === 0) {
        lines.push(`   ${v.comentarioTecnico}`);
      }
    });
  }

  return {
    hasViolations: true,
    violations,
    primaryViolation: primary,
    summaryTooltip: lines.join('\n')
  };
}

