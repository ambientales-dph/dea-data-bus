
'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, User, Briefcase, Pencil, Check, X, Layers, FileText } from 'lucide-react';
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
      } catch (e) {}
    }
  }, []);

  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData, loading: reportLoading } = useDoc(reportRef);

  const samplesQuery = useMemo(() => query(collection(db, 'samples'), where('reportId', '==', reportId)), [db, reportId]);
  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  const groupedByPlanilla = useMemo(() => {
    const groups: Record<string, { medium: string, samples: any[] }> = {};
    samples.forEach((s: any) => {
      const fid = s.formId || 'legacy';
      if (!groups[fid]) groups[fid] = { medium: s.medium || 'otro', samples: [] };
      groups[fid].samples.push(s);
    });
    return groups;
  }, [samples]);

  useEffect(() => {
    if (reportData?.trelloCardName) setSelectedProject(reportData.trelloCardName);
  }, [reportData]);

  const handleSaveProject = () => {
    if (!selectedProject) return;
    updateDoc(reportRef, { trelloCardName: selectedProject })
      .then(() => setIsEditingProject(false))
      .catch(console.error);
  };

  const mediumLabel = (m: string) => {
    const labels: any = { agua_superficial: 'Agua Superficial', agua_subterranea: 'Agua Subterránea', suelo: 'Suelo', sedimentos: 'Sedimento' };
    return labels[m] || m;
  };

  if (reportLoading || samplesLoading) return <div className="p-12 text-center animate-pulse">Cargando reporte...</div>;

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-accent shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{reportData?.oid || 'Reporte'}</CardTitle>
            <Badge variant={reportData?.status === 'open' ? "default" : "secondary"}>{reportData?.status === 'open' ? 'Abierto' : 'Cerrado'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          <ScrollArea className="h-[450px]">
            {Object.keys(groupedByPlanilla).length === 0 ? (
               <div className="text-center py-12 text-xs italic text-muted-foreground">Sin analitos registrados.</div>
            ) : (
              Object.entries(groupedByPlanilla).map(([fid, data]) => (
                <div key={fid} className="mb-6">
                  <div className="bg-muted/50 px-4 py-2 sticky top-0 z-10 border-y flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-accent" />
                      <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                        {mediumLabel(data.medium)} {fid !== 'legacy' ? `(ID: ${fid.substring(0,8)})` : ''}
                      </span>
                    </div>
                  </div>
                  <Table>
                    <TableBody>
                      {data.samples.map((sample: any) => (
                        <TableRow key={sample.id}>
                          <TableCell className="text-xs py-2 pl-6 font-bold">{sample.analyte}</TableCell>
                          <TableCell className="text-xs py-2 font-code font-bold text-primary text-right pr-6">{sample.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-end">
          <Button onClick={onClose} variant="outline" className="text-xs">Cerrar</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
