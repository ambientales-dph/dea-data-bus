'use client';

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useCollection } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, FileSearch, Plus, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportListProps {
  stationId: string;
  onViewReport: (reportId: string) => void;
  onOpenReport: (reportId: string) => void;
}

export function ReportList({ stationId, onViewReport, onOpenReport }: ReportListProps) {
  const db = useFirestore();

  // Consulta de reportes de la estación
  const reportsQuery = useMemo(() => {
    return query(
      collection(db, 'reports'),
      where('stationId', '==', stationId)
    );
  }, [db, stationId]);

  const { data: reports, loading: reportsLoading } = useCollection(reportsQuery);

  // Consulta de todos los analitos de la estación para contar por reporte
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('stationId', '==', stationId)
    );
  }, [db, stationId]);

  const { data: allSamples } = useCollection(samplesQuery);

  // Mapear cantidad de analitos por reporte
  const analyteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allSamples.forEach((sample: any) => {
      const rid = sample.reportId;
      if (rid) {
        counts[rid] = (counts[rid] || 0) + 1;
      }
    });
    return counts;
  }, [allSamples]);

  // Ordenamiento en memoria
  const sortedReports = useMemo(() => {
    return [...reports].sort((a: any, b: any) => {
      const timeA = a.createdAt?.toMillis?.() || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
      const timeB = b.createdAt?.toMillis?.() || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
      return timeB - timeA;
    });
  }, [reports]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (reportsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">Buscando reportes...</p>
      </div>
    );
  }

  return (
    <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Historial de Reportes
        </CardTitle>
        <CardDescription className="text-[11px]">
          Todos los muestreos registrados en esta estación.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="h-10">
              <TableHead className="text-[10px] uppercase font-bold px-3">Fecha</TableHead>
              <TableHead className="text-[10px] uppercase font-bold px-3">Responsable</TableHead>
              <TableHead className="text-[10px] uppercase font-bold px-3 text-center">Estado</TableHead>
              <TableHead className="w-32 px-3 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic text-xs">
                  No se han registrado reportes aún.
                </TableCell>
              </TableRow>
            ) : (
              sortedReports.map((report: any) => (
                <TableRow key={report.id} className="hover:bg-primary/5 transition-colors group h-12">
                  <TableCell className="px-3 py-1 font-code text-[11px]">
                    {formatDate(report.createdAt)}
                  </TableCell>
                  <TableCell className="px-3 py-1">
                    <span className="text-[11px] font-medium truncate block max-w-[100px]" title={report.createdByEmail}>
                      {report.createdByEmail?.split('@')[0]}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-1 text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "h-4 text-[8px] uppercase font-bold px-1.5",
                        report.status === 'open' 
                          ? "border-green-200 text-green-700 bg-green-50" 
                          : "border-gray-200 text-gray-500 bg-gray-50"
                      )}
                    >
                      {report.status === 'open' ? 'Abierto' : 'Cerrado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-1 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-primary hover:bg-primary/10"
                        onClick={() => onOpenReport(report.id)}
                        title="Abrir para cargar datos"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <div className="flex items-center gap-1 group/btn">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-primary hover:bg-primary/10"
                          onClick={() => onViewReport(report.id)}
                          title="Ver detalles"
                        >
                          <FileSearch className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex items-center bg-primary/5 px-1.5 py-0.5 rounded text-[10px] font-bold text-primary border border-primary/10 min-w-[22px] justify-center" title="Cantidad de analitos">
                          {analyteCounts[report.id] || 0}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}