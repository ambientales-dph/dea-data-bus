# Informe de Gestión: Sistema de Información "DEA Data Bus"
**Departamento de Estudios Ambientales (DEA)**  
**Dirección de Preservación Hidráulica (DPH)**

## 1. Introducción
El sistema **DEA Data Bus** constituye la plataforma centralizada de captura, gestión y visualización de datos ambientales en tiempo real del Departamento de Estudios Ambientales. Esta herramienta ha sido diseñada para transformar el proceso de recolección de datos en campo, eliminando la dependencia del papel y asegurando la integridad de la información desde el punto de origen (la estación de monitoreo) hasta la base de datos central.

## 2. Objetivos del Sistema
*   **Centralización:** Unificar los diversos protocolos de monitoreo (agua, aire, suelo, auditoría) en una interfaz única y coherente.
*   **Rigor Técnico:** Garantizar que la carga de datos respete las unidades, nomenclaturas y metodologías científicas internacionales.
*   **Trazabilidad:** Registrar con precisión el "quién", "cuándo" y "dónde" de cada medición capturada.
*   **Agilidad Operativa:** Reducir los tiempos de procesamiento de datos entre la toma de muestra y la disponibilidad de la información para análisis técnico.

## 3. Necesidades Operativas Satisfechas
*   **Funcionamiento en Zonas Remotas:** Capacidad de operar sin conexión a internet (Offline First), resguardando los datos localmente y sincronizándolos de forma automática al detectar señal.
*   **Georreferenciación de Alta Precisión:** Integración directa con sensores GPS para validar la ubicación física del técnico durante el muestreo.
*   **Documentación Fotográfica con Metadatos:** Registro de evidencias visuales que incluyen automáticamente marcas de agua con fecha, hora, coordenadas y firma del técnico.
*   **Versatilidad de Protocolos:** Capacidad de adaptarse a diferentes matrices ambientales mediante formularios especializados y constructores de protocolos a medida.

## 4. Áreas de Aplicación y Usos
El sistema es utilizado activamente en las siguientes líneas de trabajo:
1.  **Monitoreo de Cuencas Hídricas:** Carga de parámetros in situ y de laboratorio para aguas superficiales (Protocolo AS-001).
2.  **Control de Acuíferos:** Gestión de redes de freatímetros y medición de niveles estáticos (Protocolo FTA-001).
3.  **Estudios de Suelos y Geotecnia:** Perfiles edafológicos y registros de sondeos mecánicos (Protocolos PE-001 y MS-001).
4.  **Calidad de Aire:** Monitoreo de material particulado y gases (Protocolo CA-001).
5.  **Auditoría Ambiental de Obras:** Inspecciones de cumplimiento de planes de gestión ambiental (Protocolo PGAyS-001).

## 5. Flujo de Trabajo Técnico (Core Workflow)
El sistema impone un flujo de trabajo lógico que garantiza la calidad del dato:

1.  **Identificación y Posicionamiento:** El técnico inicia sesión y se ubica geográficamente mediante un mapa interactivo. Puede seleccionar una estación existente o registrar un nuevo punto de muestreo validado por GPS.
2.  **Apertura de Reporte de Monitoreo (RM):** Se crea un contenedor de información (Reporte) que agrupa todas las actividades realizadas en esa visita. Este reporte puede vincularse a una "Campaña" (Levantamiento) superior para una gestión por proyectos.
3.  **Selección de Protocolo:** El técnico elige el instrumento de carga adecuado (Agua, Suelo, etc.) o ensambla un **Protocolo Personalizado (PP-001)** seleccionando analitos específicos de un catálogo maestro.
4.  **Captura de Datos Multilectura:** Para parámetros críticos (como pH, conductividad o SPT), el sistema permite ingresar múltiples lecturas consecutivas, calculando automáticamente promedios y errores estadísticos para asegurar la estabilización de la medida.
5.  **Registro de Evidencia:** Se capturan fotografías del entorno, de las muestras o de actas firmadas. El sistema procesa estas imágenes, las comprime y les inyecta metadatos técnicos de trazabilidad.
6.  **Cierre y Sincronización:** Una vez finalizada la carga, el técnico cierra la planilla. Si hay conexión, los datos viajan a la red de inmediato; de lo contrario, el sistema gestiona una cola de sincronización inteligente que se activa en segundo plano.
7.  **Auditoría y Consulta:** La información queda disponible instantáneamente en el historial de la estación y en el log de actividad global para su revisión por parte de la jefatura del Departamento.

## 6. Tecnología de Información
El sistema se basa en una arquitectura web moderna de alto rendimiento:
*   **Interfaz de Usuario (UI):** Desarrollada con componentes de grado industrial que priorizan el alto contraste y la legibilidad bajo condiciones de luz solar intensa.
*   **Geoprocesamiento (GIS):** Integración de capas vectoriales GeoJSON para la visualización de límites de cuencas hídricas y zonas de gestión.
*   **Aplicación Web Progresiva (PWA):** El software se instala en dispositivos móviles como una aplicación nativa, permitiendo el acceso rápido y el uso de recursos de hardware (cámara, GPS) sin necesidad de una tienda de aplicaciones.
*   **Estructura de Datos:** Utiliza un modelo de datos flexible y escalable que permite la evolución constante de los protocolos sin interrupciones del servicio.

## 7. Conclusión
El **DEA Data Bus** no es solo una base de datos, sino un instrumento técnico de precisión que estandariza el comportamiento operativo del personal en campo. Su implementación asegura que el Departamento de Estudios Ambientales cuente con información fidedigna, georreferenciada y auditable para la toma de decisiones sobre el recurso hídrico y ambiental de la provincia.
