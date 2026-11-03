'use client';

import React, { useState, useMemo } from 'react';
import { Info, Scale, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  EnvironmentalMatrix,
  findMatchingRules,
  GuidelineRule,
} from '@/lib/guideline-evaluator';

interface Props {
  analyteName: string;
  matrix: EnvironmentalMatrix;
  currentUnit?: string;
  className?: string;
}

const MATRIX_LABELS: Record<EnvironmentalMatrix, { label: string; code: string; color: string }> = {
  agua_superficial: { label: 'Agua Superficial', code: 'AS-001', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  agua_subterranea: { label: 'Agua Subterránea / Freatímetros', code: 'FTA-001', color: 'bg-teal-100 text-teal-800 border-teal-300' },
  aire: { label: 'Calidad de Aire', code: 'CA-001', color: 'bg-slate-100 text-slate-800 border-slate-300' },
  suelo: { label: 'Suelo / Sedimento', code: 'PE-001 / MS-001', color: 'bg-amber-100 text-amber-800 border-amber-300' },
};

function formatCriterionText(criterio: GuidelineRule['criterio']): string {
  if (!criterio) return 'Sin criterio definido';
  const unit = criterio.unidad || '';
  const op = criterio.operador;

  switch (op) {
    case 'MAYOR':
      return `> ${criterio.valor} ${unit}`.trim();
    case 'MENOR_IGUAL':
      return `≤ ${criterio.valor} ${unit}`.trim();
    case 'MENOR':
      return `< ${criterio.valor} ${unit}`.trim();
    case 'MAYOR_IGUAL':
      return `≥ ${criterio.valor} ${unit}`.trim();
    case 'ENTRE':
    case 'RANGO': {
      const min = criterio.min ?? criterio.valorMin ?? 0;
      const max = criterio.max ?? criterio.valorMax ?? 0;
      return `${min} - ${max} ${unit}`.trim();
    }
    case 'IGUAL':
      return `Exige ${criterio.valor} ${unit}`.trim();
    default:
      return `${op}: ${criterio.valor ?? ''} ${unit}`.trim();
  }
}

export function GuidelineInfoModal({ analyteName, matrix, currentUnit, className }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const rules = useMemo(() => {
    return findMatchingRules(analyteName, matrix);
  }, [analyteName, matrix]);

  // Si este analito no tiene niveles guía normativos en la base, no renderizamos el botón "i"
  if (!rules || rules.length === 0) {
    return null;
  }

  const matrixInfo = MATRIX_LABELS[matrix] || {
    label: matrix,
    code: 'DPH',
    color: 'bg-neutral-100 text-neutral-800 border-neutral-300',
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={
          className ||
          'inline-flex items-center justify-center h-4 w-4 rounded-full text-neutral-400 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer shrink-0'
        }
        title={`Ver ${rules.length} nivel(es) guía para ${analyteName}`}
        aria-label={`Información de niveles guía para ${analyteName}`}
      >
        <Info className="h-3 w-3" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-lg md:max-w-xl p-0 gap-0 overflow-hidden bg-white rounded-none border border-neutral-300 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera */}
          <div className="bg-neutral-900 text-white p-4 border-b border-neutral-800">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-sky-400 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Niveles Guía Ambientales
                  </span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${matrixInfo.color}`}>
                    {matrixInfo.code}
                  </Badge>
                </div>
                <h3 className="text-base font-bold text-white uppercase tracking-tight">
                  {analyteName}
                </h3>
                <p className="text-[11px] text-neutral-300">
                  Matriz: <span className="font-medium text-white">{matrixInfo.label}</span>
                  {currentUnit && (
                    <span className="text-neutral-400 ml-2 font-mono">
                      (Unidad actual: {currentUnit})
                    </span>
                  )}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-block text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded-sm">
                  {rules.length} {rules.length === 1 ? 'norma' : 'normas'}
                </span>
              </div>
            </div>
          </div>

          {/* Listado de Reglas Normativas */}
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 divide-y divide-neutral-100 bg-neutral-50/50">
            {rules.map((rule, idx) => {
              const critText = formatCriterionText(rule.criterio);
              const meta = rule.metadata || {};

              return (
                <div key={rule.idRegla || idx} className="pt-3 first:pt-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-neutral-900 uppercase tracking-tight">
                          {meta.fuenteNormativa || rule.nombreRegla}
                        </span>
                        {meta.autoridadAplicacion && (
                          <span className="text-[9px] bg-neutral-200 text-neutral-700 px-1 py-0.2 rounded font-medium">
                            {meta.autoridadAplicacion}
                          </span>
                        )}
                      </div>
                      {meta.usoRecurso && (
                        <p className="text-[11px] text-neutral-600 font-medium">
                          {meta.usoRecurso}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block font-mono text-xs font-bold px-2 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded">
                        {critText}
                      </span>
                    </div>
                  </div>

                  {meta.comentarioTecnico && (
                    <div className="text-[10px] text-neutral-600 bg-white p-2 rounded border border-neutral-200/80 italic leading-relaxed">
                      {meta.comentarioTecnico}
                    </div>
                  )}

                  {rule.nombreRegla && rule.nombreRegla !== meta.fuenteNormativa && (
                    <p className="text-[9px] text-neutral-400 font-mono">
                      Ref: {rule.nombreRegla}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pie de diálogo */}
          <div className="p-3 bg-white border-t border-neutral-200 flex items-center justify-between">
            <span className="text-[10px] text-neutral-500 italic">
              Reglas validadas contra matriz DPH / normativas vigentes.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="h-8 text-xs font-semibold px-4 rounded-none border-neutral-300"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

