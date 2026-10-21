# Historic Data

The prototype uses one interactive chart, formerly style C. Chart styles A and B and their selection controls have been removed.

## Managing historic data

1. Follow **Manage historic data** from the home screen.
2. Enter a station's RLOI ID and select **Fetch Historic Data**.
3. The server fetches 3 years of historic readings from the Hydrology API and stores them in `data/historic/<stationId>.json`.
4. Follow the station ID link in the stored-stations table to open its chart.

Stored data is shared across browser sessions. Stations can be removed from the admin page, except for the protected default station, 3089.

## Viewing a station

The home screen asks only for an optional station ID. Leaving it blank opens station 3089. Station URLs use `/station?stationId=3089`; no chart-style parameter is needed.

The chart offers four time ranges:

- **5 days** (default): recent telemetry, with the latest-data CSV download.
- **6 months**, **1 year** and **3 years**: historic views with pan and zoom controls.

Historic ranges are disabled when no stored data is available. Historic readings are loaded on demand from `/station/historic-data?stationId=<stationId>`.

For historic views, readings are merged with recent telemetry, with recent telemetry taking precedence for duplicate timestamps. The combined readings are sorted and filtered to the selected range. The chart renderer samples data according to the visible domain as users zoom; the former style B sampling path is no longer used.

Reference-line controls for the latest level, highest recorded level and top of the normal range are available on every station chart.

## Implementation

- [Admin routes](../src/routes/admin.js): fetching, listing and deleting stored station data.
- [Station routes](../src/routes/station.js): station page and historic-data endpoint.
- [Historic-data helpers](../src/client/javascripts/historic-data.js): merging and time-range filtering.
- [Application](../src/client/javascripts/application.js): lazy loading, time filters and interactive rendering.
- [Chart data processing](../src/client/javascripts/line-chart-data.js): visible-domain sampling.
- [Station template](../src/views/station.njk): chart, filters and controls.

## Tests

Regression tests cover historic-data merging and filtering, interactive chart rendering without a style selection, station-only form redirects, legacy chart-style URLs and admin station links.
