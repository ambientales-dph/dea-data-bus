
'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Camera, Loader2, X, Upload, Trash2, CloudOff, Image as ImageIcon, ChevronRight, MapPin, Download, FileArchive, Map as MapIcon, CheckSquare, Square, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { offlineStorage, OfflinePhoto } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';
import { getUserNameByEmail } from '@/app/lib/auth-config';
import { TechnicianLink } from './technician-link';
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
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingKMZ, setIsExportingKMZ] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string; capturedAt: number } | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFetchingGallery, setIsFetchingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadPending = async () => {
      try {
        const pending = await offlineStorage.getPendingPhotos(formId);
        setPendingPhotos(pending);
      } catch (e) {
        console.error("Error cargando fotos offline:", e);
      }
    };
    loadPending();
  }, [formId]);

  const handleCaptureClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsProcessing(true);
    const t1 = Date.now();

    try {
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        preserveExif: true,
      };
      
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, options);
      
      const photoId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(compressed);
      
      const photoObj = {
        id: photoId,
        file: compressed as File,
        preview: previewUrl,
        capturedAt: t1
      };

      setLocalPhoto(photoObj);
      
      await offlineStorage.savePhoto({
        id: photoId,
        reportId,
        formId,
        stationId,
        medium,
        file: compressed,
        fileName: `${photoId}.jpg`,
        timestamp: t1
      });

      const updatedPending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(updatedPending);
    } catch (error) {
      console.error('Error procesando imagen:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo procesar la imagen localmente.",
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getCoordinates = (): Promise<{ lat: number | null; lon: number | null }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ lat: null, lon: null });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve({ lat: null, lon: null }),
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  };

  const handleUpload = async (photoId: string, file: Blob, fileName: string, capturedAt: number) => {
    if (!user || !storage || !db) {
      toast({ variant: "destructive", title: "Error", description: "Servicios de Firebase no disponibles." });
      return;
    }

    setUploadingIds(prev => [...prev, photoId]);

    // Delta Time Calculation
    const t2 = Date.now();
    const deltaMs = t2 - capturedAt;

    try {
      setIsLocating(true);
      const coords = await getCoordinates();
      setIsLocating(false);

      const safeReportId = reportId?.trim() || 'unnamed_report';
      const safeFormId = formId?.trim() || 'unnamed_form';
      const storageRef = ref(storage, `reports/${safeReportId}/${safeFormId}/${fileName}`);

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

      await updateDoc(doc(db, 'reports', reportId), { 
        editors: arrayUnion(user.email) 
      }).catch(() => {});
      
      await offlineStorage.removePhoto(photoId);
      if (localPhoto?.id === photoId) setLocalPhoto(null);
      setPendingPhotos(prev => prev.filter(p => p.id !== photoId));

      toast({ title: "Sincronizado", description: "Foto y metadatos registrados con éxito." });
    } catch (error: any) {
      console.error('Error detallado al subir:', error);
      toast({ 
        variant: "destructive", 
        title: "Error de subida", 
        description: `Error al subir: ${error.message || "No se pudo completar la transferencia."}` 
      });
    } finally {
      setIsLocating(false);
      setUploadingIds(prev => prev.filter(id => id !== photoId));
    }
  };

  const removePhoto = async (id: string) => {
    await offlineStorage.removePhoto(id);
    if (localPhoto?.id === id) setLocalPhoto(null);
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
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
      const docsMapped = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setGallery(docsMapped);
      setSelectedIds([]);
      if (docsMapped.length === 0) {
        toast({
          title: "Sin registros",
          description: "No hay fotos para este ítem todavía.",
        });
      }
    } catch (error: any) {
      console.error("Error al buscar galería:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar la galería de fotos.",
      });
    } finally {
      setIsFetchingGallery(false);
    }
  };

  const handleDownloadWithWatermark = async (photo: any) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = photo.value;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("No se pudo cargar la imagen del servidor."));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No se pudo obtener el contexto del canvas.");

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
    const lat = photo.latitude?.toFixed(6) || 'N/D';
    const lon = photo.longitude?.toFixed(6) || 'N/D';
    
    const technicianName = getUserNameByEmail(photo.authorEmail || photo.userEmail || null);
    
    const watermarkLines = [
      `DEA DATA BUS - DPH`,
      `Ítem: ${photo.analyte || analyteTag}`,
      `Técnico: ${technicianName}`,
      `GPS: ${lat}, ${lon}`,
      `Fecha (Real): ${dateStr}`
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

    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FOTO_${(photo.analyte || analyteTag).substring(0,10)}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(resolve);
        resolve();
      }, 'image/jpeg', 0.90);
    });
  };

  const handleBulkDownload = async () => {
    const selectedPhotos = gallery.filter(p => selectedIds.includes(p.id));
    toast({ title: "Procesando descargas", description: `Preparando ${selectedPhotos.length} fotos con marca de agua...` });
    
    setDownloadingIds(prev => [...prev, ...selectedIds]);
    try {
      for (const photo of selectedPhotos) {
        await handleDownloadWithWatermark(photo);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDownloadingIds([]);
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    let successCount = 0;
    let omittedCount = 0;
    const deletedIds: string[] = [];

    try {
      for (const id of selectedIds) {
        const photo = gallery.find(p => p.id === id);
        if (!photo) continue;

        const isAuthor = photo.authorEmail === user?.email || photo.userEmail === user?.email;
        if (!isAuthor) {
          omittedCount++;
          continue;
        }

        try {
          const fileRef = ref(storage!, photo.value);
          await deleteObject(fileRef);
        } catch (storageErr: any) {
          if (storageErr.code !== 'storage/object-not-found') {
            console.warn(`Error en Storage para la foto ${id}:`, storageErr.message);
          }
        }

        try {
          await deleteDoc(doc(db!, 'samples', id));
          successCount++;
          deletedIds.push(id);
        } catch (firestoreErr: any) {
          console.error(`Error en Firestore para la foto ${id}:`, firestoreErr.message);
        }
      }

      setGallery(prev => prev.filter(p => !deletedIds.includes(p.id)));
      setSelectedIds(prev => prev.filter(id => !deletedIds.includes(id)));
      
      if (omittedCount > 0) {
        toast({
          variant: "destructive",
          title: "Acción restringida",
          description: `Se borraron ${successCount} fotos. ${omittedCount} de otros técnicos fueron omitidas.`,
        });
      } else if (successCount > 0) {
        toast({ title: "Eliminación completa", description: `Se borraron ${successCount} fotos.` });
      }
    } catch (error: any) {
      console.error("Error crítico en eliminación masiva:", error);
      toast({ variant: "destructive", title: "Error", description: "Ocurrió un error inesperado." });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleBulkDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!db || !storage || !user?.email || selectedIds.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Falta conexión o selección." });
      return;
    }
    setShowDeleteModal(true);
  };

  if (authLoading) return null;

  const btnBase = "flex flex-col items-center justify-center p-2.5 bg-white hover:bg-neutral-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
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
            <div className="flex items-center gap-2">
              {isLocating && <div className="text-[8px] font-normal text-primary animate-pulse">GPS...</div>}
              {pendingPhotos.length > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-black">
                  <CloudOff className="h-2.5 w-2.5" />
                  <span className="text-[7px] font-normal uppercase">{pendingPhotos.length} Pend.</span>
                </div>
              )}
            </div>
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
            <button onClick={handleBulkDownload} disabled={selectedIds.length === 0} className={cn(btnBase, "text-primary")}>
              <Download className="h-4 w-4" />
              <span className={btnLabel}>Bajar</span>
            </button>
            <button onClick={handleBulkDelete} disabled={selectedIds.length === 0} className={cn(btnBase, "text-neutral-600")}>
              <Trash2 className="h-4 w-4" />
              <span className={btnLabel}>Borrar</span>
            </button>
          </div>

          {(localPhoto || pendingPhotos.length > 0) && (
            <div className="grid grid-cols-5 gap-1.5">
               {localPhoto && (
                  <div className="relative aspect-square border border-black group">
                    <img src={localPhoto.preview} alt="C" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => handleUpload(localPhoto!.id, localPhoto!.file, `${localPhoto!.id}.jpg`, localPhoto!.capturedAt)} className="p-1 bg-white text-primary">
                          {uploadingIds.includes(localPhoto.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                       </button>
                    </div>
                  </div>
               )}
               {pendingPhotos.map(photo => (
                  <div key={photo.id} className="relative aspect-square border border-black group">
                    <img src={URL.createObjectURL(photo.file)} alt="P" className="w-full h-full object-cover grayscale" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => handleUpload(photo.id, photo.file, photo.fileName, photo.timestamp)} className="p-1 bg-white text-primary">
                          {uploadingIds.includes(photo.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                       </button>
                    </div>
                  </div>
               ))}
            </div>
          )}

          {gallery.length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-1 animate-in fade-in duration-300">
              {gallery.map((photo) => (
                <div 
                  key={photo.id} 
                  onClick={() => setSelectedIds(prev => prev.includes(photo.id) ? prev.filter(i => i !== photo.id) : [...prev, photo.id])}
                  className={cn(
                    "border border-black bg-white group relative aspect-video cursor-pointer transition-all",
                    selectedIds.includes(photo.id) ? "ring-2 ring-primary ring-offset-1 scale-[1.02]" : "hover:scale-[1.01]"
                  )}
                >
                  <img src={photo.value} alt="E" className="w-full h-full object-cover" />
                  {selectedIds.includes(photo.id) && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckSquare className="h-4 w-4 text-white" /></div>}
                  <div className="absolute bottom-0.5 right-0.5 bg-black/40 px-1 text-[6px] text-white"><TechnicianLink email={photo.userEmail} className="text-white hover:text-white" /></div>
                </div>
              ))}
            </div>
          )}

          <input type="file" ref={fileInputRef} accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent className="border-t-4 border-t-destructive rounded-none">
          <AlertDialogHeader><AlertDialogTitle className="text-sm font-normal uppercase">Confirmar Eliminación</AlertDialogTitle><AlertDialogDescription className="text-xs">¿Borrar {selectedIds.length} fotos permanentemente?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-none border-black m-0 text-[10px] uppercase">No</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="flex-1 rounded-none bg-destructive text-white m-0 text-[10px] uppercase">Sí, Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
