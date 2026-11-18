export const SUBTITLE_SCAN_VERSION = 3
export const DELETE_SUBTITLE_ACTION = 'subtitle_delete'
export const VIDEO_EXTENSIONS = new Set(['avi', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpg', 'ts', 'webm', 'wmv'])

export const REFERENCE_LANGUAGE = 'en'
export const SPEECH_MEDIA_PER_PASS = 60
/** Of runtime. */
export const COVERAGE_MIN_FRACTION = 0.75
/** Past runtime; the larger bound wins. */
export const COVERAGE_MAX_OVERRUN = { fraction: 0.03, seconds: 60 }
export const AGREE_TOLERANCE = 1.5
export const PEAK_EXCLUSION = 2
export const PROFILE_SEGMENTS = 6
export const PROFILE_MIN_CUES = 10
export const PROFILE_MAX_OFFSET = 150
export const PROFILE_BIN = 0.2
export const PROFILE_SMOOTH = 0.2
export const ANCHOR_VOTE_WEIGHT = 3
export const SEGMENT_SUPPORT_MIN = 0.2
export const SEGMENT_PEAK_RATIO = 1.2
/** A segment peak this strong shows shared timing, even when several offsets tie for it. */
export const UNRELATED_MAX_SUPPORT = 0.4
export const FRAMERATE_RATIOS = [1, 25 / 23.976, 23.976 / 25, 25 / 24, 24 / 25, 24 / 23.976, 23.976 / 24]
/** Window starts, as fractions of runtime. */
export const SPEECH_WINDOWS = [0.06, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9]
export const SPEECH_WINDOW_SECONDS = 40
export const SPEECH_BIN = 0.1
export const SPEECH_MAX_OFFSET = 120
export const SPEECH_MIN_FRACTION = 0.08
export const INFORMATIVE_MIN = 4
export const UNCOVERED_MIN = 2
export const ALIGNED_MIN_R = 0.41
export const PEAK_MIN = 0.45
export const MARGIN_MIN = 0.05
export const REPAIR_RATIO = [0.95, 1.06] as const
export const REPAIR_MAX_RESIDUAL = 1
export const REPAIR_MAX_OFFSET = 600
