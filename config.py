"""
HCMC Transit Accessibility Analysis - Configuration File
=======================================================

Central configuration for all analysis parameters.
Modify these values to adjust analysis behavior.
"""

import os
from pathlib import Path

# ============================================================================
# PROJECT PATHS
# ============================================================================

# Base project directory
PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / "data"
SRC_DIR = PROJECT_ROOT / "src"
RESULTS_DIR = PROJECT_ROOT / "results"
DOCS_DIR = PROJECT_ROOT / "docs"

# Data subdirectories
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
RESULTS_DATA_DIR = DATA_DIR / "results"

# Create directories if they don't exist
for dir_path in [DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, RESULTS_DATA_DIR, RESULTS_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# ============================================================================
# NETWORK PARAMETERS
# ============================================================================

# Walking parameters
WALKING_RADIUS = 400  # meters - Maximum walking distance between stops
WALKING_SPEED = 1.2   # m/s - Average walking speed (4.32 km/h)
MAX_WALK_WAIT_TIME = 3600  # seconds - Maximum total walk + wait time (1 hour)

# Transfer parameters
MAX_TRANSFER_TIME = 1800   # seconds - Maximum transfer wait time (30 minutes)
MIN_TRANSFER_TIME = 120    # seconds - Minimum transfer time (2 minutes)
MAX_WAITING_TIME = 1800    # seconds - Maximum waiting time for same route

# ============================================================================
# METRO CONFIGURATION
# ============================================================================

# Metro Line 1 station IDs (from lnglatmetro1.json)
METRO_STOP_IDS = [7003, 7004, 7005, 7006, 7007, 7008, 7009, 7010, 7011, 7012, 7013, 7014, 7015]

# Metro station verification radius (for route selection)
METRO_VERIFICATION_RADIUS = 800  # meters - Used in Phase 1.1 for route sampling

# ============================================================================
# TEMPORAL PARAMETERS
# ============================================================================

# Service hours
SERVICE_START_HOUR = 4   # 04:00
SERVICE_END_HOUR = 22    # 22:00

# Time periods for analysis
PEAK_MORNING = (7, 9)    # 07:00-09:00
PEAK_EVENING = (17, 19)  # 17:00-19:00
OFF_PEAK_MIDDAY = (10, 16)  # 10:00-16:00

# Departure time sampling
DEPARTURE_SAMPLE_INTERVAL = 30  # minutes - Sample every 30 minutes
MAX_DEPARTURES_PER_STOP = 50   # Limit for performance

# ============================================================================
# SPATIAL ANALYSIS PARAMETERS
# ============================================================================

# H3 hexagon configuration
H3_RESOLUTION = 9        # Level 9 ≈ 174m edge length, good for neighborhood analysis
H3_BUFFER_RADIUS = 200   # meters - Buffer around hexagon center for stop search

# Analysis boundaries (HCMC approximate bounds)
HCMC_BOUNDS = {
    'north': 10.95,
    'south': 10.45,
    'east': 106.95,
    'west': 106.45
}

# ============================================================================
# PERFORMANCE PARAMETERS
# ============================================================================

# Memory management
MAX_GRAPH_EDGES = 10_000_000  # Maximum edges before requiring optimization
CHUNK_SIZE = 1000             # Process hexagons in chunks
MAX_WORKERS = 4               # Parallel processing workers

# Routing optimization
USE_MINIMAL_SAMPLE = True     # Use smaller sample for development
MINIMAL_ROUTE_COUNT = 5       # Number of routes in minimal sample
ROUTING_TIMEOUT = 300         # seconds - Maximum time per routing calculation

# ============================================================================
# FILE NAMES AND PATHS
# ============================================================================

# Input data files
BUS_DATA_FILE = "bus_data_no_dl.json"
NODE_TABLE_FILE = "node_table.csv"
LINK_TABLE_FILE = "link_table.csv"
METRO_STATIONS_FILE = "lnglatmetro1.json"

# Processed data files
NODES_OPTIMIZED_FILE = "nodes_optimized.pkl"
LINKS_OPTIMIZED_FILE = "links_optimized.pkl"
METRO_CONNECTED_GRAPH_FILE = "metro_connected_graph.pkl"
METRO_STATIONS_INFO_FILE = "metro_stations_info.pkl"

# Results files
PHASE_1_2_RESULTS_FILE = "phase_1_2_results.pkl"
HEXAGON_ACCESSIBILITY_FILE = "hexagon_accessibility_results.json"
ACCESSIBILITY_MAP_FILE = "accessibility_map.html"

# ============================================================================
# VISUALIZATION PARAMETERS
# ============================================================================

# Map settings
MAP_CENTER = [10.7769, 106.7009]  # HCMC center coordinates
MAP_ZOOM = 11
MAP_TILES = 'OpenStreetMap'

# Color schemes for accessibility visualization
ACCESSIBILITY_COLORS = {
    'excellent': '#2166ac',    # < 30 minutes
    'good': '#5aae61',         # 30-45 minutes  
    'moderate': '#fee08b',     # 45-60 minutes
    'poor': '#f46d43',         # 60-90 minutes
    'very_poor': '#a50026'     # > 90 minutes
}

# Accessibility thresholds (minutes)
ACCESSIBILITY_THRESHOLDS = [30, 45, 60, 90]

# ============================================================================
# LOGGING AND DEBUG
# ============================================================================

# Logging configuration
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_FILE = "transit_analysis.log"

# Debug settings
DEBUG_MODE = False
VERBOSE_OUTPUT = True
SAVE_INTERMEDIATE_RESULTS = True

# ============================================================================
# API CONFIGURATION (for data collection)
# ============================================================================

# API endpoints (if needed for future data updates)
BUS_API_BASE_URL = ""  # Add if available
RATE_LIMIT_DELAY = 1   # seconds between API calls

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_file_path(category: str, filename: str) -> Path:
    """Get full file path for different categories of files."""
    paths = {
        'raw': RAW_DATA_DIR,
        'processed': PROCESSED_DATA_DIR,
        'results': RESULTS_DATA_DIR,
        'docs': DOCS_DIR
    }
    return paths.get(category, DATA_DIR) / filename

def get_config_summary() -> dict:
    """Return summary of key configuration parameters."""
    return {
        'walking_radius': WALKING_RADIUS,
        'max_transfer_time': MAX_TRANSFER_TIME,
        'h3_resolution': H3_RESOLUTION,
        'service_hours': f"{SERVICE_START_HOUR:02d}:00-{SERVICE_END_HOUR:02d}:00",
        'metro_stations': len(METRO_STOP_IDS),
        'use_minimal_sample': USE_MINIMAL_SAMPLE
    }

# ============================================================================
# VALIDATION
# ============================================================================

def validate_config():
    """Validate configuration parameters."""
    errors = []
    
    if WALKING_RADIUS <= 0:
        errors.append("WALKING_RADIUS must be positive")
    
    if WALKING_SPEED <= 0:
        errors.append("WALKING_SPEED must be positive") 
        
    if MAX_TRANSFER_TIME < MIN_TRANSFER_TIME:
        errors.append("MAX_TRANSFER_TIME must be >= MIN_TRANSFER_TIME")
        
    if H3_RESOLUTION not in range(0, 16):
        errors.append("H3_RESOLUTION must be between 0 and 15")
        
    if errors:
        raise ValueError("Configuration errors:\n" + "\n".join(errors))
        
    return True

# Validate on import
if __name__ != "__main__":
    validate_config()

# ============================================================================
# DISPLAY CONFIG ON IMPORT
# ============================================================================

if __name__ == "__main__":
    print("HCMC Transit Accessibility Analysis - Configuration")
    print("=" * 50)
    for key, value in get_config_summary().items():
        print(f"{key}: {value}")
    print("\nConfiguration validation:", validate_config())