'use client';

import { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';
import { Input } from '@/components/ui/input';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';

interface MapViewProps {
  onPointSelect: (point: SelectedPoint) => void;
  selectedPoint: SelectedPoint | null;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function MapView({ onPointSelect, selectedPoint }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const stationsSource = useRef<VectorSource>(new VectorSource());
  const selectionSource = useRef<VectorSource>(new VectorSource());
  const db = useFirestore();

  // Estados para el buscador
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Escuchar todas las estaciones de Firestore
  const { data: stations } = useCollection(query(collection(db, 'stations')));

  useEffect(() => {
    if (!mapRef.current) return;

    const stationsLayer = new VectorLayer({
      source: stationsSource.current,
    });

    const selectionLayer = new VectorLayer({
      source: selectionSource.current,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        stationsLayer,
        selectionLayer,
      ],
      view: new View({
        center: fromLonLat([-60.0, -37.0]), // Centrado en Provincia de Buenos Aires
        zoom: 6,
      }),
    });

    map.on('click', (event) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (f) => f);
      
      if (feature && feature.get('stationId')) {
        onPointSelect({
          lat: feature.get('lat'),
          lon: feature.get('lon'),
          stationId: feature.get('stationId'),
          name: feature.get('name'),
        });
      } else {
        const coords = toLonLat(event.coordinate);
        onPointSelect({ lat: coords[1], lon: coords[0] });
      }
      setShowResults(false);
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
    };
  }, [onPointSelect]);

  // Actualizar estaciones en el mapa
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

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: '#4E97CA' }),
            stroke: new Stroke({ color: 'white', width: 1.5 }),
          }),
          text: new Text({
            text: station.name,
            offsetY: -12,
            font: 'bold 10px Inter, sans-serif',
            fill: new Fill({ color: '#1e3a8a' }),
            padding: [2, 4, 2, 4],
          })
        })
      );

      stationsSource.current.addFeature(feature);
    });
  }, [stations]);

  // Mostrar el punto de selección actual
  useEffect(() => {
    if (!selectionSource.current || !selectedPoint) return;
    selectionSource.current.clear();
    
    if (!selectedPoint.stationId) {
      const feature = new Feature({
        geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat])),
      });

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: 'white', width: 1.5 }),
          }),
        })
      );

      selectionSource.current.addFeature(feature);
    }
  }, [selectedPoint]);

  // Lógica de búsqueda (Nominatim)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ar`
        );
        const data = await response.json();
        setSearchResults(data);
        setShowResults(true);
      } catch (error) {
        console.error('Error buscando ubicación:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg shadow-inner bg-muted/20 border-2 border-primary/10 flex flex-col">
      {/* Buscador de Lugares Integrado (Soldado arriba y a los lados) */}
      <div className="absolute top-0 left-0 right-0 z-[30]">
        <div className="relative group">
          <div className="flex items-center bg-white/95 backdrop-blur shadow-sm border-b border-primary/20 transition-all focus-within:ring-2 focus-within:ring-primary/50">
            <div className="pl-4 text-primary">
              {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </div>
            <Input 
              placeholder="Buscar ciudad, calle o paraje..." 
              className="border-0 focus-visible:ring-0 h-12 text-sm bg-transparent w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 3 && setShowResults(true)}
            />
          </div>

          {showResults && searchResults.length > 0 && (
            <Card className="absolute top-full left-0 right-0 rounded-t-none shadow-2xl border-x-0 border-t-0 border-b border-primary/10 overflow-hidden">
              <ScrollArea className="max-h-[300px]">
                <div className="p-1">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectResult(result)}
                      className="w-full text-left p-3 hover:bg-primary/5 rounded-lg transition-colors flex items-start gap-3 border-b last:border-0 border-muted"
                    >
                      <MapPin className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span className="text-xs font-medium leading-tight">{result.display_name}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </div>

      <div ref={mapRef} className="absolute inset-0 z-10" />
      
      {/* Leyenda */}
      <div className="absolute bottom-4 right-4 z-20 rounded-xl bg-white/95 p-4 shadow-xl backdrop-blur-md border border-primary/10 min-w-[180px]">
        <div className="font-bold text-primary text-sm mb-3 text-right font-headline">Guía del Mapa</div>
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estación Existente</span>
            <div className="w-3 h-3 rounded-full bg-[#4E97CA] border-2 border-white shadow-sm"></div> 
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Punto de selección</span>
            <div className="w-3 h-3 rounded-full bg-[#ef4444] border-2 border-white shadow-sm"></div> 
          </div>
        </div>
      </div>
    </div>
  );
}
