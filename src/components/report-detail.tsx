
'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useFirestore, useCollection, useDoc, useUser, useStorage } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, User, Briefcase, Pencil, Check, X, Layers, FileText, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { isUserAdmin } from '@/app/lib/auth-config';
import { AdminDeleteDialog } from './admin-delete-dialog';
import { ref, deleteObject, listAll } from 'firebase/storage';

interface ReportDetailProps {
  reportId: string;
  onClose: () => void;
}

export function ReportDetail({ reportId, onClose }: ReportDetailProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [deletingPlanilla, setDeletingPlanilla] = useState<{fid: string, medium: string, protocol?: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [trelloProjects, setTrelloProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  const isAdmin = useMemo(() => isUserAdmin(user?.email || null), [user?.email]);

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
    const groups: Record<string, { medium: string, protocol?: string, samples: any[] }> = {};
    samples.forEach((s: any) => {
      const fid = s.formId || 'legacy';
      if (!groups[fid]) {
        let protocol = undefined;
        if (s.medium === 'suelo') {
          if (s.analyte === 'sondeoNumero' || s.parameterType === 'Estratigrafía') protocol = 'suelo_geotecnia';
          else protocol = 'suelo_edafologico';
        } else if (s.medium === 'aire') {
          protocol = 'calidad_aire';
        }
        groups[fid] = { medium: s.medium || 'otro', protocol, samples: [] };
      }
      groups[fid].samples.push(s);
    });
    return groups;
  }, [samples]);

  useEffect(() => {
    if (reportData?.trelloCardName) setSelectedProject(reportData.trelloCardName);
  }, [reportData]);

  const handleDeletePlanilla = async () => {
    if (!deletingPlanilla || !db) return;
    setIsDeleting(true);
    try {
      const q = query(
        collection(db, 'samples'), 
        where('reportId', '==', reportId),
        where('formId', '==', deletingPlanilla.fid)
      );
      const snap = await getDocs(q);

      for (const sDoc of snap.docs) {
        await deleteDoc(doc(db, 'samples', sDoc.id));
      }

      if (storage) {
        const planillaStorageRef = ref(storage, `reports/${reportId}/${deletingPlanilla.fid}`);
        try {
          const listRes = await listAll(planillaStorageRef);
          for (const item of listRes.items) {
            await deleteObject(item);
          }
        } catch (storageErr) {}
      }

      toast({ title: "Planilla borrada", description: "Se eliminaron los datos y las evidencias visuales." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo borrar la planilla." });
    } finally {
      setIsDeleting(false);
      setDeletingPlanilla(null);
    }
  };

  const protocolLabel = (protocol: string | undefined, medium: string) => {
    if (protocol === 'suelo_geotecnia') return 'Mecánica de suelos (MS-001)';
    if (protocol === 'suelo_edafologico') return 'Perfil Edafológico (PE-001)';
    if (protocol === 'calidad_aire' || medium === 'aire') return 'Calidad de Aire (CA-001)';
    const labels: any = { agua_superficial: 'Agua Superficial (AS-001)', agua_subterranea: 'Freatímetro (FTA-001)', suelo: 'Suelo', sedimentos: 'Sedimento' };
    return labels[medium] || medium;
  };

  if (reportLoading || samplesLoading) return <div className="p-12 text-center animate-pulse">Cargando reporte...</div>;

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-accent shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-normal">{reportData?.oid || 'Reporte'}</CardTitle>
            <Badge variant={reportData?.status === 'open' ? "default" : "secondary"} className="font-normal">{reportData?.status === 'open' ? 'Abierto' : 'Cerrado'}</Badge>
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
                      <span className="text-[10px] uppercase font-normal tracking-widest text-muted-foreground">
                        {protocolLabel(data.protocol, data.medium)} {fid !== 'legacy' ? `(ID: ${fid.substring(0,8)})` : ''} <span className="opacity-60 font-normal ml-1">({data.samples.length})</span>
                      </span>
                    </div>
                    {isAdmin && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-neutral-600 hover:bg-neutral-100"
                        onClick={() => setDeletingPlanilla({fid, medium: data.medium, protocol: data.protocol})}
                        title="BORRAR PLANILLA"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Table>
                    <TableBody>
                      {data.samples.map((sample: any) => (
                        <TableRow key={sample.id}>
                          <TableCell className="text-xs py-2 pl-6 font-normal">{sample.analyte}</TableCell>
                          <TableCell className="text-xs py-2 font-code font-normal text-primary text-right pr-6">{sample.value}</TableCell>
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
          <Button onClick={onClose} variant="outline" className="text-xs font-normal">Cerrar</Button>
        </CardFooter>
      </Card>

      {deletingPlanilla && (
        <AdminDeleteDialog 
          open={!!deletingPlanilla}
          onOpenChange={(open) => !open && setDeletingPlanilla(null)}
          onConfirm={handleDeletePlanilla}
          title={`Borrar Planilla ${protocolLabel(deletingPlanilla.protocol, deletingPlanilla.medium)}`}
          description={`Vas a eliminar todos los analitos de esta planilla y sus evidencias fotográficas asociadas.`}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
