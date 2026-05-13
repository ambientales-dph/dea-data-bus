'use client';

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useCollection } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Calendar, FileSearch, Plus, Briefcase, Users } from 'lucide-react';

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
      year: '2-digit'
    });
  };

  const getProjectCode = (fullName: string) => {
    if (!fullName) return 'S/P';
    const match = fullName.match(/\((.*?)\)/);
    return match ? match[1] : fullName.substring(0, 8);
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
    <TooltipProvider>
      <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-md flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Historial de Reportes
          </CardTitle>
          <CardDescription className="text-[10px]">
            Todos los muestreos registrados en esta estación.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="h-8">
                <TableHead className="text-[9px] uppercase font-bold px-3">Fecha</TableHead>
                <TableHead className="text-[9px] uppercase font-bold px-3">OID</TableHead>
                <TableHead className="text-[9px] uppercase font-bold px-3">Proyecto</TableHead>
                <TableHead className="w-28 px-3 text-right"></TableHead>
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
                  <TableRow key={report.id} className="hover:bg-primary/5 transition-colors group h-9">
                    <TableCell className="px-3 py-0 font-code text-[10px]">
                      {formatDate(report.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] font-code text-primary font-bold uppercase cursor-help hover:underline decoration-primary/30 transition-all">
                            {report.oid || report.id.substring(0, 8)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 w-auto min-w-[180px] shadow-2xl border-primary/20">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 border-b pb-1.5 mb-1">
                              <Users className="h-3.5 w-3.5 text-primary" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Técnicos Colaboradores</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              {report.editors && report.editors.length > 0 ? (
                                report.editors.map((email: string) => (
                                  <div key={email} className="flex items-center gap-2 text-[10px] font-medium bg-muted/30 px-2 py-1 rounded">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    {email}
                                  </div>
                                ))
                              ) : (
                                <span className="text-[9px] italic text-muted-foreground px-1">Sin técnicos registrados</span>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="px-3 py-0">
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[80px]" title={report.trelloCardName || 'Sin proyecto'}>
                          {getProjectCode(report.trelloCardName || '')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-0 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-primary hover:bg-primary/10"
                          onClick={() => onOpenReport(report.id)}
                          title="Abrir para cargar datos"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <div className="flex items-center gap-0.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-primary hover:bg-primary/10"
                            onClick={() => onViewReport(report.id)}
                            title="Ver detalles"
                          >
                            <FileSearch className="h-3 w-3" />
                          </Button>
                          <div 
                            className="flex items-center px-0.5 text-[9px] font-bold text-primary min-w-[14px] justify-center" 
                            title="Muestreos"
                          >
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
    </TooltipProvider>
  );
}