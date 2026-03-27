# Chart Styles

Three chart style variants are available for viewing flood telemetry data.

## Style A - Current Design

5 days of recent data displayed as a simple static chart.

**Features:**
- Shows 5 days of 15-minute interval data
- No filtering or interaction controls
- Standard implementation with realtime + recent historic data

**Implementation:**
- Uses existing chart rendering without modifications
- No downsampling applied
- Fixed time window of 5 days

## Style B - Date Range Selector

Date range selector providing access to up to 5 years of historical data.

**Features:**
- Time range buttons: 5 days, 1 month, 6 months, 1 year, 5 years
- Automatic downsampling based on selected range
- Shows total data points available

**Downsampling Strategy:**
- **5 days, 1 month**: No downsampling (15-minute intervals)
- **6 months**: Hourly values only
- **1 year**: 4-hour intervals
- **5 years**: Daily high points

**Implementation:**
- Filter data by selected time range
- Apply downsampling using LTTB (Largest Triangle Three Buckets) algorithm
- Render static chart with filtered dataset

**Files:**
- `src/client/javascripts/historic-data.js` - Downsampling logic
- `src/client/javascripts/application.js` - Filter handling
- `src/views/station.njk` - Time range button UI

## Style C - Interactive Timeline

Pan and zoom interface for exploring up to 5 years of historical data.

**Features:**
- Drag to pan through time
- Mouse wheel / pinch gesture to zoom
- Programmatic zoom controls (zoom in, zoom out, reset)
- Progressive data rendering based on zoom level

**Zoom Configuration:**
- Scale range: 1x to 50x zoom
- Touch gestures enabled for mobile devices
- Smooth transitions on programmatic zoom

**Progressive Rendering:**
- Adjusts data density based on zoom level
- 1x zoom: ~500 points rendered
- 10x zoom: ~5000 points rendered
- Uses LTTB downsampling algorithm

**Dynamic Axis Labels:**
- Zoomed out (>60 days visible): Monthly ticks
- Medium zoom (7-60 days): Weekly ticks
- Zoomed in (<7 days): 6-hour ticks

**Implementation:**
- Uses D3.js zoom behavior (`d3-zoom` v3.0.0)
- Rescales x and y axes on zoom events
- Re-renders chart with adjusted data density
- Three programmatic zoom methods: `zoomIn()`, `zoomOut()`, `resetZoom()`

**Files:**
- `src/client/javascripts/line-chart.js` - Zoom behavior and progressive rendering
- `src/client/javascripts/application.js` - Zoom button handlers
- `src/client/javascripts/historic-data.js` - Downsampling utilities
- `src/views/station.njk` - Zoom control buttons

## Technical Notes

**Data Loading:**
All styles use the same historic data loading mechanism:
- Realtime data fetched from flood service API
- Historic data loaded from IndexedDB cache (up to 5 years)
- Data merged chronologically before rendering
- Each station is handled independently with its own IndexedDB object store
- Station data is cached separately and managed per station ID
- No cross-station data dependencies or shared caching

**Performance:**
- Style A: No performance optimizations needed (5 days max)
- Style B: Static downsampling based on time range
- Style C: Dynamic downsampling based on zoom level

**Dependencies:**
- D3.js v7 (all styles)
- `d3-zoom` v3.0.0 (Style C only)
