'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, query, where } from 'firebase/firestore';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Camera, Loader2, X, Upload, Trash2, CloudOff, Image as ImageIcon, ChevronRight, MapPin, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/image-processing';
import { offlineStorage, OfflinePhoto } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';

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
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string } | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
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
    if (downloadingIds.includes(photo.id)) return;

    setDownloadingIds(prev => [...prev, photo.id]);
    try {
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
      
      const watermarkLines = [
        `DEA DATA BUS - DPH`,
        `Técnico: ${photo.authorEmail || photo.userEmail || 'Desconocido'}`,
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

      canvas.toBlob((blob) => {
        if (!blob) throw new Error("Error al generar el archivo de imagen.");
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FOTO_${formId}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.90);

      toast({ title: "Descarga iniciada", description: "La foto con marca de agua se está descargando." });
    } catch (error: any) {
      console.error("Error en descarga:", error);
      toast({
        variant: "destructive",
        title: "Error de descarga",
        description: error.message || "Ocurrió un error al procesar la imagen."
      });
    } finally {
      setDownloadingIds(prev => prev.filter(id => id !== photo.id));
    }
  };

  if (authLoading) return null;

  return (
    <Card className="border-t-4 border-t-accent shadow-md overflow-hidden rounded-none mt-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-black" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-black font-headline">Evidencia Visual</h3>
          </div>
          <div className="flex items-center gap-2">
            {isLocating && (
              <div className="flex items-center gap-1 text-[9px] font-bold text-primary animate-pulse">
                <MapPin className="h-3 w-3" /> Obteniendo ubicación...
              </div>
            )}
            {pendingPhotos.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-sm">
                <CloudOff className="h-3 w-3" />
                <span className="text-[9px] font-black uppercase">{pendingPhotos.length} Pendientes</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {!localPhoto ? (
              <button 
                onClick={handleCaptureClick}
                disabled={isProcessing}
                className={cn(
                  "w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-none transition-all group",
                  isProcessing ? "bg-neutral-50 cursor-not-allowed" : "border-neutral-300 hover:bg-neutral-50"
                )}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-[9px] font-bold uppercase text-primary">Procesando...</span>
                  </div>
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-neutral-400 group-hover:text-primary mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tomar Fotografía</span>
                  </>
                )}
              </button>
            ) : (
              <div className="aspect-video relative border-2 border-primary bg-neutral-100 overflow-hidden group">
                <img src={localPhoto.preview} alt="Vista previa" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    disabled={uploadingIds.includes(localPhoto.id)}
                    className="h-8 rounded-none uppercase text-[10px] font-black"
                    onClick={() => removePhoto(localPhoto.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Borrar
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 bg-green-600 hover:bg-green-700 rounded-none uppercase text-[10px] font-black text-white"
                    onClick={() => handleUpload(localPhoto.id, localPhoto.file, `${localPhoto.id}.jpg`)}
                    disabled={uploadingIds.includes(localPhoto.id)}
                  >
                    {uploadingIds.includes(localPhoto.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    Subir
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[9px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Cola de sincronización:
            </h4>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendingPhotos.length === 0 && (
                <div className="col-span-full py-8 border border-dashed border-neutral-200 flex flex-col items-center justify-center opacity-30">
                  <span className="text-[8px] font-bold uppercase">Sin archivos</span>
                </div>
              )}
              
              {pendingPhotos.map(photo => {
                const isUploading = uploadingIds.includes(photo.id);
                if (localPhoto?.id === photo.id) return null;

                return (
                  <div key={photo.id} className="relative aspect-square border-2 border-amber-200 bg-amber-50 group overflow-hidden">
                    <img 
                      src={URL.createObjectURL(photo.file)} 
                      alt="Pendiente" 
                      className="w-full h-full object-cover opacity-60" 
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                      {isUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <div className="flex gap-1">
                           <button onClick={() => handleUpload(photo.id, photo.file, photo.fileName)} className="p-1.5 bg-white text-primary rounded-none shadow-md">
                            <Upload className="h-4 w-4" />
                          </button>
                          <button onClick={() => removePhoto(photo.id)} className="p-1.5 bg-white text-destructive rounded-none shadow-md">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Separator className="my-4" />
        
        <div className="space-y-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchGallery}
            disabled={isFetchingGallery}
            className="w-full h-10 border-neutral-300 text-black font-black uppercase tracking-widest text-[10px] rounded-none hover:bg-neutral-50"
          >
            {isFetchingGallery ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <ChevronRight className="mr-2 h-3.5 w-3.5" />
                Ver fotos guardadas
              </>
            )}
          </Button>

          {gallery.length > 0 && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              {gallery.map((photo) => (
                <Card key={photo.id} className="overflow-hidden rounded-none border-neutral-200 shadow-sm group">
                  <div className="aspect-video relative bg-neutral-100">
                    <img 
                      src={photo.value} 
                      alt="Evidencia Guardada" 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        size="sm"
                        variant="secondary"
                        disabled={downloadingIds.includes(photo.id)}
                        className="h-8 rounded-none text-[9px] font-black uppercase tracking-widest"
                        onClick={() => handleDownloadWithWatermark(photo)}
                      >
                        {downloadingIds.includes(photo.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Descargar
                      </Button>
                    </div>

                    {photo.latitude && photo.longitude && (
                      <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded text-[8px] text-white flex items-center gap-0.5">
                        <MapPin className="h-2 w-2" /> GPS OK
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

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
  );
}