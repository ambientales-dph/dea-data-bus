
/**
 * @fileOverview Definición estática de protocolos y datos geográficos para funcionamiento offline.
 * Se ha expandido el catálogo de parámetros para alimentar al constructor de plantillas PP-001.
 */

export const MONITORING_TEMPLATES = [
  {
    id: "agua_superficial",
    nombre: "Agua Superficial (Protocolo AS-001)",
    medium: "agua_superficial",
    parametros: [
      { nombre: "Temperatura", categoria: "In Situ", unidades: "°C" },
      { nombre: "pH", categoria: "In Situ", unidades: "upH" },
      { nombre: "Conductividad", categoria: "In Situ", unidades: "µS/cm" },
      { nombre: "Oxígeno Disuelto", categoria: "In Situ", unidades: "mg/L" },
      { nombre: "Turbidez/Turbiedad", categoria: "In Situ", unidades: "NTU" },
      { nombre: "Sólidos Disueltos Totales", categoria: "In Situ", unidades: "mg/L" },
      { nombre: "Salinidad", categoria: "In Situ", unidades: "PSU" },
      { nombre: "ORP", categoria: "In Situ", unidades: "mV" },
      { nombre: "Caudal", categoria: "In Situ", unidades: "m³/s" },
      { nombre: "Tirante (H)", categoria: "In Situ", unidades: "m" },
      { nombre: "Nitrógeno Amoniacal", categoria: "Nutrientes", unidades: "mg/L" },
      { nombre: "Nitrógeno total", categoria: "Nutrientes", unidades: "mg/L" },
      { nombre: "Fosforo total", categoria: "Nutrientes", unidades: "mg/L" },
      { nombre: "DBO5", categoria: "Orgánicos", unidades: "mg/L" },
      { nombre: "Coliformes totales", categoria: "Microbiología", unidades: "NMP/100ml" },
      { nombre: "Escherichia coli", categoria: "Microbiología", unidades: "NMP/100ml" },
      { nombre: "Arsénico", categoria: "Metales", unidades: "mg/L" },
      { nombre: "Plomo", categoria: "Metales", unidades: "mg/L" },
      { nombre: "Cadmio", categoria: "Metales", unidades: "µg/L" },
      { nombre: "Cromo", categoria: "Metales", unidades: "mg/L" }
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
      { nombre: "Conductividad", categoria: "Campo", unidades: "µS/cm" },
      { nombre: "Temperatura", categoria: "Campo", unidades: "°C" },
      { nombre: "Plomo (Pb)", categoria: "Laboratorio", unidades: "mg/L" },
      { nombre: "Cadmio (Cd)", categoria: "Laboratorio", unidades: "mg/L" },
      { nombre: "Arsénico (As)", categoria: "Laboratorio", unidades: "mg/L" },
      { nombre: "TPH (Hidrocarburos)", categoria: "Laboratorio", unidades: "mg/L" }
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
    parametros: [
      { nombre: "Lugar / Localidad", categoria: "General", unidades: "" },
      { nombre: "Punto Específico", categoria: "General", unidades: "GPS" },
      { nombre: "Paisaje / Forma", categoria: "Entorno", unidades: "" },
      { nombre: "Material Originario", categoria: "Geología", unidades: "" },
      { nombre: "Clima / Región", categoria: "Entorno", unidades: "" },
      { nombre: "Vegetación / Cultivo", categoria: "Entorno", unidades: "" },
      { nombre: "Drenaje", categoria: "Propiedades", unidades: "0-6" },
      { nombre: "Pendiente", categoria: "Propiedades", unidades: "%" },
      { nombre: "Profundidad Napa", categoria: "Propiedades", unidades: "m" },
      { nombre: "Serie de Suelo", categoria: "Clasificación", unidades: "" }
    ]
  },
  {
    id: "suelo_geotecnia",
    nombre: "Mecánica de suelos (MS-001)",
    medium: "suelo",
    parametros: [
      { nombre: "Sondeo Nº", categoria: "Encabezado", unidades: "" },
      { nombre: "Profundidad (m)", categoria: "Encabezado", unidades: "m" },
      { nombre: "Golpes SPT", categoria: "Estratigrafía", unidades: "N" },
      { nombre: "Límite Atterberg LL", categoria: "Estratigrafía", unidades: "%" },
      { nombre: "Límite Atterberg IP", categoria: "Estratigrafía", unidades: "%" },
      { nombre: "Expansión Libre (FST)", categoria: "Estratigrafía", unidades: "%" },
      { nombre: "Humedad Natural (W)", categoria: "Estratigrafía", unidades: "%" },
      { nombre: "Pasante Tamiz #200", categoria: "Estratigrafía", unidades: "%" },
      { nombre: "Densidad δH/S", categoria: "Estratigrafía", unidades: "gr/cm³" },
      { nombre: "Cohesión (Cu)", categoria: "Estratigrafía", unidades: "kg/cm²" },
      { nombre: "Ángulo Fricción (∅u)", categoria: "Estratigrafía", unidades: "°" },
      { nombre: "Clasificación USCS", categoria: "Estratigrafía", unidades: "" }
    ]
  },
  {
    id: "pgays_inspeccion",
    nombre: "Inspección de Obra (PGAyS-001)",
    medium: "sedimentos",
    parametros: [
      { nombre: "Empresa Contratista", categoria: "Encabezado", unidades: "" },
      { nombre: "% Avance Obra", categoria: "Encabezado", unidades: "%" },
      { nombre: "Personal en Obra", categoria: "Encabezado", unidades: "" },
      { nombre: "Cerramiento y Vallado", categoria: "Higiene y Seguridad", unidades: "SI/NO" },
      { nombre: "Señalética y Cartelería", categoria: "Higiene y Seguridad", unidades: "SI/NO" },
      { nombre: "Uso correcto de EPP", categoria: "Higiene y Seguridad", unidades: "SI/NO" },
      { nombre: "Orden del obrador", categoria: "Gestión Ambiental", unidades: "SI/NO" },
      { nombre: "Manejo de RSU", categoria: "Gestión Ambiental", unidades: "SI/NO" },
      { nombre: "Contención de Hidrocarburos", categoria: "Gestión Ambiental", unidades: "SI/NO" },
      { nombre: "Control de Polvo", categoria: "Frente de Obra", unidades: "SI/NO" },
      { nombre: "Control de Ruidos", categoria: "Frente de Obra", unidades: "SI/NO" },
      { nombre: "Protección de Arbolado", categoria: "Frente de Obra", unidades: "SI/NO" },
      { nombre: "Atención de Reclamos", categoria: "Comunidad", unidades: "SI/NO" }
    ] 
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
