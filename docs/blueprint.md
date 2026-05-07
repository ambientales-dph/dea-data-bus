# **App Name**: GeoDatos Ambiental

## Core Features:

- Secure User Login: Users authenticate via Google. Access is granted only to emails validated against a pre-defined whitelist within the application.
- Geospatial Data Visualization: An interactive OpenLayers map displays environmental sampling locations using an OpenStreetMap base layer.
- Precise Sample Location Entry: Users can accurately pinpoint and log sample collection locations directly on the map interface.
- Dynamic Parameter Configuration: Allows users to select the type of environmental parameter (e.g., water quality, air quality) and then input specific numerical or qualitative values for chosen analytes.
- AI-Powered Parameter Guidance: An AI tool suggests relevant environmental parameters or typical value ranges based on the selected location, historical data, or monitoring best practices.
- Real-time Data Persistence: All recorded data, including geographic coordinates, collected values, timestamp, and the authenticated user's ID, is stored in a Firestore NoSQL database.
- Integrated Data Entry Interface: The application provides a two-panel layout: the interactive map for navigation on the left, and the data entry forms on the right, for efficient data logging.

## Style Guidelines:

- The color scheme is light, evoking a sense of clarity and professionalism suitable for environmental data. The primary color is a deep, natural forest green (#36773A), chosen for its association with nature and ecological responsibility, ensuring high contrast on the light background. The background color is a very subtle, almost white, light green (#EDF3EE), maintaining visual coherence. An accent color, a brighter, lively green-yellow (#80BF46), is used for interactive elements and highlights to draw attention without being disruptive. This analogous palette aims for a harmonious and calming user experience, ideal for focused data entry.
- Body and headline font: 'Inter', a clear and neutral grotesque-style sans-serif, ensuring optimal readability for numerical data and textual information across the interface.
- Use clear and universally recognizable icons, perhaps in a flat or outlined style, for map controls, data entry fields, and environmental parameter categories to maintain an uncluttered interface.
- The interface will feature a fixed two-column layout: the OpenLayers map prominently displayed on the left side, occupying a significant portion of the screen, and a dedicated data input form panel on the right side.
- Implement subtle transition animations for map interactions (e.g., zooming, panning) and form submissions, providing visual feedback to the user without distracting from data entry.