'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, query, orderBy, limit, addDoc, serverTimestamp, getDocs, where, doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Calendar, User, Check, Briefcase, FileText, X, ArrowLeft, Search, CheckCircle2, Trash2, FolderKanban, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TechnicianLink } from './technician-link';
import { isUserAdmin } from '@/app/lib/auth-config';
import { AdminDeleteDialog } from './admin-delete-dialog';

interface SurveyManagerProps {
  onClose: () => void;
  onSurveySelected?: (survey: any | null) => void;
}

export function SurveyManager({ onClose, onSurveySelected }: SurveyManagerProps) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const isAdmin = useMemo(() => isUserAdmin(user?.email || null), [user?.email]);

  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form State
  const [oid, setOid] = useState('');
  const [description, setDescription] = useState('');
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 16));
  const [trelloProject, setTrelloProject] = useState('');

  // Report linking
  const [reportSearch, setReportReportSearch] = useState('');
  
  const surveysQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'levantamientos'), orderBy('createdAt', 'desc'));
  }, [db, user]);
  const { data: surveys, loading: surveysLoading } = useCollection(surveysQuery);

  const selectedSurveyRef = useMemo(() => {
    if (!db || !selectedSurveyId) return null;
    return doc(db, 'levantamientos', selectedSurveyId);
  }, [db, selectedSurveyId]);
  const { data: selectedSurveyData } = useDoc(selectedSurveyRef);

  const allReportsQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'reports'));
  }, [db, user]);
  const { data: allReports } = useCollection(allReportsQuery);

  const allSamplesQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'samples'));
  }, [db, user]);
  const { data: allSamples } = useCollection(allSamplesQuery);

  // Metadatos de reportes: conteo de planillas únicas por reporte
  const reportMetadata = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    
    allSamples.forEach((s: any) => {
      if (!s.reportId) return;
      const key = `${s.reportId}-${s.formId || 'legacy'}`;
      if (!seen.has(key)) {
        seen.add(key);
        counts[s.reportId] = (counts[s.reportId] || 0) + 1;
      }
    });
    return counts;
  }, [allSamples]);

  const linkedReports = useMemo(() => {
    if (!selectedSurveyId) return [];
    return allReports
      .filter((r: any) => r.surveyId === selectedSurveyId)
      .sort((a: any, b: any) => (a.oid || "").localeCompare(b.oid || ""));
  }, [allReports, selectedSurveyId]);

  // Extraer código de cuenca del levantamiento actual para filtrar la lista de reportes vinculables
  const currentSurveyBasin = useMemo(() => {
    if (!selectedSurveyData?.oid) return null;
    const match = selectedSurveyData.oid.match(/^LV-?([A-Za-z]{2,4})/);
    return match ? match[1].toUpperCase() : null;
  }, [selectedSurveyData?.oid]);

  const unlinkedReports = useMemo(() => {
    const q = reportSearch.toLowerCase();
    
    return allReports.filter((r: any) => {
      // 1. Debe estar libre (sin surveyId)
      if (r.surveyId) return false;

      // 2. Extraer cuenca del reporte
      const reportOid = r.oid || '';
      const match = reportOid.match(/^RM-?([A-Za-z]{2,4})/);
      const reportBasin = match ? match[1].toUpperCase() : null;

      // 3. Solo mostrar si coinciden las cuencas (Filtro mandatorio)
      const isSameBasin = reportBasin === currentSurveyBasin;
      if (!isSameBasin) return false;

      // 4. Filtro de búsqueda por texto (OID o Trello)
      const matchesSearch = reportOid.toLowerCase().includes(q) || 
                           (r.trelloCardName || '').toLowerCase().includes(q);
      
      return matchesSearch;
    })
    .sort((a: any, b: any) => (a.oid || "").localeCompare(b.oid || "")) // Orden alfabético por OID
    .slice(0, 20); 
  }, [allReports, reportSearch, currentSurveyBasin]);

  useEffect(() => {
    if (selectedSurveyData && view === 'edit') {
      setOid(selectedSurveyData.oid || '');
      setDescription(selectedSurveyData.description || '');
      setIsDeferred(selectedSurveyData.isDeferred || false);
      if (selectedSurveyData.manualDate) {
        const d = selectedSurveyData.manualDate.toDate ? selectedSurveyData.manualDate.toDate() : new Date(selectedSurveyData.manualDate);
        setManualDate(d.toISOString().slice(0, 16));
      }
      setTrelloProject(selectedSurveyData.trelloCardName || '');
    }
  }, [selectedSurveyData, view]);

  useEffect(() => {
    if (view === 'edit' && selectedSurveyData) {
      onSurveySelected?.(selectedSurveyData);
    } else if (view === 'list') {
      onSurveySelected?.(null);
    }
  }, [view, selectedSurveyData, onSurveySelected]);

  const handleCreate = async () => {
    if (!user) return;
    setIsSaving(true);
    
    let finalOid = oid;
    if (!finalOid) {
       const prefix = 'LV-GEN-';
       finalOid = `${prefix}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    }

    const surveyData = {
      oid: finalOid,
      description,
      trelloCardName: trelloProject,
      isDeferred,
      manualDate: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : null,
      createdByEmail: user.email,
      createdAt: serverTimestamp(),
      status: 'open'
    };

    try {
      const docRef = await addDoc(collection(db, 'levantamientos'), surveyData);
      toast({ title: "Levantamiento creado", description: `ID: ${finalOid}` });
      setSelectedSurveyId(docRef.id);
      setView('edit');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedSurveyId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'levantamientos', selectedSurveyId), {
        description,
        trelloCardName: trelloProject,
        status: 'open'
      });
      toast({ title: "Actualizado", description: "Datos del levantamiento guardados." });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSurveyId) return;
    setIsDeleting(true);
    try {
      for (const r of linkedReports) {
        await updateDoc(doc(db, 'reports', r.id), { surveyId: null });
      }
      await deleteDoc(doc(db, 'levantamientos', selectedSurveyId));
      toast({ title: "Eliminado", description: "El levantamiento y sus vínculos fueron removidos." });
      setView('list');
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const linkReport = async (reportId: string) => {
    if (!selectedSurveyId) return;
    await updateDoc(doc(db, 'reports', reportId), { surveyId: selectedSurveyId });
  };

  const unlinkReport = async (reportId: string) => {
    await updateDoc(doc(db, 'reports', reportId), { surveyId: null });
  };

  const formatDate = (ts: any) => {
    if (!ts) return '---';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  if (view === 'create' || view === 'edit') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        <Button variant="ghost" size="sm" onClick={() => setView('list')} className="text-black font-normal">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista
        </Button>

        <Card className="border-t-4 border-t-primary rounded-none shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
               <CardTitle className="text-md font-normal uppercase tracking-tight text-black">
                 {view === 'create' ? 'Nuevo Levantamiento' : `Levantamiento: ${oid}`}
               </CardTitle>
               {view === 'edit' && isAdmin && (
                 <Button variant="ghost" size="icon" onClick={() => setShowDeleteDialog(true)} className="text-neutral-400 hover:text-destructive">
                   <Trash2 className="h-4 w-4" />
                 </Button>
               )}
            </div>
            <CardDescription className="text-[10px] font-normal uppercase text-black">Agrupación técnica de reportes de campo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-[10px] font-normal uppercase border-b pb-4 text-black">
                 <div className="flex items-center gap-1.5">
                   <User className="h-3 w-3 text-primary" />
                   <TechnicianLink email={selectedSurveyData?.createdByEmail || user?.email || null} className="font-normal text-black" />
                 </div>
                 <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(selectedSurveyData?.createdAt || new Date())}</span>
                    <button 
                      onClick={() => view === 'create' && setIsDeferred(!isDeferred)}
                      disabled={view === 'edit'}
                      className={cn(
                        "px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 font-normal",
                        isDeferred ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600",
                        view === 'edit' && "opacity-80"
                      )}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {isDeferred ? "DIFERIDO" : "REAL"}
                    </button>
                    {isDeferred && (
                      <input 
                        type="datetime-local" 
                        value={manualDate} 
                        onChange={(e) => setManualDate(e.target.value)}
                        disabled={view === 'edit'}
                        className="bg-transparent border-none p-0 text-[9px] font-normal uppercase outline-none focus:ring-0 w-32 text-black"
                      />
                    )}
                 </div>
              </div>

              {view === 'create' && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-normal uppercase text-black">Identificador (OID)</Label>
                  <Input 
                    value={oid} 
                    onChange={(e) => setOid(e.target.value.toUpperCase())} 
                    placeholder="LV-XXX-0000"
                    className="h-9 text-xs rounded-none font-normal text-black"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-[10px] font-normal uppercase text-black">Descripción / Campaña</Label>
                <Textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Ej: Monitoreo estacional de cuenca alta..."
                  className="min-h-[80px] text-xs rounded-none font-normal text-black"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-normal uppercase text-black">Proyecto Asociado</Label>
                <Input 
                  value={trelloProject} 
                  onChange={(e) => setTrelloProject(e.target.value)} 
                  placeholder="Nombre del proyecto de Trello..."
                  className="h-9 text-xs rounded-none font-normal text-black"
                />
              </div>

              <Button 
                onClick={view === 'create' ? handleCreate : handleUpdate} 
                className="w-full bg-primary hover:bg-primary/90 text-[11px] font-normal uppercase tracking-widest rounded-none h-11 text-white"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : view === 'create' ? 'Crear Levantamiento' : 'Guardar Cambios'}
              </Button>
            </div>

            {view === 'edit' && (
              <div className="space-y-4 pt-4 border-t-2 border-neutral-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-normal uppercase tracking-widest text-black">Reportes Vinculados ({linkedReports.length})</h3>
                </div>
                
                <div className="space-y-2">
                   {linkedReports.map((r: any) => (
                     <div key={r.id} className="flex items-center justify-between p-3 bg-neutral-50 border rounded-none">
                       <div className="flex-1">
                         <div className="flex items-center gap-2 mb-1">
                           <FileText className="h-3 w-3 text-primary" />
                           <span className="text-[11px] font-normal text-black uppercase">{r.oid}</span>
                         </div>
                         <div className="flex items-center gap-3 text-[9px] font-normal text-black uppercase tracking-tighter">
                            <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> {formatDate(r.createdAt)}</span>
                            <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {r.createdByEmail?.split('@')[0]}</span>
                            <span className="flex items-center gap-1"><ListTodo className="h-2.5 w-2.5" /> {reportMetadata[r.id] || 0}</span>
                         </div>
                       </div>
                       <Button variant="ghost" size="icon" onClick={() => unlinkReport(r.id)} className="h-8 w-8 text-neutral-400 hover:text-destructive shrink-0">
                         <X className="h-4 w-4" />
                       </Button>
                     </div>
                   ))}
                </div>

                <div className="pt-2 space-y-3">
                  <Label className="text-[10px] font-normal uppercase text-neutral-400">Vincular más reportes ({currentSurveyBasin || '—'})</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                    <Input 
                      placeholder="Buscar por OID..." 
                      className="pl-8 h-8 text-[11px] rounded-none border-dashed font-normal text-black"
                      value={reportSearch}
                      onChange={(e) => setReportReportSearch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    {unlinkedReports.map((r: any) => (
                      <button 
                        key={r.id} 
                        onClick={() => linkReport(r.id)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-primary/5 transition-colors border-b border-neutral-100 last:border-0 group"
                      >
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-normal text-black uppercase truncate">{r.oid}</span>
                            <span className="text-[9px] font-normal text-black bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">
                              {reportMetadata[r.id] || 0} Planilla(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[9px] font-normal text-black uppercase tracking-tighter">
                            <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> {formatDate(r.createdAt)}</span>
                            <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {r.createdByEmail?.split('@')[0]}</span>
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-primary ml-4 shrink-0 group-hover:scale-110 transition-transform" />
                      </button>
                    ))}
                    {unlinkedReports.length === 0 && (
                      <p className="text-[9px] italic text-neutral-400 text-center py-4">
                        {reportSearch ? 'Sin coincidencias.' : `No hay reportes libres para la cuenca ${currentSurveyBasin}.`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <AdminDeleteDialog 
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title={`Eliminar Levantamiento ${oid}`}
          description="Se borrará el contenedor. Los reportes asociados seguirán existiendo pero ya no estarán vinculados."
          isLoading={isDeleting}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-black hover:bg-neutral-100">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-[10px] font-normal uppercase tracking-[0.2em] text-black">LEVANTAMIENTOS</h2>
        </div>
        <Button size="sm" onClick={() => setView('create')} className="h-8 text-[9px] font-normal uppercase rounded-none bg-black text-white hover:bg-neutral-800">
          <Plus className="h-3 w-3 mr-1" /> Nuevo
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-320px)] pr-2">
        {surveysLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : surveys.length === 0 ? (
          <div className="text-center py-20 opacity-30">
            <FolderKanban className="h-10 w-10 mx-auto mb-3" />
            <p className="text-[10px] uppercase font-normal text-black">Sin levantamientos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map((s: any) => (
              <button
                key={s.id}
                onClick={() => { setSelectedSurveyId(s.id); setView('edit'); }}
                className="w-full text-left p-4 bg-white border border-neutral-200 hover:border-primary transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-normal uppercase text-black group-hover:text-primary transition-colors">{s.oid}</span>
                   <span className={cn(
                     "text-[8px] font-normal px-1.5 py-0.5 rounded-full border",
                     s.isDeferred ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
                   )}>
                     {s.isDeferred ? "DIFERIDO" : "REAL"}
                   </span>
                </div>
                <p className="text-[10px] text-neutral-600 line-clamp-2 mb-3 leading-tight font-normal">{s.description || 'Sin descripción'}</p>
                <div className="flex items-center justify-between text-[9px] font-normal uppercase text-neutral-400">
                   <div className="flex items-center gap-1.5 text-black/60">
                     <User className="h-2.5 w-2.5" />
                     {s.createdByEmail?.split('@')[0]}
                   </div>
                   <div className="flex items-center gap-1.5 text-black/60">
                     <Calendar className="h-2.5 w-2.5" />
                     {formatDate(s.createdAt)}
                   </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
