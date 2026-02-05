# Historic Data Upload Feature

This feature allows users to upload historic telemetry data from CSV files downloaded from the Hydrology website and view it alongside real-time data.

## Features

### 1. CSV Upload
- Collect the historic data from the Hydrology site e.g. https://environment.data.gov.uk/hydrology/station/7da7bf7a-21a3-486a-a4aa-1280770bf512
- On the hydrology site goto the 'Download as csv' tab
- Download the 15min complete record file
- Click the "Upload Historic Data CSV" button next to the "Download data CSV" button
- Select the CSV file from your local machine
- The file must contain `dateTime` and `value` columns
- Only data from the last 5 years will be imported
- Uploaded data is stored in browser IndexedDB and persists across page refreshes
- Subsequent uploads replace previous uploads

### 2. Time Range Filtering
Five filter buttons allow you to view different time ranges:
- **5 days** (default) - Shows data from the last 5 days
- **1 month** - Shows data from the last 30 days
- **6 months** - Shows data from the last 6 months
- **1 year** - Shows data from the last 365 days
- **5 years** - Shows all available data (up to 5 years)

### 3. Data Merging
- Historic data is automatically merged with real-time telemetry data
- When timestamps overlap, real-time data takes precedence
- The combined dataset is sorted chronologically
- Filters apply to the entire merged dataset

### 4. Data Downsampling (Chart Style B Only)

To improve chart performance and readability at larger time scales, Chart Style B implements intelligent downsampling:

#### Downsampling Strategy

| Time Range | Sampling Rate | Description |
|------------|---------------|-------------|
| **5 days** | 15-minute intervals | No downsampling - all data points displayed |
| **1 month** | 15-minute intervals | No downsampling - all data points displayed |
| **6 months** | Hourly values | First value of each hour displayed |
| **1 year** | 4-hour intervals | One value per 4-hour period |
| **5 years** | Weekly high points | Maximum value per week displayed; X-axis shows month & year |

#### Implementation Details

The `downsampleForStyleB()` function:
- **6m range**: Groups data by hour, keeping the first value of each hour
- **1y range**: Groups data into 4-hour intervals using timestamp division
- **5y range**: Groups data by calendar week (Sunday-Saturday), selecting the maximum value for each week; X-axis displays month & year format instead of day & month for better readability

This approach:
- Reduces the number of data points rendered on the chart
- Improves chart performance with large datasets
- Maintains data integrity and key trends
- Only applies to Chart Style B (other styles show full data)

#### Performance Impact

| Time Range | Before | After | Reduction |
|------------|--------|-------|-----------|
| 5 days | ~480 points | ~480 points | 0% |
| 1 month | ~2,880 points | ~2,880 points | 0% |
| 6 months | ~17,280 points | ~4,320 points | 75% |
| 1 year | ~35,040 points | ~2,190 points | 94% |
| 5 years | ~175,200 points | ~260 points | 99.9% |

## CSV Format

The CSV file must follow this format:

```csv
"measure","dateTime","date","value","completeness","quality","qcode"
"http://example.com/measure","2024-01-15T14:45:00","2024-01-15","0.093","","Unchecked",""
"http://example.com/measure","2024-01-15T15:00:00","2024-01-15","0.093","","Unchecked",""
```

**Required columns:**
- `dateTime` - ISO 8601 format timestamp (e.g., "2024-01-15T14:45:00")
- `value` - Numeric value (water level in metres)

Other columns are optional and will be ignored.

## Testing

A sample CSV file is provided at `sample-historic-data.csv` for testing purposes.

## Chart Styles

The application supports three chart display styles:

1. **Style A**: Traditional static chart
   - Fixed time range
   - All data points displayed
   
2. **Style B**: Interactive date range selector
   - User-selectable time ranges (5d, 1m, 6m, 1y, 5y)
   - **Automatic downsampling for performance**
   - Optimized for large datasets
   
3. **Style C**: Real-time interactive chart
   - Live data updates
   - Pan and zoom capabilities

## Implementation Details

### Files
- `src/client/javascripts/historic-data.js` - Core functionality for parsing, storage, filtering, and downsampling
  - `parseHistoricCSV()` - Parse CSV data
  - `saveHistoricData()` - Save to IndexedDB
  - `loadHistoricData()` - Load from IndexedDB
  - `clearHistoricData()` - Clear stored data
  - `mergeData()` - Merge historic and real-time data
  - `filterDataByTimeRange()` - Filter data by time range
  - `downsampleForStyleB()` - Downsample data for Chart Style B
- `src/client/javascripts/application.js` - Integration with chart rendering and downsampling
- `src/views/station.njk` - UI elements (upload button, filter buttons, and chart style)
- `test/unit/client/javascripts/historic-data.test.js` - Comprehensive unit tests (214 tests)

### Storage
- **Database**: IndexedDB (browser-native storage)
- **Store Name**: `historic-data`
- **Key**: `floodData`
- **Schema**: Array of `{ dateTime: string, value: number }`
- **Capacity**: Typically much larger than localStorage (hundreds of MB or more)

### Data Processing
1. CSV is parsed to extract `dateTime` and `value` fields
2. Data older than 5 years is filtered out
3. Invalid rows (missing values, invalid numbers) are skipped
4. Data is saved to IndexedDB for persistence
5. Data is merged with real-time telemetry
6. Time filter is applied to the merged dataset
7. **For Chart Style B**: Downsampling is applied based on selected time range
8. Chart is re-rendered with filtered/downsampled data

## Testing

A sample CSV file is provided at `sample-historic-data.csv` for testing purposes.

### Test Coverage

All historic data functions are fully tested in `test/unit/client/javascripts/historic-data.test.js`:
- ✅ 214 tests passing
- CSV parsing validation
- IndexedDB storage operations
- Data merging logic
- Time range filtering
- **Downsampling logic for all time ranges (5d, 1m, 6m, 1y, 5y)**
- Edge cases (empty arrays, unknown ranges, single data points)

## Browser Compatibility

This feature requires:
- IndexedDB support (all modern browsers)
- File API support (all modern browsers)
- ES6+ JavaScript support

## Error Handling

The system handles various error cases:
- Empty CSV files
- Missing required columns
- Invalid date/time formats
- Invalid numeric values
- IndexedDB quota exceeded
- File read errors

Users will see appropriate error messages for each case.

## User Experience

1. **Upload Historic Data**:
   - Visit the Hydrology website and download CSV data
   - Click "Upload Historic Data CSV" button
   - Select the downloaded CSV file
   - Data is automatically merged with real-time data

2. **Select Time Range** (Chart Style B):
   - Choose from 5 predefined time ranges (5d, 1m, 6m, 1y, 5y)
   - Chart automatically filters and downsamples data
   - Smooth performance even with years of data

3. **Clear Historic Data**:
   - Click "Clear Historic Data" button
   - All stored data removed from browser
   - Chart reverts to real-time data only

## Future Enhancements

Potential improvements:
- Export merged data to CSV
- Custom time range selection
- Configurable downsampling strategies
- Data validation and error reporting
- Multiple dataset management
- Data interpolation for missing values
