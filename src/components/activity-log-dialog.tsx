
'use client';

import { useMemo } from 'react';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useCollection } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ClipboardList, User, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo técnico que muestra los últimos registros cargados en el sistema.
 * Estilo compacto y de alta densidad de información.
 */
export function ActivityLogDialog({ open, onOpenChange }: ActivityLogDialogProps) {
  const db = useFirestore();

  // Obtenemos los últimos 100 registros (muestras)
  const samplesQuery = useMemo(() => 
    query(collection(db, 'samples'), orderBy('timestamp', 'desc'), limit(100)), 
  [db]);
  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  // Obtenemos reportes para cruzar el OID (necesario para el contexto técnico)
  const reportsQuery = useMemo(() => query(collection(db, 'reports')), [db]);
  const { data: reports } = useCollection(reportsQuery);

  const reportMap = useMemo(() => {
    const map: Record<string, string> = {};
    reports.forEach((r: any) => {
      map[r.id] = r.oid || r.id.substring(0, 8);
    });
    return map;
  }, [reports]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getMediumShort = (medium: string) => {
    const map: Record<string, string> = {
      agua_superficial: 'SUP',
      agua_subterranea: 'SUB',
      suelo: 'SUE',
      sedimentos: 'SED'
    };
    return map[medium] || medium.substring(0, 3).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById('user-menu-trigger')?.focus();
        }}
        className="max-w-5xl w-[95vw] h-[85vh] p-0 flex flex-col gap-0 border-t-4 border-t-primary overflow-hidden rounded-none outline-none"
      >
        <DialogHeader className="p-4 bg-neutral-100 border-b shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <DialogTitle className="text-sm font-black uppercase tracking-widest font-headline">
              Log de Registros del Sistema
            </DialogTitle>
          </div>
          <DialogDescription className="text-[10px] font-bold uppercase text-muted-foreground mt-1">
            Últimos 100 registros detectados en la red • Auditoría en tiempo real
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-white">
          {samplesLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Consultando historial...</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <Table className="border-collapse">
                <TableHeader className="bg-neutral-50 sticky top-0 z-20 shadow-sm">
                  <TableRow className="hover:bg-transparent border-b-2 border-neutral-300 h-10">
                    <TableHead className="text-[9px] font-black uppercase px-3 text-black"><Clock className="h-3 w-3 inline mr-1" /> Fecha/Hora</TableHead>
                    <TableHead className="text-[9px] font-black uppercase px-3 text-black"><FileText className="h-3 w-3 inline mr-1" /> Reporte</TableHead>
                    <TableHead className="text-[9px] font-black uppercase px-3 text-black text-center">Planilla</TableHead>
                    <TableHead className="text-[9px] font-black uppercase px-3 text-black">Registro (Analito : Valor)</TableHead>
                    <TableHead className="text-[9px] font-black uppercase px-3 text-black"><User className="h-3 w-3 inline mr-1" /> Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samples.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-20 text-center text-xs italic text-muted-foreground">
                        No se han detectado registros en la base de datos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    samples.map((sample: any) => (
                      <TableRow key={sample.id} className="h-8 border-b border-neutral-100 hover:bg-primary/5 group transition-colors">
                        <TableCell className="px-3 py-1 font-code text-[10px] font-bold whitespace-nowrap text-neutral-600">
                          {formatDate(sample.timestamp)}
                        </TableCell>
                        <TableCell className="px-3 py-1 font-code text-[10px] font-black text-black">
                          {reportMap[sample.reportId] || '---'}
                        </TableCell>
                        <TableCell className="px-3 py-1 text-center">
                          <span className={cn(
                            "px-1.5 py-0.5 text-[8px] font-black rounded-sm border",
                            sample.medium === 'agua_superficial' ? "bg-blue-50 border-blue-200 text-blue-700" :
                            sample.medium === 'agua_subterranea' ? "bg-cyan-50 border-cyan-200 text-cyan-700" :
                            "bg-neutral-50 border-neutral-200 text-neutral-700"
                          )}>
                            {getMediumShort(sample.medium)}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-neutral-500 uppercase">{sample.analyte}</span>
                            <span className="text-[10px] font-black text-primary font-code">
                              : {sample.analyte === 'Evidencia Visual' ? 'FOTOGRAFÍA' : sample.value}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-1 text-[10px] font-bold text-neutral-600 truncate max-w-[120px]" title={sample.userEmail}>
                          {sample.userEmail?.split('@')[0]}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
        <div className="p-2 bg-neutral-100 border-t flex justify-between items-center shrink-0">
          <span className="text-[8px] font-black uppercase text-neutral-400 tracking-tighter">DEA Data Bus • Audit Log v1.0</span>
          <div className="flex items-center gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[8px] font-black uppercase text-neutral-600">Sincronizado</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
