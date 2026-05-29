'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, Upload, Trash2, CloudOff, Image as ImageIcon, Download, CheckSquare, Cloud, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { offlineStorage, OfflinePhoto, PendingDeletion } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';
import { getUserNameByEmail } from '@/app/lib/auth-config';
import { TechnicianLink } from './technician-link';
import { compressImage } from '@/lib/image-processing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PhotoRegistryProps {
  reportId: string;
  formId: string;
  stationId: string;
  medium: string;
  analyteTag?: string;
}

export function PhotoRegistry({ reportId, formId, stationId, medium, analyteTag = "Evidencia Visual" }: PhotoRegistryProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFetchingGallery, setIsFetchingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPending = useCallback(async () => {
    try {
      const pending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(pending);
    } catch (e) {
      console.error("Error cargando fotos offline:", e);
    }
  }, [formId]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleUpload = useCallback(async (photoId: string, file: Blob, fileName: string, capturedAt: number) => {
    if (!navigator.onLine) {
      await offlineStorage.markForSync(photoId);
      setPendingPhotos(prev => prev.map(p => p.id === photoId ? { ...p, syncRequested: true } : p));
      toast({ title: "En cola para sincronizar" });
      return;
    }

    if (!user || !storage || !db) return;
    if (uploadingIds.includes(photoId)) return;

    setUploadingIds(prev => [...prev, photoId]);

    const t2 = Date.now();
    const deltaMs = t2 - capturedAt;

    try {
      const getCoords = (): Promise<{ lat: number | null; lon: number | null }> => {
        return new Promise((resolve) => {
          if (!navigator.geolocation) return resolve({ lat: null, lon: null });
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve({ lat: null, lon: null }),
            { timeout: 5000 }
          );
        });
      };

      const coords = await getCoords();
      const storageRef = ref(storage, `reports/${reportId}/${formId}/${fileName}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      
      const photoData = {
        reportId,
        formId,
        stationId,
        medium,
        parameterType: "Fotografía",
        analyte: analyteTag,
        value: downloadUrl,
        storagePath: snapshot.ref.fullPath,
        retrasoSincronizacionMs: deltaMs,
        fechaServidor: serverTimestamp(),
        timestamp: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email,
        latitude: coords.lat,
        longitude: coords.lon,
        authorId: user.uid,
        authorEmail: user.email,
        capturedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'samples'), photoData);
      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) }).catch(() => {});
      
      await offlineStorage.removePhoto(photoId);
      setPendingPhotos(prev => prev.filter(p => p.id !== photoId));
      
      fetchGallery();
      
    } catch (error: any) {
      console.error('Fallo en sincronización:', error);
    } finally {
      setUploadingIds(prev => prev.filter(id => id !== photoId));
    }
  }, [user, storage, db, reportId, formId, stationId, medium, analyteTag, uploadingIds, toast]);

  // VIGÍA DE SINCRONIZACIÓN (Subidas y Borrados)
  const processQueues = useCallback(async () => {
    if (!navigator.onLine || !user || !db || !storage) return;

    // 1. Procesar Borrados Pendientes
    const pendingDeletions = await offlineStorage.getPendingDeletions();
    for (const del of pendingDeletions) {
      try {
        if (del.storagePath) {
          const fileRef = ref(storage, del.storagePath);
          await deleteObject(fileRef).catch(() => {});
        }
        await deleteDoc(doc(db, 'samples', del.id));
        await offlineStorage.removePendingDeletion(del.id);
      } catch (e) {
        console.error("Error procesando borrado en cola:", e);
      }
    }

    // 2. Procesar Subidas Pendientes
    const allPending = await offlineStorage.getPendingPhotos(formId);
    for (const photo of allPending) {
      if (photo.syncRequested && !uploadingIds.includes(photo.id)) {
        await handleUpload(photo.id, photo.file, photo.fileName, photo.timestamp);
      }
    }

    // Refrescar galería si hubo cambios
    if (pendingDeletions.length > 0) fetchGallery();
  }, [user, db, storage, formId, handleUpload, uploadingIds]);

  // Disparar procesamiento al montar y al detectar señal
  useEffect(() => {
    processQueues();
    window.addEventListener('online', processQueues);
    return () => window.removeEventListener('online', processQueues);
  }, [processQueues]);

  const handleCaptureClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsProcessing(true);
    const t1 = Date.now();

    try {
      const compressed = await compressImage(file);
      const photoId = crypto.randomUUID();
      
      const newPhoto: OfflinePhoto = {
        id: photoId,
        reportId,
        formId,
        stationId,
        medium,
        file: compressed,
        fileName: `${photoId}.jpg`,
        timestamp: t1,
        syncRequested: false
      };

      await offlineStorage.savePhoto(newPhoto);
      setPendingPhotos(prev => [newPhoto, ...prev]);
      setIsProcessing(false);
      toast({ title: "Guardada localmente" });
      
    } catch (error) {
      console.error('Error capturando:', error);
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePending = async (photoId: string) => {
    await offlineStorage.removePhoto(photoId);
    setPendingPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const fetchGallery = async () => {
    if (!db || !reportId || !formId) return;
    
    setIsFetchingGallery(true);
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', analyteTag)
      );
      
      const snapshot = await getDocs(q);
      
      // Filtrar localmente por si hay borrados pendientes que aún figuran en la DB
      const pendingDels = await offlineStorage.getPendingDeletions();
      const delIds = new Set(pendingDels.map(d => d.id));

      const docsMapped = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(photo => !delIds.has(photo.id));
      
      setGallery(docsMapped);
      setSelectedIds([]);
    } catch (error: any) {
      console.error("Error galería:", error);
    } finally {
      setIsFetchingGallery(false);
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      const isOnline = navigator.onLine;

      for (const id of selectedIds) {
        const photo = gallery.find(p => p.id === id);
        if (!photo) continue;

        if (isOnline && db && storage) {
          // ONLINE: Borrado real inmediato
          if (photo.storagePath) {
            const fileRef = ref(storage, photo.storagePath);
            await deleteObject(fileRef).catch(() => {});
          }
          await deleteDoc(doc(db, 'samples', id));
        } else {
          // OFFLINE: Encolar borrado
          await offlineStorage.queueDeletion(id, photo.storagePath);
        }
      }

      // Actualizar UI inmediatamente (Cosa Juzgada visual)
      setGallery(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
      toast({ 
        title: isOnline ? "Evidencias eliminadas" : "Borrados encolados", 
        description: !isOnline ? "Se eliminarán de la red cuando vuelvas a tener señal." : undefined
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleDownloadWithWatermark = async (photo: any) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = photo.value;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Error carga"));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const fontSize = Math.max(12, Math.floor(canvas.width * 0.02));
    ctx.font = `bold ${fontSize}px "Encode Sans", sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";

    const serverDate = photo.fechaServidor?.toDate?.() || (photo.timestamp?.toDate?.()) || new Date();
    const delay = photo.retrasoSincronizacionMs || 0;
    const actualDate = new Date(serverDate.getTime() - delay);

    const dateStr = actualDate.toLocaleString('es-AR', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
    
    const watermarkLines = [
      `DEA DATA BUS - DPH`,
      `Ítem: ${photo.analyte || analyteTag}`,
      `Técnico: ${getUserNameByEmail(photo.authorEmail || photo.userEmail || null)}`,
      `GPS: ${photo.latitude?.toFixed(6) || 'N/D'}, ${photo.longitude?.toFixed(6) || 'N/D'}`,
      `Fecha: ${dateStr}`
    ];

    const padding = fontSize;
    let currentY = canvas.height - padding;
    
    watermarkLines.forEach((line) => {
      ctx.strokeStyle = 'black';
      ctx.lineWidth = fontSize / 4;
      ctx.strokeText(line, canvas.width - padding, currentY);
      ctx.fillStyle = 'white';
      ctx.fillText(line, canvas.width - padding, currentY);
      currentY -= fontSize * 1.3;
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FOTO_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.90);
  };

  const btnBase = "flex flex-col items-center justify-center p-2.5 bg-white hover:bg-neutral-50 transition-all disabled:opacity-40";
  const btnLabel = "text-[8px] font-normal uppercase text-center leading-tight mt-1";

  return (
    <>
      <Card className="border-t border-black shadow-none rounded-none mt-2 bg-neutral-50/50">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
            <div className="flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-black" />
              <h3 className="text-[10px] font-normal uppercase tracking-widest text-black">Fotos del ítem</h3>
            </div>
            {pendingPhotos.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-black">
                <CloudOff className="h-2.5 w-2.5 animate-pulse" />
                <span className="text-[7px] font-normal uppercase">{pendingPhotos.length} Pendiente(s)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-0 border border-black divide-x divide-black overflow-hidden bg-black">
            <button onClick={handleCaptureClick} disabled={isProcessing} className={btnBase}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <span className={btnLabel}>Capturar</span>
            </button>
            <button onClick={fetchGallery} disabled={isFetchingGallery} className={btnBase}>
              {isFetchingGallery ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              <span className={btnLabel}>Ver ({gallery.length})</span>
            </button>
            <button onClick={() => { gallery.filter(p => selectedIds.includes(p.id)).forEach(handleDownloadWithWatermark) }} disabled={selectedIds.length === 0} className={cn(btnBase, "text-primary")}>
              <Download className="h-4 w-4" />
              <span className={btnLabel}>Bajar</span>
            </button>
            <button onClick={() => setShowDeleteModal(true)} disabled={selectedIds.length === 0} className={cn(btnBase, "text-neutral-600")}>
              <Trash2 className="h-4 w-4" />
              <span className={btnLabel}>Borrar</span>
            </button>
          </div>

          {pendingPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-1 animate-in fade-in duration-300">
               {pendingPhotos.map(photo => (
                  <div key={photo.id} className="relative aspect-square border border-black bg-neutral-200 overflow-hidden">
                    <img src={URL.createObjectURL(photo.file)} alt="P" className="w-full h-full object-cover grayscale opacity-70" />
                    <div className="absolute top-1 left-1 bg-black/80 p-0.5 rounded-sm">
                       <CloudOff className="h-3 w-3 text-white" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/10">
                       {uploadingIds.includes(photo.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                       ) : photo.syncRequested ? (
                          <div className="bg-black/60 px-2 py-1 rounded">
                            <span className="text-[7px] text-white font-black uppercase tracking-widest">En cola...</span>
                          </div>
                       ) : (
                          <>
                            <button onClick={() => handleUpload(photo.id, photo.file, photo.fileName, photo.timestamp)} className="p-2 bg-white rounded-full shadow-xl text-primary"><Upload className="h-4 w-4" /></button>
                            <button onClick={() => handleDeletePending(photo.id)} className="p-2 bg-white rounded-full shadow-xl text-destructive"><X className="h-4 w-4" /></button>
                          </>
                       )}
                    </div>
                  </div>
               ))}
            </div>
          )}

          {gallery.length > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-1 animate-in fade-in duration-300">
              {gallery.map((photo) => (
                <div 
                  key={photo.id} 
                  onClick={() => setSelectedIds(prev => prev.includes(photo.id) ? prev.filter(i => i !== photo.id) : [...prev, photo.id])}
                  className={cn(
                    "border border-black bg-white group relative aspect-square cursor-pointer transition-all overflow-hidden",
                    selectedIds.includes(photo.id) ? "ring-2 ring-primary ring-offset-1" : ""
                  )}
                >
                  <img src={photo.value} alt="E" className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 bg-green-500/80 p-0.5 rounded-full">
                     <Cloud className="h-2 w-2 text-white" />
                  </div>
                  {selectedIds.includes(photo.id) && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="h-4 w-4 text-white" /></div>
                  )}
                </div>
              ))}
            </div>
          )}

          <input type="file" ref={fileInputRef} accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent className="border-t-4 border-t-destructive rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-normal uppercase">Borrar Evidencias</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {navigator.onLine 
                ? `¿Confirmás la eliminación permanente de ${selectedIds.length} fotos?`
                : `Estás sin señal. Las fotos desaparecerán de la galería ahora y se borrarán de la red automáticamente apenas recuperes conexión.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-none border-black m-0 text-[10px] uppercase">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="flex-1 rounded-none bg-destructive text-white m-0 text-[10px] uppercase">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
