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
}

export function PhotoRegistry({ reportId, formId, stationId, medium }: PhotoRegistryProps) {
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
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string } | null>(null);
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
        preview: previewUrl
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
        timestamp: Date.now()
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

  const handleUpload = async (photoId: string, file: Blob, fileName: string) => {
    if (!user || !storage || !db) {
      toast({ variant: "destructive", title: "Error", description: "Servicios de Firebase no disponibles." });
      return;
    }

    setUploadingIds(prev => [...prev, photoId]);

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
        analyte: "Evidencia Visual",
        value: downloadUrl,
        storagePath: snapshot.ref.fullPath,
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
        where('analyte', '==', 'Evidencia Visual')
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
          title: "Galería vacía",
          description: "No se encontraron fotos guardadas para esta planilla.",
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

    const date = photo.capturedAt?.toDate?.() || (photo.timestamp?.toDate?.()) || new Date();
    const dateStr = date.toLocaleString('es-AR', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
    const lat = photo.latitude?.toFixed(6) || 'N/D';
    const lon = photo.longitude?.toFixed(6) || 'N/D';
    
    const technicianName = getUserNameByEmail(photo.authorEmail || photo.userEmail || null);
    
    const watermarkLines = [
      `DEA DATA BUS - DPH`,
      `Técnico: ${technicianName}`,
      `GPS: ${lat}, ${lon}`,
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

    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FOTO_${formId}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
          description: `Se borraron ${successCount} fotos. ${omittedCount} fotos de otros técnicos fueron omitidas.`,
        });
      } else if (successCount > 0) {
        toast({ title: "Eliminación completa", description: `Se borraron ${successCount} fotos exitosamente.` });
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
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "No hay fotos seleccionadas o falta conexión." 
      });
      return;
    }

    setShowDeleteModal(true);
  };

  const handleGISExport = async () => {
    if (!db || !reportId || !formId) return;
    
    setIsExporting(true);
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', 'Evidencia Visual')
      );
      
      const snapshot = await getDocs(q);
      const photos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      if (photos.length === 0) {
        toast({ title: "Exportación vacía", description: "No hay fotos registradas para exportar." });
        return;
      }

      const zip = new JSZip();
      const photosFolder = zip.folder('fotos')!;
      const csvData = [['id', 'lat', 'lon', 'fecha', 'author_name', 'author_email', 'ruta_foto']];
      
      toast({ title: "Procesando paquete", description: `Compilando ${photos.length} archivos...` });

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        try {
          const response = await fetch(p.value);
          if (!response.ok) throw new Error(`Error descargando foto ${i}`);
          const blob = await response.blob();
          const fileName = `foto_${i}.jpg`;
          photosFolder.file(fileName, blob);

          const date = p.capturedAt?.toDate?.() || (p.timestamp?.toDate?.()) || new Date();
          const dateStr = date.toISOString();
          const techName = getUserNameByEmail(p.authorEmail || p.userEmail || null);
          
          csvData.push([
            p.id,
            (p.latitude || '').toString(),
            (p.longitude || '').toString(),
            dateStr,
            techName,
            p.authorEmail || '',
            `fotos/${fileName}`
          ]);
        } catch (err) {
          console.error(`Error procesando foto ${i}:`, err);
        }
      }

      const csvContent = csvData.map(row => row.join(',')).join('\n');
      zip.file('puntos_muestreo.csv', csvContent);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RELEVAMIENTO_DEA_${formId.substring(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Exportación completa", description: "Paquete GIS generado con éxito." });
    } catch (error: any) {
      console.error("Error en exportación GIS:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo generar el paquete GIS."
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleKMZExport = async () => {
    if (!db || !reportId || !formId) return;
    
    setIsExportingKMZ(true);
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', 'Evidencia Visual')
      );
      
      const snapshot = await getDocs(q);
      const photos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      if (photos.length === 0) {
        toast({ title: "Exportación vacía", description: "No hay fotos registradas para exportar KMZ." });
        return;
      }

      const zip = new JSZip();
      const photosFolder = zip.folder('fotos')!;
      
      let kmlPlacemarks = '';
      
      toast({ title: "Generando KMZ", description: `Procesando ${photos.length} fotos para Google Earth...` });

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        try {
          const response = await fetch(p.value);
          if (!response.ok) throw new Error(`Error descargando foto ${i}`);
          const blob = await response.blob();
          const fileName = `foto_${i}.jpg`;
          photosFolder.file(fileName, blob);

          const date = p.capturedAt?.toDate?.() || (p.timestamp?.toDate?.()) || new Date();
          const dateStr = date.toLocaleString('es-AR');
          const lat = p.latitude || 0;
          const lon = p.longitude || 0;
          const techName = getUserNameByEmail(p.authorEmail || p.userEmail || null);

          kmlPlacemarks += `
      <Placemark>
        <name>Foto ${i + 1} - ${formId.substring(0, 8)}</name>
        <description>
          <![CDATA[
            <div style="font-family: 'Encode Sans', sans-serif; min-width: 350px;">
              <h3 style="margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Evidencia DEA Data Bus</h3>
              <img src="fotos/${fileName}" width="350" style="display: block; margin-bottom: 10px; border: 1px solid #000;" />
              <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <tr><td style="font-weight: bold; width: 30%;">Técnico:</td><td>${techName}</td></tr>
                <tr><td style="font-weight: bold;">Fecha:</td><td>${dateStr}</td></tr>
                <tr><td style="font-weight: bold;">GPS:</td><td>${lat.toFixed(6)}, ${lon.toFixed(6)}</td></tr>
                <tr><td style="font-weight: bold;">Planilla:</td><td>${formId}</td></tr>
              </table>
            </div>
          ]]>
        </description>
        <Point>
          <coordinates>${lon},${lat},0</coordinates>
        </Point>
      </Placemark>`;
        } catch (err) {
          console.error(`Error procesando foto ${i} para KMZ:`, err);
        }
      }

      const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Relevamiento DEA - ${formId.substring(0, 8)}</name>
    <open>1</open>
    ${kmlPlacemarks}
  </Document>
</kml>`;

      zip.file('doc.kml', kmlString);

      const content = await zip.generateAsync({ 
        type: 'blob', 
        mimeType: 'application/vnd.google-earth.kmz' 
      });
      
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RELEVAMIENTO_DEA_${formId.substring(0, 8)}.kmz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "KMZ Generado", description: "Paquete listo para Google Earth." });
    } catch (error: any) {
      console.error("Error en exportación KMZ:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo generar el paquete KMZ."
      });
    } finally {
      setIsExportingKMZ(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  if (authLoading) return null;

  const btnBase = "flex flex-col items-center justify-center p-3 bg-white hover:bg-neutral-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const btnLabel = "text-[9px] font-black uppercase text-center leading-tight mt-1.5";

  return (
    <>
      <Card className="border-t-4 border-t-accent shadow-none rounded-none mt-6 border-x-black border-b-black">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-black" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-black font-headline">Evidencia Visual</h3>
            </div>
            <div className="flex items-center gap-2">
              {isLocating && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-primary animate-pulse">
                  <MapPin className="h-3 w-3" /> GPS...
                </div>
              )}
              {pendingPhotos.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 border border-black text-black rounded-none">
                  <CloudOff className="h-3 w-3" />
                  <span className="text-[8px] font-black uppercase">{pendingPhotos.length} Pendientes</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-0 border border-black divide-x divide-black overflow-hidden bg-black">
            <button onClick={handleCaptureClick} disabled={isProcessing} className={btnBase}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              <span className={btnLabel}>Cámara</span>
            </button>
            
            <button onClick={fetchGallery} disabled={isFetchingGallery} className={btnBase}>
              {isFetchingGallery ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
              <span className={btnLabel}>Colección</span>
            </button>

            <button onClick={handleGISExport} disabled={isExporting || gallery.length === 0} className={btnBase}>
              {isExporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapIcon className="h-5 w-5" />}
              <span className={btnLabel}>GIS (CSV)</span>
            </button>

            <button onClick={handleKMZExport} disabled={isExportingKMZ || gallery.length === 0} className={btnBase}>
              {isExportingKMZ ? <Loader2 className="h-5 w-5 animate-spin" /> : <Globe className="h-5 w-5" />}
              <span className={btnLabel}>KMZ (KML)</span>
            </button>
          </div>

          {(localPhoto || pendingPhotos.length > 0) && (
            <div className="space-y-3 pt-2">
              <h4 className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Cola de Envío</h4>
              <div className="grid grid-cols-4 gap-2">
                {localPhoto && (
                  <div className="relative aspect-square border border-black bg-neutral-100 group">
                    <img src={localPhoto.preview} alt="Cargando" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button onClick={() => removePhoto(localPhoto.id)} className="p-1 bg-white text-black"><Trash2 className="h-3 w-3" /></button>
                      <button onClick={() => handleUpload(localPhoto.id, localPhoto.file, `${localPhoto.id}.jpg`)} className="p-1 bg-white text-primary">
                        {uploadingIds.includes(localPhoto.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                )}
                {pendingPhotos.filter(p => p.id !== localPhoto?.id).map(photo => (
                  <div key={photo.id} className="relative aspect-square border border-neutral-300 bg-neutral-50 group">
                    <img src={URL.createObjectURL(photo.file)} alt="Pendiente" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {uploadingIds.includes(photo.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin text-black" />
                      ) : (
                        <button onClick={() => handleUpload(photo.id, photo.file, photo.fileName)} className="p-1 bg-white border border-black text-black">
                          <Upload className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="space-y-3 pt-2 animate-in fade-in duration-300">
              <Separator className="bg-neutral-200" />
              <div className="flex items-center justify-between">
                <h4 className="text-[9px] font-black uppercase text-black tracking-widest">Colección Cargada</h4>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-black mr-2 uppercase">{selectedIds.length} seleccionadas</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                      "h-7 w-7 bg-primary text-white hover:bg-primary/90 transition-all",
                      selectedIds.length === 0 && "opacity-20 grayscale pointer-events-none"
                    )}
                    onClick={handleBulkDownload}
                    disabled={downloadingIds.length > 0 || selectedIds.length === 0}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                      "h-7 w-7 bg-destructive text-white hover:bg-destructive/90 transition-all",
                      selectedIds.length === 0 && "opacity-20 grayscale pointer-events-none"
                    )}
                    onClick={handleBulkDelete}
                    disabled={isDeleting || selectedIds.length === 0}
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {gallery.map((photo) => (
                  <div 
                    key={photo.id} 
                    onClick={() => toggleSelect(photo.id)}
                    className={cn(
                      "border border-black bg-white group relative overflow-hidden transition-all cursor-pointer aspect-video",
                      selectedIds.includes(photo.id) ? "ring-2 ring-primary ring-offset-1 z-10 scale-[1.02]" : "hover:scale-[1.01]"
                    )}
                  >
                    <img src={photo.value} alt="Evidencia" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 text-[7px] font-bold text-white flex items-center gap-1">
                      <TechnicianLink email={photo.authorEmail || photo.userEmail} className="text-white hover:text-white" />
                    </div>
                    {photo.latitude && (
                      <div className="absolute top-1 left-1 bg-black text-white px-1 py-0.5 text-[7px] font-bold flex items-center gap-0.5">
                        <MapPin className="h-2 w-2" /> GPS
                      </div>
                    )}
                    {selectedIds.includes(photo.id) && (
                      <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <input 
            type="file" 
            ref={fileInputRef}
            accept="image/*" 
            capture="environment" 
            onChange={handleFileChange}
            className="hidden" 
          />
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent className="border-t-4 border-t-destructive rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-tight">Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-medium text-muted-foreground">
              ¿Estás seguro de que deseas eliminar permanentemente las {selectedIds.length} fotos seleccionadas? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 mt-4">
            <AlertDialogCancel className="flex-1 h-10 text-[10px] font-black uppercase tracking-widest rounded-none border-black m-0">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeDelete}
              className="flex-1 h-10 text-[10px] font-black uppercase tracking-widest rounded-none bg-destructive hover:bg-destructive/90 text-white m-0"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
