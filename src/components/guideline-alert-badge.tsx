'use client';

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { EvaluationResult } from '@/lib/guideline-evaluator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  evaluation: EvaluationResult;
  size?: 'sm' | 'default';
  showLabel?: boolean;
}

export function GuidelineAlertBadge({ evaluation, size = 'sm', showLabel = false }: Props) {
  if (!evaluation || !evaluation.hasViolations || evaluation.violations.length === 0) {
    return null;
  }

  const primary = evaluation.primaryViolation;
  const isMultiple = evaluation.violations.length > 1;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800 cursor-help transition-all animate-in fade-in duration-200 select-none ${
              size === 'sm' ? 'text-[9px] h-5' : 'text-[11px] h-6'
            }`}
          >
            <AlertTriangle className={`${size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-amber-600 shrink-0 animate-pulse`} />
            {showLabel && (
              <span className="font-semibold uppercase tracking-tight text-[8px]">
                {isMultiple ? `${evaluation.violations.length} Normas` : 'Nivel Guía'}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          className="max-w-xs md:max-w-sm bg-neutral-900 text-white p-3 shadow-2xl rounded-none border border-neutral-700 z-50 text-left"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 border-b border-neutral-700 pb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="font-bold text-[11px] uppercase tracking-wider text-amber-300">
                {isMultiple ? `Vulneración de ${evaluation.violations.length} Niveles Guía` : 'Vulneración de Nivel Guía'}
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {evaluation.violations.map((v, i) => (
                <div key={v.idRegla || i} className="text-[10px] space-y-1 bg-neutral-800/80 p-2 border border-neutral-700/60">
                  <div className="flex justify-between items-start gap-1">
                    <span className="font-semibold text-amber-200 leading-tight">
                      {v.fuenteNormativa}
                    </span>
                    <span className="font-mono text-[9px] bg-amber-950/80 text-amber-300 px-1 py-0.2 rounded border border-amber-800/60 shrink-0">
                      {v.limiteTexto}
                    </span>
                  </div>

                  {v.autoridadAplicacion && (
                    <p className="text-[8px] text-neutral-400 uppercase tracking-tight">
                      Autoridad: <span className="text-neutral-300 font-medium">{v.autoridadAplicacion}</span>
                    </p>
                  )}

                  {v.comentarioTecnico && (
                    <p className="text-[9px] text-neutral-300 leading-normal italic font-sans border-l-2 border-amber-500/50 pl-1.5 mt-1">
                      {v.comentarioTecnico}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="text-[8px] text-neutral-400 uppercase tracking-widest pt-1 border-t border-neutral-800 flex justify-between">
              <span>Valor medido:</span>
              <span className="font-mono text-white font-bold">
                {primary?.valorIngresado} {primary?.unidadIngresada}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

