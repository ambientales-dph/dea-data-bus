'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import Overlay from 'ol/Overlay';
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Layers, Upload, Loader2, Eye, EyeOff, Locate, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';

interface MapViewProps {
  onPointSelect: (point: SelectedPoint) => void;
  selectedPoint: SelectedPoint | null;
  activeLayer: 'osm' | 'grayscale' | 'satellite';
  onLayerChange?: (layer: 'osm' | 'grayscale' | 'satellite') => void;
  isMobile?: boolean;
  isDraggable?: boolean;
}

const PRESENCE_EXPIRATION_MS = 2 * 60 * 1000;

export function MapView({ onPointSelect, selectedPoint, activeLayer, onLayerChange, isMobile, isDraggable }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const stationsSource = useRef<VectorSource>(new VectorSource());
  const selectionSource = useRef<VectorSource>(new VectorSource());
  const presenceSource = useRef<VectorSource>(new VectorSource());
  const uploadedSource = useRef<VectorSource>(new VectorSource());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const stationsLayerRef = useRef<VectorLayer<any> | null>(null);
  const selectionLayerRef = useRef<VectorLayer<any> | null>(null);
  const presenceLayerRef = useRef<VectorLayer<any> | null>(null);
  const baseLayerRef = useRef<TileLayer<any> | null>(null);
  const basinsLayerRef = useRef<VectorLayer<any> | null>(null);
  const codesLayerRef = useRef<VectorLayer<any> | null>(null);
  const uploadedLayerRef = useRef<VectorLayer<any> | null>(null);
  
  const basinsSource = useRef<VectorSource>(new VectorSource({
    url: '/data/cuencas_dph.json',
    format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })}));
  const codesSource = useRef<VectorSource>(new VectorSource({
    url: '/data/codigos_cuencas.json',
    format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })}));

  const onPointSelectRef = useRef(onPointSelect);
  const db = useFirestore();
  const { user } = useUser();

  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [isUploadedLayerVisible, setIsUploadedLayerVisible] = useState(true);
  const [isLayerPopoverOpen, setIsLayerPopoverOpen] = useState(false);

  useEffect(() => {
    onPointSelectRef.current = onPointSelect;
  }, [onPointSelect]);

  const stationsQuery = useMemo(() => query(collection(db, 'stations')), [db]);
  const { data: stations } = useCollection(stationsQuery);

  const presenceQuery = useMemo(() => query(collection(db, 'presence')), [db]);
  const { data: presences } = useCollection(presenceQuery);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const basinsLayer = new VectorLayer({
      source: basinsSource.current,
      zIndex: 5,
      minZoom: 6.5
    });
    basinsLayerRef.current = basinsLayer;

    const codesLayer = new VectorLayer({
      source: codesSource.current,
      zIndex: 4,
      maxZoom: 6.5
    });
    codesLayerRef.current = codesLayer;

    const getInitialSource = () => {
      if (activeLayer === 'satellite') {
        return new XYZ({ 
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
          maxZoom: 19 
        });
      }
      return new OSM();
    };

    const baseLayer = new TileLayer({
      source: getInitialSource(),
      className: 'ol-base-layer',
    });
    baseLayerRef.current = baseLayer;

    const clusterSource = new Cluster({
      distance: 40,
      source: stationsSource.current,
    });

    const stationsLayer = new VectorLayer({
      source: clusterSource,
      zIndex: 10,
    });
    stationsLayerRef.current = stationsLayer;

    const selectionLayer = new VectorLayer({
      source: selectionSource.current,
      zIndex: 100,
    });
    selectionLayerRef.current = selectionLayer;

    const presenceLayer = new VectorLayer({
      source: presenceSource.current,
      zIndex: 15,
    });
    presenceLayerRef.current = presenceLayer;

    const uploadedLayer = new VectorLayer({
      source: uploadedSource.current,
      zIndex: 8,
      style: new Style({
        stroke: new Stroke({ color: '#ff5722', width: 2.5 }),
        fill: new Fill({ color: 'rgba(255, 87, 34, 0.25)' }),
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: '#ff5722' }),
          stroke: new Stroke({ color: '#fff', width: 1.5 })
        })
      })
    });
    uploadedLayerRef.current = uploadedLayer;

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, basinsLayer, codesLayer, uploadedLayer, presenceLayer, stationsLayer, selectionLayer],
      view: new View({
        center: fromLonLat([-60.0, -37.0]),
        zoom: 6.0,
      }),
    });

    const overlay = new Overlay({
      element: tooltipRef.current!,
      offset: [0, -10],
      positioning: 'bottom-center',
    });
    map.addOverlay(overlay);

    map.on('moveend', () => {
      const view = map.getView();
      const center = view.getCenter();
      if (center && (map as any)._isDraggableMode) {
        const lonLat = toLonLat(center);
        
        let basinCode = '';
        const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(center);
        if (featuresAtPoint.length > 0) {
          basinCode = featuresAtPoint[0].get('CODIGO') || '';
        }

        onPointSelectRef.current?.({
          lat: lonLat[1],
          lon: lonLat[0],
          basinCode: basinCode
        });
      }
    });

    map.on('pointermove', (event) => {
      if (event.dragging) return;
      const pixel = map.getEventPixel(event.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (f) => f, {
        layerFilter: (l) => l === stationsLayer || l === selectionLayer,
        hitTolerance: isMobile ? 12 : 5
      });

      if (feature) {
        let content = '';
        const clusterFeatures = feature.get('features');
        if (clusterFeatures) {
          if (clusterFeatures.length === 1) {
            content = clusterFeatures[0].get('name');
          } else {
            const names = clusterFeatures.map((f: any) => f.get('name')).sort();
            content = names.join('\n');
          }
        } else {
          content = feature.get('name');
        }

        if (content) {
          tooltipRef.current!.innerHTML = content;
          overlay.setPosition(event.coordinate);
          tooltipRef.current!.style.display = 'block';
          map.getTargetElement().style.cursor = 'pointer';
        } else {
          tooltipRef.current!.style.display = 'none';
          map.getTargetElement().style.cursor = '';
        }
      } else {
        tooltipRef.current!.style.display = 'none';
        map.getTargetElement().style.cursor = '';
      }
    });

    map.on('click', (event) => {
      const pixel = event.pixel;
      
      const stationFeature = map.forEachFeatureAtPixel(pixel, (f) => {
        const features = f.get('features');
        if (features && features.length === 1) return features[0];
        return null;
      }, {
        hitTolerance: isMobile ? 12 : 4,
        layerFilter: (l) => l === stationsLayer
      });

      if (stationFeature) {
        const coords = [stationFeature.get('lon'), stationFeature.get('lat')];
        map.getView().animate({ center: fromLonLat(coords), duration: 400 });
        
        let basinCode = '';
        const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(fromLonLat(coords));
        if (featuresAtPoint.length > 0) {
          basinCode = featuresAtPoint[0].get('CODIGO') || '';
        }

        onPointSelectRef.current?.({
          lat: stationFeature.get('lat'),
          lon: stationFeature.get('lon'),
          stationId: stationFeature.get('stationId'),
          name: stationFeature.get('name'),
          basinCode: basinCode,
        });
      } else {
        map.getView().animate({ center: event.coordinate, duration: 400 });
        const coords = toLonLat(event.coordinate);
        let basinCode = '';
        const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(event.coordinate);
        if (featuresAtPoint.length > 0) {
          basinCode = featuresAtPoint[0].get('CODIGO') || '';
        }
        onPointSelectRef.current?.({ lat: coords[1], lon: coords[0], basinCode });
      }
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapInstance.current) {
      (mapInstance.current as any)._isDraggableMode = isDraggable;
    }
  }, [isDraggable]);

  useEffect(() => {
    if (mapInstance.current) {
      mapInstance.current.updateSize();
    }
  }, [isMobile]);

  useEffect(() => {
    if (!baseLayerRef.current) return;
    const baseLayer = baseLayerRef.current;
    
    if (activeLayer === 'satellite') {
      baseLayer.setSource(new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19
      }));
    } else {
      baseLayer.setSource(new OSM());
    }
  }, [activeLayer]);

  useEffect(() => {
    if (!mapInstance.current || !selectedPoint) {
      selectionSource.current.clear();
      return;
    }

    selectionSource.current.clear();
    const selectionFeature = new Feature({
      geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat])),
      userEmail: user?.email || 'Mi selección',
      name: selectedPoint.name || '',
    });
    selectionFeature.set('stationId', selectedPoint.stationId);
    selectionFeature.set('name', selectedPoint.name);
    selectionSource.current.addFeature(selectionFeature);

    if (!isDraggable || selectedPoint.stationId) {
      mapInstance.current.getView().animate({
        center: fromLonLat([selectedPoint.lon, selectedPoint.lat]),
        duration: 500
      });
    }
  }, [selectedPoint?.lat, selectedPoint?.lon, selectedPoint?.name, user?.email]);

  useEffect(() => {
    if (!presenceSource.current) return;
    const renderPresence = () => {
      presenceSource.current.clear();
      const now = Date.now();
      presences?.forEach((presence: any) => {
        if (presence.userId === user?.uid) return;
        const updatedAt = presence.updatedAt?.toMillis?.() || (presence.updatedAt instanceof Date ? presence.updatedAt.getTime() : now);
        if (now - updatedAt > PRESENCE_EXPIRATION_MS) return;
        const feature = new Feature({
          geometry: new Point(fromLonLat([presence.longitude, presence.latitude])),
          userEmail: presence.userEmail,
          name: presence.name || '',
        });
        presenceSource.current.addFeature(feature);
      });
    };
    renderPresence();
    const pruneInterval = setInterval(renderPresence, 60000);
    return () => clearInterval(pruneInterval);
  }, [presences, user?.uid]);

  useEffect(() => {
    if (!basinsLayerRef.current || !codesLayerRef.current) return;
    
    // El color cambia a #2DEDAF si estamos en modo satelital
    const strokeColor = activeLayer === 'satellite' ? '#2DEDAF' : 'rgba(13, 145, 102, 0.7)';
    
    const vectorStyleFunction = (feature: any, resolution: number) => {
      const view = mapInstance.current?.getView();
      const zoom = view ? view.getZoomForResolution(resolution) : 0;
      const strokeWidth = (zoom && zoom >= 10) ? 3 : 1;
      let textStyle = undefined;
      
      if (zoom && zoom >= 7) {
        const codLetras = feature.get('cod_letras') || feature.get('CODIGO') || '';
        const subregion = feature.get('subregion') || feature.get('nombre_2') || '';
        const label = `${codLetras} ${subregion}`.trim();
        if (label) {
          textStyle = new Text({
            text: label,
            font: '10px "Encode Sans", sans-serif',
            fill: new Fill({ color: activeLayer === 'satellite' ? '#2DEDAF' : '#0D9166' }),
            stroke: new Stroke({ color: activeLayer === 'satellite' ? 'black' : 'white', width: 3 }),
          });
        }
      }
      return new Style({
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }), 
        text: textStyle
      });
    };

    basinsLayerRef.current.setStyle(vectorStyleFunction);
    codesLayerRef.current.setStyle(vectorStyleFunction);
  }, [activeLayer]);

  useEffect(() => {
    if (!stationsLayerRef.current || !selectionLayerRef.current) return;
    stationsLayerRef.current.setStyle((feature, resolution) => {
      const features = feature.get('features');
      const size = features.length;
      if (size > 1) {
        return new Style({
          image: new CircleStyle({
            radius: 9 + Math.min(size, 5),
            fill: new Fill({ color: 'rgba(78, 151, 202, 0.7)' }),
          }),
          text: new Text({ text: size.toString(), fill: new Fill({ color: 'white' }), font: 'bold 10px sans-serif' }),
        });
      }
      const stationFeature = features[0];
      if (selectedPoint?.stationId === stationFeature.get('stationId')) return new Style({});
      const view = mapInstance.current?.getView();
      const zoom = view ? view.getZoomForResolution(resolution) : 0;
      const radius = (zoom && zoom > 7) ? 6.5 : 3.5;
      return new Style({
        image: new CircleStyle({
          radius: radius,
          fill: new Fill({ color: '#4E97CA' }),
          stroke: new Stroke({ color: 'white', width: 0.8 }),
        })
      });
    });

    selectionLayerRef.current.setStyle(() => {
      return new Style({
        image: new CircleStyle({ 
          radius: 8, 
          stroke: new Stroke({ color: '#ffffff', width: 1.5 }), 
          fill: new Fill({ color: '#22c55e' }) 
        }),
      });
    });
  }, [selectedPoint?.stationId, isDraggable]);

  useEffect(() => {
    if (!stationsSource.current) return;
    stationsSource.current.clear();
    stations?.forEach((station: any) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([station.longitude, station.latitude])),
        name: station.name,
        stationId: station.id,
        lat: station.latitude,
        lon: station.longitude,
      });
      stationsSource.current.addFeature(feature);
    });
  }, [stations]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsReadingFile(true);
    const fileName = file.name.toLowerCase();
    try {
      let features: Feature[] = [];
      if (fileName.endsWith('.kmz')) {
        const zip = await JSZip.loadAsync(file);
        const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
        if (kmlFile) {
          const kmlContent = await zip.files[kmlFile].async('string');
          features = new KML({ extractStyles: true }).readFeatures(kmlContent, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
        }
      } else if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
        features = new GeoJSON().readFeatures(await file.text(), { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      } else if (fileName.endsWith('.kml')) {
        features = new KML({ extractStyles: true }).readFeatures(await file.text(), { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      }
      if (features.length > 0) {
        uploadedSource.current.clear();
        uploadedSource.current.addFeatures(features);
        setHasUploadedData(true);
        setIsUploadedLayerVisible(true);
        mapInstance.current?.getView().fit(uploadedSource.current.getExtent(), { padding: [50, 50, 50, 50], duration: 1000 });
        toast({ title: "Datos Cargados", description: `Se importaron ${features.length} elementos.` });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo procesar el archivo." });
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearUploadedData = () => {
    uploadedSource.current.clear();
    setHasUploadedData(false);
    setIsUploadedLayerVisible(false);
    toast({ title: "Capa eliminada", description: "Los datos cargados han sido removidos del mapa." });
  };

  const handleJumpToLocation = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Error", description: "Geolocalización no soportada." });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (mapInstance.current) {
          mapInstance.current.getView().animate({
            center: fromLonLat([longitude, latitude]),
            zoom: 15,
            duration: 1500
          });
        }
        setIsLocating(false);
        toast({ title: "Ubicación encontrada", description: "Mapa centrado en tu posición." });
      },
      (error) => {
        setIsLocating(false);
        toast({ variant: "destructive", title: "Error de GPS", description: "No se pudo obtener tu ubicación actual." });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className={cn(
      "relative h-full w-full overflow-hidden bg-muted/20 flex flex-col",
      activeLayer === 'grayscale' && "map-container-grayscale",
      activeLayer === 'satellite' && "map-container-satellite"
    )}>
      {/* Filtro SVG para simulación de Banda Roja (Red Band Grayscale) */}
      <svg className="hidden">
        <filter id="red-band-filter">
          <feColorMatrix type="matrix" values="1 0 0 0 0 
                                               1 0 0 0 0 
                                               1 0 0 0 0 
                                               0 0 0 1 0" />
        </filter>
      </svg>

      <div ref={mapRef} className="absolute inset-0 z-10" />
      <div ref={tooltipRef} className="map-tooltip" />
      
      {/* Retícula de precisión con blend mode auto-adaptativo */}
      <div 
        className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center"
        style={{ mixBlendMode: 'difference' }}
      >
        <div className="absolute w-12 h-[0.5px] bg-white opacity-90" />
        <div className="absolute h-12 w-[0.5px] bg-white opacity-90" />
        <div className="absolute w-4 h-4 rounded-full border-[0.5px] border-white opacity-90" />
      </div>

      <div className="absolute bottom-6 right-6 z-40 flex flex-row items-center gap-1.5">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
        
        {hasUploadedData && (
          <div className="flex flex-row items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={handleClearUploadedData} className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { const v = !uploadedLayerRef.current?.getVisible(); uploadedLayerRef.current?.setVisible(v); setIsUploadedLayerVisible(v); }} className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none">
              {isUploadedLayerVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-50" />}
            </Button>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleJumpToLocation} 
          disabled={isLocating}
          className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none"
        >
          {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
        </Button>

        <Popover open={isLayerPopoverOpen} onOpenChange={setIsLayerPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none">
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1 shadow-xl border-none bg-neutral-100/50 rounded-none" align="end" side="top">
            <div className="space-y-0.5">
              {[
                { id: 'osm', label: 'Estándar (Callejero)' },
                { id: 'grayscale', label: 'Estándar (B&N)' },
                { id: 'satellite', label: 'Satelital (Banda Roja)' }
              ].map((l) => (
                <button 
                  key={l.id} 
                  onClick={() => {
                    onLayerChange?.(l.id as any);
                    setIsLayerPopoverOpen(false);
                  }} 
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-[11px] font-normal rounded-none text-black transition-colors", 
                    activeLayer === l.id ? "bg-neutral-200/50" : "hover:bg-neutral-200/50"
                  )}
                >
                  <div className="flex items-center gap-2">{l.label}</div>
                  {activeLayer === l.id && <div className="h-1 w-1 rounded-full bg-black" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isReadingFile} className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none">
          {isReadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
