# Historic Data

The prototype offers style A with time-range tabs and style B with a single zoomable timeline.

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

For historic views, readings are merged with recent telemetry, with recent telemetry taking precedence for duplicate timestamps. The combined readings are sorted and filtered to the selected range. Style A samples data according to the visible domain as users zoom.

Style B (`/station/single-chart?stationId=3089`) starts with the latest five days visible within a three-year timeline. It selects the highest reading in each interval, preserving that reading's timestamp and value:

- **5, 10 and 15 days:** 15-minute intervals.
- **1, 3 and 6 months:** 30-minute intervals.
- **1 and 2 years:** hourly intervals.
- **3 years:** daily maximum, labelled on the chart. Days use the viewer's local calendar.

Panning and resizing retain the selected resolution, and zooming back in restores detail from the original readings. Missing readings are not filled in. Sampling reduces plotted points, not the amount of historic data fetched.

Style B zooms through named windows: **5 days, 10 days, 15 days, 1 month, 3 months, 6 months, 1 year, 2 years and 3 years**. The first three windows divide into five axis intervals of 1, 2 and 3 days respectively. Buttons, mouse-wheel zoom and two-finger pinch use the same steps; a pinch moves one step per gesture. Months and years use calendar durations. The heading announces the selected window, including when viewing older data. Zooming keeps the right-hand date fixed unless the three-year timeline bounds require it to move. Resizing preserves the current window; reset returns to the latest five days. Style A retains continuous zoom.

Style B automatically loads historic data on opening, fetching and saving it from the Hydrology API if the cache is missing, empty or more than 24 hours old. There is no need to visit admin first. Concurrent requests for the same station share a refresh. A loading message is displayed during the request; failures show a warning above the chart rather than silently presenting incomplete history.

Docker Compose stores historic files in the `historic-data` named volume so refreshed readings survive container rebuilds and recreation. Removing this volume (for example with `docker compose down -v`) removes the saved history.

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
