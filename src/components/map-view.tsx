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
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import Translate from 'ol/interaction/Translate';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Layers, Upload, Map as MapIcon, Satellite, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';
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

  const [hoveredText, setHoveredText] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
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

    const basinsLayer = new VectorLayer({
      source: basinsSource.current,
      zIndex: 5,
      minZoom: 6.5,
    });
    basinsLayerRef.current = basinsLayer;

    const codesLayer = new VectorLayer({
      source: codesSource.current,
      zIndex: 4,
      maxZoom: 6.5,
    });
    codesLayerRef.current = codesLayer;

    const baseLayer = new TileLayer({
      source: new OSM(),
      properties: { id: 'base-layer' }
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
        if (features && features.length === 1) {
          return features[0];
        }
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
        onPointSelectRef.current?.({ 
          lat: coords[1], 
          lon: coords[0],
          basinCode: basinCode
        });
      }
    });

    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const pixel = map.getEventPixel(evt.originalEvent);
      
      const feature = map.forEachFeatureAtPixel(pixel, (f) => f, {
        hitTolerance: 8
      });

      if (feature) {
        const isSelection = selectionSource.current.getFeatures().includes(feature as any);
        if (isSelection && isDraggable) {
          map.getTargetElement().style.cursor = 'move';
          setHoveredText("Arrastrar para reubicar punto");
          setTooltipPos({ x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });
          return;
        }

        let text = '';
        const features = feature.get('features');

        if (features) {
          const names = features.map((f: any) => f.get('name')).filter(Boolean);
          text = names.join('\n');
        } else {
          const email = feature.get('userEmail');
          const name = feature.get('name');

          if (email && name) text = `${email} - ${name}`;
          else if (email) text = email;
          else if (name) text = name;
        }

        if (text) {
          setHoveredText(text);
          setTooltipPos({ x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });
          map.getTargetElement().style.cursor = 'pointer';
        } else {
          setHoveredText(null);
          setTooltipPos(null);
          map.getTargetElement().style.cursor = '';
        }
      } else {
        setHoveredText(null);
        setTooltipPos(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
  }, [isMobile]);

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

    basinsLayerRef.current.setStyle((feature, resolution) => {
      const view = mapInstance.current?.getView();
      const zoom = view ? view.getZoomForResolution(resolution) : 0;
      const strokeWidth = (zoom && zoom >= 10) ? 3 : 1;
      
      let textStyle = undefined;
      if (zoom && zoom >= 7) {
        const codLetras = feature.get('cod_letras') || '';
        const subregion = feature.get('subregion') || '';
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
    });

    codesLayerRef.current.setStyle(() => {
      return new Style({
        stroke: new Stroke({ color: strokeColor, width: 0.5 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
      });
    });

  }, [activeLayer]);

  useEffect(() => {
    if (!stationsLayerRef.current || !selectionLayerRef.current || !presenceLayerRef.current) return;

    stationsLayerRef.current.setStyle((feature, resolution) => {
      const features = feature.get('features');
      const size = features.length;

      if (size > 1) {
        return new Style({
          image: new CircleStyle({
            radius: 9 + Math.min(size, 5),
            fill: new Fill({ color: 'rgba(78, 151, 202, 0.7)' }),
            stroke: undefined,
          }),
          text: new Text({
            text: size.toString(),
            fill: new Fill({ color: 'white' }),
            font: 'bold 10px "Encode Sans", sans-serif',
          }),
        });
      }

      const stationFeature = features[0];
      const isSelected = selectedPoint?.stationId === stationFeature.get('stationId');

      if (isSelected) {
        return new Style({});
      }

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
        // Estilo DIANA para modo edición/creación
        return [
          new Style({
            image: new CircleStyle({
              radius: 14,
              stroke: new Stroke({ color: '#22c55e', width: 2 }),
            }),
          }),
          new Style({
            image: new CircleStyle({
              radius: 6,
              stroke: new Stroke({ color: '#22c55e', width: 1.5 }),
              fill: new Fill({ color: 'white' }),
            }),
          }),
          new Style({
            image: new CircleStyle({
              radius: 2,
              fill: new Fill({ color: '#22c55e' }),
            }),
          }),
          // Crosshairs
          new Style({
            text: new Text({
              text: '+',
              font: 'bold 24px Arial',
              fill: new Fill({ color: '#22c55e' }),
              offsetY: -0.5
            })
          })
        ];
      }

      return new Style({
        image: new CircleStyle({
          radius: 8,
          stroke: new Stroke({ color: '#22c55e', width: 2 }),
          fill: new Fill({ color: 'rgba(34, 197, 94, 0.6)' }),
        }),
        image2: new CircleStyle({
          radius: 2,
          fill: new Fill({ color: '#ffffff' })
        })
      });
    });

    presenceLayerRef.current.setStyle(() => {
      return new Style({
        image: new CircleStyle({
          radius: 3,
          stroke: new Stroke({ color: '#ef4444', width: 0.8 }),
          fill: new Fill({ color: 'rgba(239, 68, 68, 0.4)' }),
        })
      });
    });

  }, [activeLayer, selectedPoint?.stationId, isDraggable]);

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

    const listener = (evt: any) => {
      const ctx = evt.context as CanvasRenderingContext2D;
      if (!ctx) return;
      if (activeLayer === 'grayscale') {
        ctx.filter = 'grayscale(100%) brightness(0.9) contrast(1.2)';
      }
    };
    
    const postListener = (evt: any) => {
      const ctx = evt.context as CanvasRenderingContext2D;
      if (!ctx) return;
      if (activeLayer === 'satellite') {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = '#000000'; 
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'color-dodge';
        ctx.fillStyle = '#B0B0B0'; 
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = '#A0A0A0';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }
      ctx.filter = 'none';
    };

    baseLayer.on('prerender', listener);
    baseLayer.on('postrender', postListener);

    return () => {
      baseLayer.un('prerender', listener);
      baseLayer.un('postrender', postListener);
    };
  }, [activeLayer]);

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
          const kmlFormat = new KML({ extractStyles: true });
          features = kmlFormat.readFeatures(kmlContent, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          });
        }
      } else if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
        const content = await file.text();
        const geojsonFormat = new GeoJSON();
        features = geojsonFormat.readFeatures(content, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
      } else if (fileName.endsWith('.kml')) {
        const content = await file.text();
        const kmlFormat = new KML({ extractStyles: true });
        features = kmlFormat.readFeatures(content, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
      }

      if (features.length > 0) {
        uploadedSource.current.clear();
        uploadedSource.current.addFeatures(features);
        setHasUploadedData(true);
        setIsUploadedLayerVisible(true);
        uploadedLayerRef.current?.setVisible(true);
        
        const extent = uploadedSource.current.getExtent();
        mapInstance.current?.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 1000
        });

        toast({
          title: "Datos Cargados",
          description: `Se importaron ${features.length} elementos desde ${file.name}.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error de Formato",
          description: "No se encontraron elementos válidos en el archivo.",
        });
      }
    } catch (err) {
      console.error("File error", err);
      toast({
        variant: "destructive",
        title: "Error de lectura",
        description: "No se pudo procesar el archivo seleccionado.",
      });
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleUploadedLayer = () => {
    if (uploadedLayerRef.current) {
      const visible = !uploadedLayerRef.current.getVisible();
      uploadedLayerRef.current.setVisible(visible);
      setIsUploadedLayerVisible(visible);
    }
  };

  const clearUploadedLayer = () => {
    uploadedSource.current.clear();
    setHasUploadedData(false);
    setIsUploadedLayerVisible(true);
    toast({
      title: "Capa Eliminada",
      description: "Los datos importados han sido removidos del mapa.",
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/20 flex flex-col">
      <div ref={mapRef} className="absolute inset-0 z-10" />

      {hoveredText && tooltipPos && (
        <div 
          className="fixed z-[100] pointer-events-none bg-gray-200/30 text-black px-2 py-1 rounded-none text-[9px] font-code shadow-none transform -translate-x-1/2 -translate-y-full mb-4 transition-opacity duration-200 whitespace-pre-line"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {hoveredText}
        </div>
      )}

      <div className="absolute bottom-6 right-6 z-40 flex flex-row items-center gap-1.5">
        <input 
          type="file" 
          ref={fileInputRef} 
          accept=".kml,.kmz,.json,.geojson" 
          className="hidden" 
          onChange={handleFileSelect} 
        />
        
        {hasUploadedData && (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleUploadedLayer}
              className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none transition-all"
              title={isUploadedLayerVisible ? "Ocultar Capa Importada" : "Mostrar Capa Importada"}
            >
              {isUploadedLayerVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-50" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={clearUploadedLayer}
              className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none transition-all hover:text-destructive"
              title="Eliminar Capa Importada"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none transition-all"
              title="Capas Base"
            >
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 shadow-2xl border-primary/10 rounded-none" align="end" side="top">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1.5 tracking-widest border-b mb-1">Capas Base</p>
              <button onClick={() => onLayerChange?.('osm')} className={cn("w-full flex items-center justify-between p-2 rounded-none text-[11px] font-medium transition-colors", activeLayer === 'osm' ? "bg-primary text-white" : "hover:bg-muted")}>
                <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> Estándar</div>
                {activeLayer === 'osm' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </button>
              <button onClick={() => onLayerChange?.('grayscale')} className={cn("w-full flex items-center justify-between p-2 rounded-none text-[11px] font-medium transition-colors", activeLayer === 'grayscale' ? "bg-primary text-white" : "hover:bg-muted")}>
                <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5 opacity-50" /> Grises</div>
                {activeLayer === 'grayscale' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </button>
              <button onClick={() => onLayerChange?.('satellite')} className={cn("w-full flex items-center justify-between p-2 rounded-none text-[11px] font-medium transition-colors", activeLayer === 'satellite' ? "bg-primary text-white" : "hover:bg-muted")}>
                <div className="flex items-center gap-2"><Satellite className="h-3.5 w-3.5" /> Satélite</div>
                {activeLayer === 'satellite' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => fileInputRef.current?.click()}
          disabled={isReadingFile}
          className="h-8 w-8 rounded-none bg-gray-200/30 hover:bg-white/50 text-black shadow-none transition-all"
          title="Importar KML/KMZ/GeoJSON"
        >
          {isReadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
