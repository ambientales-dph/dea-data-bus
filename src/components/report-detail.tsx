
'use client';

import { useMemo } from 'react';
import { collection, query, where, doc } from 'firebase/firestore';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, User, Share2, Briefcase } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReportDetailProps {
  reportId: string;
  onClose: () => void;
}

export function ReportDetail({ reportId, onClose }: ReportDetailProps) {
  const db = useFirestore();

  // Obtener datos del reporte
  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData, loading: reportLoading } = useDoc(reportRef);

  // Consulta simple sin orderBy para evitar requerir índices compuestos manuales
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId)
    );
  }, [db, reportId]);

  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  // Ordenamiento en memoria
  const sortedSamples = useMemo(() => {
    return [...samples].sort((a: any, b: any) => {
      const timeA = a.timestamp?.toMillis?.() || 0;
      const timeB = b.timestamp?.toMillis?.() || 0;
      return timeA - timeB;
    });
  }, [samples]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const mediumLabel = (m: string) => {
    const labels: any = { water: 'Agua', air: 'Aire', soil: 'Suelo' };
    return labels[m] || m;
  };

  if (reportLoading || samplesLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">Cargando analitos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-accent shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Detalle del Reporte</CardTitle>
              <CardDescription>
                Creado el {formatDate(reportData?.createdAt)}
              </CardDescription>
            </div>
            <Badge variant={reportData?.status === 'open' ? "default" : "secondary"}>
              {reportData?.status === 'open' ? 'Activo' : 'Cerrado'}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 p-2 rounded-md border border-primary/10">
              <Briefcase className="h-3 w-3" />
              <span>Proyecto: <strong className="font-bold">{reportData?.trelloCardName || 'No asociado'}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-2">
              <User className="h-3 w-3" />
              <span>Iniciado por: <strong>{reportData?.createdByEmail}</strong></span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          <ScrollArea className="h-[350px]">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-[10px] uppercase font-bold">Medio</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold">Analito</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold">Valor</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSamples.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">
                      Este reporte no contiene analitos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedSamples.map((sample: any) => (
                    <TableRow key={sample.id}>
                      <TableCell className="text-xs py-2">{mediumLabel(sample.medium)}</TableCell>
                      <TableCell className="text-xs py-2 font-medium">{sample.analyte}</TableCell>
                      <TableCell className="text-xs py-2 font-code">{sample.value}</TableCell>
                      <TableCell className="text-right py-2">
                        <Badge variant="ghost" className="text-green-600 bg-green-50 gap-1 h-5 px-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Verificado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-between items-center">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            {sortedSamples.length} Analitos totales
          </p>
          <Button onClick={onClose} variant="outline" className="text-xs">
            Cerrar detalle
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
