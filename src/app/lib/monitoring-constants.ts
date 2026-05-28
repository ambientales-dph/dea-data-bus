
/**
 * @fileOverview Definición estática de protocolos y datos geográficos para funcionamiento offline.
 */

export const MONITORING_TEMPLATES = [
  {
    id: "agua_superficial",
    nombre: "Agua Superficial (Protocolo AS-001)",
    medium: "agua_superficial",
    parametros: [
      { nombre: "Turbidez/Turbiedad", categoria: "Fisicoquímico", unidades: "NTU" },
      { nombre: "Sólidos Suspendidos", categoria: "Sólidos", unidades: "mg/l" },
      { nombre: "Nitrógeno Amoniacal", categoria: "Nutrientes", unidades: "mg/l" },
      { nombre: "Fosforo total", categoria: "Nutrientes", unidades: "mg/l" },
      { nombre: "Coliformes totales", categoria: "Microbiología", unidades: "3NMP/100ml" },
      { nombre: "Arsenico", categoria: "Metales", unidades: "mg/l" },
      { nombre: "Plomo", categoria: "Metales", unidades: "mg/l" }
    ]
  },
  {
    id: "agua_subterranea",
    nombre: "Freatímetros (Protocolo FTA-001)",
    medium: "agua_subterranea",
    parametros: [
      { nombre: "Cota Brocal", categoria: "Geometría", unidades: "m s.n.m." },
      { nombre: "Nivel Estático", categoria: "Campo", unidades: "m" },
      { nombre: "pH", categoria: "Campo", unidades: "upH" },
      { nombre: "Conductividad", categoria: "Campo", unidades: "μS/cm" },
      { nombre: "Temperatura", categoria: "Campo", unidades: "°C" }
    ]
  },
  {
    id: "calidad_aire",
    nombre: "Calidad de Aire (Protocolo CA-001)",
    medium: "aire",
    parametros: [
      { nombre: "PM10", categoria: "Particulado", unidades: "µg/m³" },
      { nombre: "PM2.5", categoria: "Particulado", unidades: "µg/m³" },
      { nombre: "CO", categoria: "Gases", unidades: "ppm" },
      { nombre: "NO2", categoria: "Gases", unidades: "ppm" },
      { nombre: "SO2", categoria: "Gases", unidades: "ppm" },
      { nombre: "O3", categoria: "Gases", unidades: "ppm" }
    ]
  },
  {
    id: "suelo_edafologico",
    nombre: "Perfil Edafológico (Protocolo PE-001)",
    medium: "suelo",
    parametros: [] // Se maneja dinámicamente en su componente específico
  },
  {
    id: "suelo_geotecnia",
    nombre: "Mecánica de suelos (MS-001)",
    medium: "suelo",
    parametros: [] // Se maneja dinámicamente en su componente específico
  },
  {
    id: "pgays_inspeccion",
    nombre: "Inspección de Obra (PGAyS-001)",
    medium: "sedimentos", // Usamos sedimentos como medio técnico para diferenciar en la lista si fuera necesario
    parametros: [] 
  }
];

export const BASIN_CODES_DATA = {
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "CODIGO": "MAI", "nombre_2": "Maipu" }, "geometry": { "type": "Point", "coordinates": [-57.88, -36.86] } },
    { "type": "Feature", "properties": { "CODIGO": "SAL", "nombre_2": "Salado" }, "geometry": { "type": "Point", "coordinates": [-59.98, -35.74] } },
    { "type": "Feature", "properties": { "CODIGO": "Luj", "nombre_2": "Lujan" }, "geometry": { "type": "Point", "coordinates": [-58.92, -34.45] } },
    { "type": "Feature", "properties": { "CODIGO": "REC", "nombre_2": "Reconquista" }, "geometry": { "type": "Point", "coordinates": [-58.62, -34.48] } },
    { "type": "Feature", "properties": { "CODIGO": "RPM", "nombre_2": "Vertiente Río de La Plata Intermedia" }, "geometry": { "type": "Point", "coordinates": [-58.00, -34.70] } },
    { "type": "Feature", "properties": { "CODIGO": "RSA", "nombre_2": "Vertiente del Río Samborombón Autóctona" }, "geometry": { "type": "Point", "coordinates": [-58.30, -35.20] } },
    { "type": "Feature", "properties": { "CODIGO": "VAS", "nombre_2": "Vertiente del Río de la Plata Superior" }, "geometry": { "type": "Point", "coordinates": [-58.50, -34.45] } },
    { "type": "Feature", "properties": { "CODIGO": "VASE", "nombre_2": "Vertiente del Río de la Plata Superior (Extremo)" }, "geometry": { "type": "Point", "coordinates": [-58.60, -34.30] } }
  ]
};
