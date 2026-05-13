
'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, User, Briefcase, Pencil, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface ReportDetailProps {
  reportId: string;
  onClose: () => void;
}

export function ReportDetail({ reportId, onClose }: ReportDetailProps) {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [trelloProjects, setTrelloProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  // Cargar proyectos de Trello desde localStorage
  useEffect(() => {
    const stored = localStorage.getItem('trello_cards_sync');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTrelloProjects(parsed.cards || []);
      } catch (e) {
        console.error('Error parsing Trello data', e);
      }
    }
  }, []);

  // Obtener datos del reporte
  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData, loading: reportLoading } = useDoc(reportRef);

  // Consulta de analitos
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId)
    );
  }, [db, reportId]);

  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  // Sincronizar proyecto seleccionado cuando se carga el reporte
  useEffect(() => {
    if (reportData?.trelloCardName) {
      setSelectedProject(reportData.trelloCardName);
    }
  }, [reportData]);

  const handleSaveProject = () => {
    if (!selectedProject) return;

    updateDoc(reportRef, { trelloCardName: selectedProject })
      .then(() => {
        setIsEditingProject(false);
        toast({
          title: "Proyecto actualizado",
          description: "La asociación con Trello se guardó correctamente.",
        });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: reportRef.path,
          operation: 'update',
          requestResourceData: { trelloCardName: selectedProject },
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

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
        <p className="text-sm">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-accent shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{reportData?.oid || 'Detalle del Reporte'}</CardTitle>
              <CardDescription>
                Creado el {formatDate(reportData?.createdAt)}
              </CardDescription>
            </div>
            <Badge variant={reportData?.status === 'open' ? "default" : "secondary"}>
              {reportData?.status === 'open' ? 'Activo' : 'Cerrado'}
            </Badge>
          </div>
          
          <div className="mt-3 space-y-2">
            {/* Sección de Proyecto con edición */}
            <div className="flex flex-col gap-2">
              {isEditingProject ? (
                <div className="flex items-center gap-2 bg-primary/5 p-2 rounded-md border border-primary/20 animate-in fade-in duration-200">
                  <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="h-7 text-[11px] py-0 border-primary/30 bg-white">
                      <SelectValue placeholder="Seleccionar proyecto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {trelloProjects.map((p) => (
                        <SelectItem key={p} value={p} className="text-[11px]">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={handleSaveProject} className="text-green-600 hover:text-green-700 p-1">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setIsEditingProject(false)} className="text-destructive hover:text-destructive/80 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between group bg-primary/5 p-2 rounded-md border border-primary/10">
                  <div className="flex items-center gap-2 text-xs text-primary overflow-hidden">
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Proyecto: <strong className="font-bold">{reportData?.trelloCardName || 'No asociado'}</strong>
                    </span>
                  </div>
                  <button 
                    onClick={() => setIsEditingProject(true)}
                    className="ml-2 text-primary/40 hover:text-primary transition-colors p-1"
                    title="Editar asociación"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
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
