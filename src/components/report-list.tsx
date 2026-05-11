'use client';

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useCollection } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, FileSearch, User2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportListProps {
  stationId: string;
  onViewReport: (reportId: string) => void;
  onOpenReport: (reportId: string) => void;
}

export function ReportList({ stationId, onViewReport, onOpenReport }: ReportListProps) {
  const db = useFirestore();

  // Consulta simple sin orderBy para evitar requerir índices compuestos manuales
  const reportsQuery = useMemo(() => {
    return query(
      collection(db, 'reports'),
      where('stationId', '==', stationId)
    );
  }, [db, stationId]);

  const { data: reports, loading } = useCollection(reportsQuery);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">Buscando reportes...</p>
      </div>
    );
  }

  return (
    <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Historial de Reportes
        </CardTitle>
        <CardDescription>
          Todos los muestreos registrados en esta estación.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-[10px] uppercase font-bold px-4">Fecha</TableHead>
              <TableHead className="text-[10px] uppercase font-bold px-4">Responsable</TableHead>
              <TableHead className="text-[10px] uppercase font-bold px-4 text-center">Estado</TableHead>
              <TableHead className="w-24 px-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">
                  No se han registrado reportes aún.
                </TableCell>
              </TableRow>
            ) : (
              sortedReports.map((report: any) => (
                <TableRow key={report.id} className="hover:bg-primary/5 transition-colors group">
                  <TableCell className="px-4 py-3 font-code text-xs">
                    {formatDate(report.createdAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User2 className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs truncate max-w-[80px]" title={report.createdByEmail}>
                        {report.createdByEmail?.split('@')[0]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "h-5 text-[9px] uppercase font-bold",
                        report.status === 'open' 
                          ? "border-green-200 text-green-700 bg-green-50" 
                          : "border-gray-200 text-gray-500 bg-gray-50"
                      )}
                    >
                      {report.status === 'open' ? 'Abierto' : 'Cerrado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-primary"
                        onClick={() => onOpenReport(report.id)}
                        title="Abrir para cargar datos"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-primary"
                        onClick={() => onViewReport(report.id)}
                        title="Ver detalles"
                      >
                        <FileSearch className="h-4 w-4" />
                      </Button>
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
