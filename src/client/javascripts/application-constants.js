export const LINE_CHART_ID = 'line-chart'
export const DEFAULT_FILTER = '5d'
export const TIME_FILTER_LINK_SELECTOR = '.time-filter-link'
export const TIME_FILTER_LINK_DISABLED_CLASS = 'time-filter-link--disabled'
export const HISTORIC_DATA_REQUIRED_FILTERS = new Set(['6m', '1y', '3y'])
export const ARIA_DISABLED = 'aria-disabled'
export const ARIA_CURRENT = 'aria-current'
export const CHART_STYLE_C = 'styleC'
export const CHART_STYLE_B = 'styleB'
export const HISTORIC_DATA_ENDPOINT = '/station/historic-data'
export const DOWNLOAD_CSV_BTN_ID = 'download-csv-btn'
export const DEFAULT_CURRENT_LEVEL = 0.28
export const DEFAULT_HIGHEST_LEVEL = 0.64
export const DEFAULT_TOP_NORMAL_LEVEL = 0.5
export const THRESHOLD_CURRENT_LEVEL_ID = 'current-level'
export const THRESHOLD_HIGHEST_LEVEL_ID = 'highest-level'
export const THRESHOLD_TOP_NORMAL_ID = 'top-normal'

export const THRESHOLD_CONTROL_CONFIG = {
  [THRESHOLD_CURRENT_LEVEL_ID]: {
    inputId: 'threshold-current-level',
    labelId: 'threshold-current-level-label'
  },
  [THRESHOLD_HIGHEST_LEVEL_ID]: {
    inputId: 'threshold-highest-level',
    labelId: 'threshold-highest-level-label'
  },
  [THRESHOLD_TOP_NORMAL_ID]: {
    inputId: 'threshold-top-normal',
    labelId: 'threshold-top-normal-label'
  }
}
