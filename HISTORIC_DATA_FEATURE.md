# Historic Data Upload Feature

This feature allows users to upload historic telemetry data from CSV files downloaded from the Hydrology website and view it alongside real-time data.

## Features

### 1. CSV Upload#
- Collect the historic data from the Hydrology site e.g. https://environment.data.gov.uk/hydrology/station/7da7bf7a-21a3-486a-a4aa-1280770bf512
- On the hydrology site goto the 'Download as csv' tab
- Download the 15min complete record file
- Click the "Upload Historic Data CSV" button next to the "Download data CSV" button
- Select the CSV file from your local machine
- The file must contain `dateTime` and `value` columns
- Only data from the last 5 years will be imported
- Uploaded data is stored in browser localStorage and persists across page refreshes
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

## Implementation Details

### Files
- `src/client/javascripts/historic-data.js` - Core functionality for parsing, storage, and filtering
- `src/client/javascripts/application.js` - Integration with chart rendering
- `src/views/station.njk` - UI elements (upload button and filter buttons)
- `test/unit/client/javascripts/historic-data.test.js` - Unit tests (23 tests)

### Storage
Data is stored in browser localStorage with the key `historic-telemetry-data`. The storage limit is typically 5-10MB depending on the browser. If storage fails, an error message will be displayed.

### Data Processing
1. CSV is parsed to extract `dateTime` and `value` fields
2. Data older than 5 years is filtered out
3. Invalid rows (missing values, invalid numbers) are skipped
4. Data is merged with real-time telemetry
5. Time filter is applied to the merged dataset
6. Chart is re-rendered with filtered data

## Browser Compatibility

This feature requires:
- localStorage support (all modern browsers)
- File API support (all modern browsers)
- ES6+ JavaScript support

## Error Handling

The system handles various error cases:
- Empty CSV files
- Missing required columns
- Invalid date/time formats
- Invalid numeric values
- localStorage quota exceeded
- File read errors

Users will see appropriate error messages for each case.
