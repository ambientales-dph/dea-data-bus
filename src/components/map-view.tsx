
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
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';
import { Input } from '@/components/ui/input';
import { Search, MapPin, Loader2, Layers, Map as MapIcon, Satellite } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Importación de capas GeoJSON
import basinsData from '@/lib/cuencas_dph.geojson';
import codesData from '@/lib/codigos_cuencas.geojson';

interface MapViewProps {
  onPointSelect: (point: SelectedPoint) => void;
  selectedPoint: SelectedPoint | null;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

type BaseLayerType = 'osm' | 'grayscale' | 'satellite';

export function MapView({ onPointSelect, selectedPoint }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const stationsSource = useRef<VectorSource>(new VectorSource());
  const selectionSource = useRef<VectorSource>(new VectorSource());
  const basinsSource = useRef<VectorSource>(new VectorSource());
  const codesSource = useRef<VectorSource>(new VectorSource());
  const onPointSelectRef = useRef(onPointSelect);
  const db = useFirestore();

  const [activeLayer, setActiveLayer] = useState<BaseLayerType>('osm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    onPointSelectRef.current = onPointSelect;
  }, [onPointSelect]);

  const stationsQuery = useMemo(() => query(collection(db, 'stations')), [db]);
  const { data: stations } = useCollection(stationsQuery);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Capa de Cuencas (Visual)
    const basinsLayer = new VectorLayer({
      source: basinsSource.current,
      style: (feature, resolution) => {
        const view = mapInstance.current?.getView();
        const zoom = view ? view.getZoomForResolution(resolution) : 0;
        const strokeWidth = (zoom && zoom >= 8) ? 3 : 1;
        const strokeColor = 'rgba(13, 145, 102, 0.7)';
        
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
      },
      zIndex: 5,
    });

