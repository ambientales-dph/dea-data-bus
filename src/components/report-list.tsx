'use client';

import { useMemo, useState } from 'react';
import { collection, query, where, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Calendar, FileSearch, Briefcase, Users, Trash2 } from 'lucide-react';
import { TechnicianLink } from './technician-link';
import { isUserAdmin } from '@/app/lib/auth-config';
import { AdminDeleteDialog } from './admin-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { useStorage } from '@/firebase';

interface ReportListProps {
  stationId: string;
  onOpenReport: (reportId: string) => void;
}

export function ReportList({ stationId, onOpenReport }: ReportListProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  const [deletingReport, setDeletingReport] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = useMemo(() => isUserAdmin(user?.email || null), [user?.email]);

  const reportsQuery = useMemo(() => {
    return query(
      collection(db, 'reports'),
      where('stationId', '==', stationId)
    );
  }, [db, stationId]);

  const { data: reports, loading: reportsLoading } = useCollection(reportsQuery);

  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('stationId', '==', stationId)
    );
  }, [db, stationId]);

  const { data: allSamples } = useCollection(samplesQuery);

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

  const planillaCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    allSamples.forEach((sample: any) => {
      const rid = sample.reportId;
      const fid = sample.formId || 'legacy';
      if (rid) {
        if (!counts[rid]) counts[rid] = new Set();
        counts[rid].add(fid);
      }
    });
    const result: Record<string, number> = {};
    for (const rid in counts) {
      result[rid] = counts[rid].size;
    }
    return result;
  }, [allSamples]);

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

  const handleDeleteReport = async () => {
    if (!deletingReport || !db) return;
    setIsDeleting(true);
    try {
      const q = query(collection(db, 'samples'), where('reportId', '==', deletingReport.id));
      const samplesSnap = await getDocs(q);
      
      for (const sDoc of samplesSnap.docs) {
        await deleteDoc(doc(db, 'samples', sDoc.id));
      }

      if (storage) {
        const reportStorageRef = ref(storage, `reports/${deletingReport.id}`);
        try {
          const listRes = await listAll(reportStorageRef);
          for (const folder of listRes.prefixes) {
            const innerList = await listAll(folder);
            for (const item of innerList.items) {
              await deleteObject(item);
            }
          }
          for (const item of listRes.items) {
            await deleteObject(item);
          }
        } catch (storageErr) {
          console.warn("Storage cleanup skipped or failed:", storageErr);
        }
      }

      await deleteDoc(doc(db, 'reports', deletingReport.id));
      
      toast({ title: "Reporte eliminado", description: "Se limpió la base de datos y el storage asociado." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Falla crítica al borrar reporte." });
    } finally {
      setIsDeleting(false);
      setDeletingReport(null);
    }
  };

  if (reportsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-2 text-foreground" />
        <p className="text-sm">Buscando reportes...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-md flex items-center gap-2 text-foreground font-black uppercase tracking-tight">
            <Calendar className="h-4 w-4 text-foreground" />
            Historial de Reportes
          </CardTitle>
          <CardDescription className="text-[10px] font-bold">
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
                <TableHead className="w-24 px-3 text-right"></TableHead>
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
                    <TableCell className="px-3 py-0 font-code text-[10px] text-foreground font-bold">
                      {formatDate(report.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] font-code text-foreground font-black uppercase cursor-help hover:underline decoration-foreground/30 transition-all">
                            {report.oid || report.id.substring(0, 8)} <span className="text-[9px] opacity-60 font-bold ml-1">({planillaCounts[report.id] || 0})</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 w-auto min-w-[180px] shadow-2xl border-primary/20">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 border-b pb-1.5 mb-1">
                              <Users className="h-3.5 w-3.5 text-foreground" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Técnicos Colaboradores</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              {report.editors && report.editors.length > 0 ? (
                                report.editors.map((email: string) => (
                                  <div key={email} className="flex items-center gap-2 text-[10px] font-bold bg-muted/30 px-2 py-1 rounded text-foreground">
                                    <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
                                    <TechnicianLink email={email} className="text-[10px] font-bold" />
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
                        <span className="text-[10px] font-black text-foreground truncate max-w-[80px] uppercase" title={report.trelloCardName || 'Sin proyecto'}>
                          {getProjectCode(report.trelloCardName || '')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-0 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-foreground hover:bg-primary/10"
                          onClick={() => onOpenReport(report.id)}
                          title="Gestionar Planillas"
                        >
                          <FileSearch className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingReport(report)}
                            title="BORRAR REPORTE"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        <div 
                          className="flex items-center px-0.5 text-[9px] font-black text-foreground min-w-[14px] justify-center" 
                          title="Cantidad de parámetros"
                        >
                          {analyteCounts[report.id] || 0}
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

      {deletingReport && (
        <AdminDeleteDialog 
          open={!!deletingReport}
          onOpenChange={(open) => !open && setDeletingReport(null)}
          onConfirm={handleDeleteReport}
          title={`Borrar Reporte ${deletingReport.oid}`}
          description="Vas a eliminar el reporte completo, todos sus analitos y todas las fotos subidas a la red."
          isLoading={isDeleting}
        />
      )}
    </TooltipProvider>
  );
}