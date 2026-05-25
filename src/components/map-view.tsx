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
import { Style, Text, Fill, Circle as CircleStyle, Stroke, RegularShape } from 'ol/style';
import Translate from 'ol/interaction/Translate';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Layers, Upload, Map as MapIcon, Satellite, Loader2, Eye, EyeOff, Locate, Trash2 } from 'lucide-react';
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
  const translateInteractionRef = useRef<Translate | null>(null);
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

  useEffect(() => {
    onPointSelectRef.current = onPointSelect;
  }, [onPointSelect]);

  const stationsQuery = useMemo(() => query(collection(db, 'stations')), [db]);
  const { data: stations } = useCollection(stationsQuery);

  const presenceQuery = useMemo(() => query(collection(db, 'presence')), [db]);
  const { data: presences } = useCollection(presenceQuery);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const vectorStyle = new Style({
      stroke: new Stroke({ color: 'rgba(13, 145, 102, 0.7)', width: 1 }),
      fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }) 
    });

    const basinsLayer = new VectorLayer({
      source: basinsSource.current,
      zIndex: 5,
      minZoom: 6.5,
      style: vectorStyle
    });
    basinsLayerRef.current = basinsLayer;

    const codesLayer = new VectorLayer({
      source: codesSource.current,
      zIndex: 4,
      maxZoom: 6.5,
      style: vectorStyle
    });
    codesLayerRef.current = codesLayer;

    const initialSource = activeLayer === 'satellite' 
      ? new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 })
      : new OSM();

    const baseLayer = new TileLayer({
      source: initialSource,
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
        zoom: 5.5,
      }),
    });

    // Tooltip Overlay
    const overlay = new Overlay({
      element: tooltipRef.current!,
      offset: [0, -10],
      positioning: 'bottom-center',
    });
    map.addOverlay(overlay);

    const translateInteraction = new Translate({
      layers: [selectionLayer],
      hitTolerance: isMobile ? 15 : 8,
    });
    translateInteraction.setActive(!!isDraggable);
    map.addInteraction(translateInteraction);
    translateInteractionRef.current = translateInteraction;

    translateInteraction.on('translateend', (event) => {
      const feature = event.features.item(0);
      if (!feature) return;
      const geometry = feature.getGeometry() as Point;
      const coordinate = geometry.getCoordinates();
      const lonLat = toLonLat(coordinate);
      
      let basinCode = '';
      const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(coordinate);
      if (featuresAtPoint.length > 0) {
        basinCode = featuresAtPoint[0].get('CODIGO') || '';
      }

      onPointSelectRef.current?.({
        lat: lonLat[1],
        lon: lonLat[0],
        stationId: feature.get('stationId'),
        name: feature.get('name'),
        basinCode: basinCode
      });
    });

    // Hover handler
    map.on('pointermove', (event) => {
      if (event.dragging) return;
      
      const pixel = map.getEventPixel(event.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (f) => f, {
        layerFilter: (l) => l === stationsLayer || l === selectionLayer,
        hitTolerance: isMobile ? 12 : 5
      });

      if (feature) {
        let name = '';
        // Manejo de clusters
        const clusterFeatures = feature.get('features');
        if (clusterFeatures && clusterFeatures.length === 1) {
          name = clusterFeatures[0].get('name');
        } else if (!clusterFeatures) {
          // No es un cluster (ej: selección actual)
          name = feature.get('name');
        }

        if (name) {
          tooltipRef.current!.innerHTML = name;
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
      const coords = toLonLat(event.coordinate);
      const pixel = event.pixel;
      let basinCode = '';
      const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(event.coordinate);
      if (featuresAtPoint.length > 0) {
        basinCode = featuresAtPoint[0].get('CODIGO') || '';
      }

      const stationFeature = map.forEachFeatureAtPixel(pixel, (f) => {
        const features = f.get('features');
        if (features && features.length === 1) return features[0];
        return null;
      }, {
        hitTolerance: isMobile ? 12 : 4,
        layerFilter: (l) => l === stationsLayer
      });

      if (stationFeature) {
        onPointSelectRef.current?.({
          lat: stationFeature.get('lat'),
          lon: stationFeature.get('lon'),
          stationId: stationFeature.get('stationId'),
          name: stationFeature.get('name'),
          basinCode: basinCode,
        });
      } else {
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
    if (translateInteractionRef.current) {
      translateInteractionRef.current.setActive(!!isDraggable);
    }
  }, [isDraggable]);

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

    mapInstance.current.getView().animate({
      center: fromLonLat([selectedPoint.lon, selectedPoint.lat]),
      duration: 500
    });
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
    
    const strokeColor = 'rgba(13, 145, 102, 0.7)';
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
            fill: new Fill({ color: activeLayer === 'satellite' ? 'white' : '#0D9166' }),
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
      if (isDraggable) {
        return [
          new Style({
            image: new CircleStyle({ radius: 15, stroke: new Stroke({ color: '#000000', width: 0.5 }) }),
          }),
          new Style({
            image: new RegularShape({
              stroke: new Stroke({ color: '#000000', width: 0.5 }),
              points: 4,
              radius: 20,
              radius2: 0,
              angle: 0,
            }),
          })
        ];
      }
      return new Style({
        image: new CircleStyle({ radius: 8, stroke: new Stroke({ color: '#ffffff', width: 2 }), fill: new Fill({ color: '#22c55e' }) }),
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
      <div ref={mapRef} className="absolute inset-0 z-10" />
      <div ref={tooltipRef} className="map-tooltip" />
      
      <div className="absolute bottom-6 right-6 z-40 flex flex-row items-center gap-1.5">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
        
        {hasUploadedData && (
          <div className="flex flex-row items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={handleClearUploadedData} className="h-8 w-8 rounded-none bg-destructive/10 hover:bg-destructive/20 text-destructive shadow-none">
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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none">
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 shadow-2xl rounded-none" align="end" side="top">
            <div className="space-y-1">
              {['osm', 'grayscale', 'satellite'].map((l) => (
                <button key={l} onClick={() => onLayerChange?.(l as any)} className={cn("w-full flex items-center justify-between p-2 text-[11px] font-medium rounded-none", activeLayer === l ? "bg-primary text-white" : "hover:bg-muted")}>
                  <div className="flex items-center gap-2 capitalize">{l === 'osm' ? 'Estándar' : l === 'grayscale' ? 'Grises' : 'Satélite'}</div>
                  {activeLayer === l && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
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