    // Capa de Códigos (Invisible, para detección de CODIGO)
    const codesLayer = new VectorLayer({
      source: codesSource.current,
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
        stroke: new Stroke({ color: 'rgba(0, 0, 0, 0)', width: 0 }),
      }),
      zIndex: 4,
    });

    // Cargar GeoJSONs
    try {
      const geojsonFormat = new GeoJSON();
      
      const basinFeatures = geojsonFormat.readFeatures(basinsData, { 
        featureProjection: 'EPSG:3857' 
      });
      basinsSource.current.addFeatures(basinFeatures);

      const codeFeatures = geojsonFormat.readFeatures(codesData, { 
        featureProjection: 'EPSG:3857' 
      });
      codesSource.current.addFeatures(codeFeatures);
    } catch (e) {
      console.error("Error al cargar GeoJSON:", e);
    }

    const baseLayer = new TileLayer({
      source: new OSM(),
      properties: { id: 'base-layer' }
    });

    const stationsLayer = new VectorLayer({
      source: stationsSource.current,
      zIndex: 10,
    });

    const selectionLayer = new VectorLayer({
      source: selectionSource.current,
      zIndex: 20,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, basinsLayer, codesLayer, stationsLayer, selectionLayer],
      view: new View({
        center: fromLonLat([-60.0, -37.0]),
        zoom: 5.5,
      }),
    });

    map.on('click', (event) => {
      const coords = toLonLat(event.coordinate);
      const pixel = event.pixel;
      
      const stationFeature = map.forEachFeatureAtPixel(pixel, (f) => {
        return f.get('stationId') ? f : null;
      });

      if (stationFeature) {
        onPointSelectRef.current?.({
          lat: stationFeature.get('lat'),
          lon: stationFeature.get('lon'),
          stationId: stationFeature.get('stationId'),
          name: stationFeature.get('name'),
        });
      } else {
        // Detectar código de cuenca en el punto del clic
        let basinCode = '';
        const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(event.coordinate);
        if (featuresAtPoint.length > 0) {
          basinCode = featuresAtPoint[0].get('CODIGO') || '';
        }

        onPointSelectRef.current?.({ 
          lat: coords[1], 
          lon: coords[0],
          basinCode: basinCode
        });
      }
      setShowResults(false);
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
  }, [activeLayer]);

  // Manejo de capas base
  useEffect(() => {
    if (!mapInstance.current) return;
    const layers = mapInstance.current.getLayers();
    const baseLayer = layers.getArray().find(l => l.get('id') === 'base-layer') as TileLayer<any>;
    
    if (!baseLayer) return;

    if (activeLayer === 'satellite') {
      baseLayer.setSource(new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19
      }));
    } else {
      baseLayer.setSource(new OSM());
    }

    baseLayer.on('prerender', (evt) => {
      if (activeLayer === 'grayscale') {
        const ctx = evt.context as CanvasRenderingContext2D;
        if (ctx) ctx.filter = 'grayscale(100%) brightness(0.9) contrast(1.2)';
      }
    });

    baseLayer.on('postrender', (evt) => {
      const ctx = evt.context as CanvasRenderingContext2D;
      if (ctx) ctx.filter = 'none';
    });

    mapInstance.current.render();
  }, [activeLayer]);

  // Sincronizar estaciones
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

      feature.setStyle((feat, resolution) => {
        const view = mapInstance.current?.getView();
        const zoom = view ? view.getZoomForResolution(resolution) : 0;
        const isSelected = selectedPoint?.stationId === station.id;

        return new Style({
          image: new CircleStyle({
            radius: 3.5,
            fill: new Fill({ color: isSelected ? '#ef4444' : '#4E97CA' }),
            stroke: new Stroke({ color: 'white', width: 1 }),
          }),
          text: zoom && zoom >= 8 ? new Text({
            text: station.name,
            offsetY: -12,
            font: 'bold 10px "Encode Sans", sans-serif',
            fill: new Fill({ color: isSelected ? '#ef4444' : (activeLayer === 'satellite' ? 'white' : '#1e3a8a') }),
            stroke: activeLayer === 'satellite' ? new Stroke({ color: 'black', width: 2 }) : new Stroke({ color: 'white', width: 2 }),
            padding: [2, 4, 2, 4],
          }) : undefined
        });
      });

      stationsSource.current.addFeature(feature);
    });
  }, [stations, selectedPoint?.stationId, activeLayer]);

  // Marcador de selección temporal
  useEffect(() => {
    if (!selectionSource.current) return;
    selectionSource.current.clear();
    
    if (selectedPoint && !selectedPoint.stationId) {
      const feature = new Feature({
        geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat])),
      });

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 4.5,
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: 'white', width: 1.5 }),
          }),
        })
      );

      selectionSource.current.addFeature(feature);
    }
  }, [selectedPoint]);

  const handleSelectResult = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    
    if (mapInstance.current) {
      mapInstance.current.getView().animate({
        center: fromLonLat([lon, lat]),
        zoom: 14,
        duration: 1000
      });
    }
    
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 3) return;
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ar`
        );
        const data = await response.json();
        setSearchResults(data);
        setShowResults(true);
      } catch (error) {} finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg shadow-inner bg-muted/20 border-2 border-primary/10 flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-[30] p-2 flex gap-2">
        <div className="relative flex-1">
          <div className="flex items-center bg-white/95 backdrop-blur shadow-sm border border-primary/20 rounded-md overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/50">
            <div className="pl-3 text-primary">
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </div>
            <Input 
              placeholder="Buscá una ubicación..." 
              className="border-0 focus-visible:ring-0 h-8 text-[11px] bg-transparent w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {showResults && searchResults.length > 0 && (
            <Card className="absolute top-full left-0 right-0 mt-1 shadow-2xl border-primary/10 overflow-hidden z-[40]">
              <ScrollArea className="max-h-[200px]">
                <div className="p-1">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectResult(result)}
                      className="w-full text-left p-2 hover:bg-primary/5 rounded-lg transition-colors flex items-start gap-2 border-b last:border-0"
                    >
                      <MapPin className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <span className="text-[10px] font-medium leading-tight">{result.display_name}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 bg-white/95 border-primary/20 shadow-sm text-primary">
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">Capas Base</p>
              <button onClick={() => setActiveLayer('osm')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'osm' ? "bg-primary text-white" : "hover:bg-muted")}><MapIcon className="h-3.5 w-3.5" /> OSM</button>
              <button onClick={() => setActiveLayer('grayscale')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'grayscale' ? "bg-primary text-white" : "hover:bg-muted")}><MapIcon className="h-3.5 w-3.5 opacity-50" /> Gris</button>
              <button onClick={() => setActiveLayer('satellite')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'satellite' ? "bg-primary text-white" : "hover:bg-muted")}><Satellite className="h-3.5 w-3.5" /> Satélite</button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div ref={mapRef} className="absolute inset-0 z-10" />
      
      <div className="absolute bottom-2 right-2 z-20 rounded-xl bg-white/95 p-3 shadow-xl border border-primary/10">
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Cuencas</span>
            <div className="w-4 h-[2px] bg-[#0D9166] opacity-70"></div> 
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Estaciones</span>
            <div className="w-2 h-2 rounded-full bg-[#4E97CA] border border-white"></div> 
          </div>
        </div>
      </div>
    </div>
  );
}
