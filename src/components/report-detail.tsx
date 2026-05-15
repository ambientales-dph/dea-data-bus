
'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, User, Briefcase, Pencil, Check, X, Layers } from 'lucide-react';
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

  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData, loading: reportLoading } = useDoc(reportRef);

  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId)
    );
  }, [db, reportId]);

  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  const groupedSamples = useMemo(() => {
    const groups: Record<string, any[]> = {};
    samples.forEach((s: any) => {
      const m = s.medium || 'other';
      if (!groups[m]) groups[m] = [];
      groups[m].push(s);
    });
    return groups;
  }, [samples]);

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
    const labels: any = { 
      agua_superficial: 'Agua Superficial', 
      agua_subterranea: 'Agua Subterránea', 
      suelo: 'Suelo', 
      sedimentos: 'Sedimento',
      other: 'Otro' 
    };
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
          <ScrollArea className="h-[400px]">
            {Object.keys(groupedSamples).length === 0 ? (
               <div className="text-center py-12 text-muted-foreground italic text-xs">
                 Este reporte no contiene analitos registrados.
               </div>
            ) : (
              Object.entries(groupedSamples).map(([medium, items]) => (
                <div key={medium} className="mb-4">
                  <div className="bg-muted/50 px-4 py-2 sticky top-0 z-10 border-y flex items-center gap-2">
                    <Layers className="h-3 w-3 text-accent" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      Matriz: {mediumLabel(medium)}
                    </span>
                  </div>
                  <Table>
                    <TableHeader className="sr-only">
                      <TableRow>
                        <TableHead>Analito</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((sample: any) => (
                        <TableRow key={sample.id}>
                          <TableCell className="text-xs py-2 pl-6">
                             <div className="font-bold">{sample.analyte}</div>
                             <div className="text-[9px] text-muted-foreground uppercase">{sample.parameterType}</div>
                          </TableCell>
                          <TableCell className="text-xs py-2 font-code font-bold text-primary">
                            {sample.value}
                          </TableCell>
                          <TableCell className="text-right py-2 pr-4">
                            <Badge variant="ghost" className="text-green-600 bg-green-50 gap-1 h-5 px-1.5">
                              <CheckCircle2 className="h-3 w-3" />
                              Verificado
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-between items-center">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            {samples.length} Analitos totales
          </p>
          <Button onClick={onClose} variant="outline" className="text-xs">
            Cerrar detalle
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
