# HCMC Transit Accessibility Analysis

> Analyzing spatial and temporal accessibility to metro stations in Ho Chi Minh City using time-expanded network modeling

[![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]()

## 🎯 Project Overview

This project analyzes transit accessibility to Metro Line 1 stations across Ho Chi Minh City using:
- **Time-expanded network modeling** for temporal routing
- **Multi-modal integration** (bus + walking + metro)
- **H3 hexagon grid analysis** for spatial accessibility metrics
- **Interactive visualization** with population-weighted accessibility maps

## 📊 Key Features

- ⏰ **Temporal Analysis**: Route finding with schedule constraints and transfer times
- 🚶 **Multi-modal Routing**: Bus → Walk → Transfer → Metro connections
- 🏘️ **Neighborhood-scale Analysis**: H3 hexagon grid (Level 9, ~174m resolution)
- 📈 **Accessibility Metrics**: Travel time, transfer counts, service coverage
- 🗺️ **Interactive Maps**: Folium visualizations with accessibility isochrones
- 📋 **Policy Insights**: Service gap identification and improvement recommendations

## 🏗️ Project Structure

```
hcmc-transit-accessibility/
├── 📄 README.md                    # This file
├── ⚙️ config.py                    # Central configuration
├── 📋 requirements.txt             # Python dependencies
├── 🚫 .gitignore                   # Git ignore rules
│
├── 📁 data/                        # Data files (git-ignored)
│   ├── raw/                        # Original datasets
│   ├── processed/                  # Cleaned/optimized data  
│   └── results/                    # Analysis outputs
│
├── 💻 src/                         # Source code
│   ├── 01_data_preparation/        # Data collection & processing
│   ├── 02_network_foundation/      # Network building & optimization
│   ├── 03_routing_analysis/        # Multi-hop routing algorithms
│   ├── 04_accessibility/           # Accessibility calculations
│   ├── visualization/              # Mapping & visualization
│   ├── utils/                      # Utility functions
│   └── tools/                      # Development tools
│
├── 📓 notebooks/                   # Jupyter analysis notebooks
├── 📚 docs/                        # Documentation
├── 🔧 scripts/                     # Execution scripts
├── 🧪 tests/                       # Unit tests
└── 📊 results/                     # Final outputs & reports
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone repository
git clone https://github.com/username/hcmc-transit-accessibility.git
cd hcmc-transit-accessibility

# Create virtual environment
python -m venv transit_env
source transit_env/bin/activate  # Windows: transit_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Data Preparation

```bash
# Option A: Use existing data (if available)
python src/01_data_preparation/bus_node_generator.py
python src/01_data_preparation/create_link_table.py

# Option B: Collect fresh data
jupyter notebook notebooks/01_data_collection.ipynb
```

### 3. Network Analysis

```bash
# Build transit network
python src/02_network_foundation/load_network_data.py
python src/02_network_foundation/optimize_memory.py
python src/02_network_foundation/create_sample_graph.py

# Test routing capabilities  
python src/03_routing_analysis/verify_metro_nodes.py
python src/03_routing_analysis/routing_engine.py

# Calculate accessibility
python src/04_accessibility/hexagon_analysis.py
python src/04_accessibility/calculate_accessibility.py
```

### 4. Visualization

```bash
# Generate interactive maps
python src/visualization/transit_map_generator.py
```

### 5. Automated Execution

```bash
# Run complete analysis pipeline
chmod +x scripts/04_run_full_analysis.sh
./scripts/04_run_full_analysis.sh
```

## 📊 Methodology

### Time-Expanded Network Model

Our analysis uses a **time-expanded network** where:
- **Nodes** = Transit events (bus arrival/departure at specific times)
- **Links** = Temporal connections with 4 types:

| Link Type | Description | Example |
|-----------|-------------|---------|
| `bus` | Vehicle movement | Bus travels from Stop A to Stop B |
| `wait` | Wait for next service | Wait 10 minutes for next bus |
| `transfer` | Change routes | Transfer from Bus 6 to Bus 104 |
| `walk` | Walk between stops | Walk 300m to nearby stop |

### Network Parameters

```python
# Key configuration (see config.py for details)
WALKING_RADIUS = 400        # Maximum walking distance (meters)
MAX_TRANSFER_TIME = 1800    # Maximum transfer wait (30 minutes) 
H3_RESOLUTION = 9           # Hexagon grid resolution (~174m)
METRO_STOP_IDS = [7003-7015] # Metro Line 1 stations
```

### Accessibility Calculation

For each hexagon in the city:
1. **Find accessible bus stops** within 400m walking distance
2. **Calculate shortest paths** to all metro stations using temporal routing
3. **Determine minimum travel time** across all departure times and destinations
4. **Classify accessibility level** based on travel time thresholds

## 📈 Current Results

### Network Statistics
- **Transit Events**: ~1.6M nodes (arrivals/departures)
- **Temporal Links**: ~81M edges (4 connection types)
- **Metro Connectivity**: 78 bus routes connect within 800m
- **Sample Network**: 407K nodes, 27M edges (optimized)

### Accessibility Findings
- **Service Coverage**: [To be updated after Phase 1.3]
- **Average Travel Time**: [Pending analysis]
- **Population Access**: [Integration with census data planned]

## 🔧 Configuration

Edit `config.py` to customize:

```python
# Walking parameters
WALKING_RADIUS = 400          # Adjust walking tolerance
WALKING_SPEED = 1.2           # Average walking speed (m/s)

# Analysis resolution  
H3_RESOLUTION = 9             # Hexagon size (8=larger, 10=smaller)

# Performance tuning
USE_MINIMAL_SAMPLE = True     # Use subset for development
MAX_WORKERS = 4               # Parallel processing cores
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [📋 Data Preparation](docs/01_data_preparation.md) | Data collection and processing workflow |
| [⚙️ Methodology](docs/02_methodology.md) | Technical approach and algorithms |
| [🏗️ Network Structure](docs/03_network_structure.md) | Link table specifications |
| [📊 Progress Log](docs/04_progress_log.md) | Development status and findings |

## 🚧 Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1.1** | ✅ Complete | Network foundation and metro integration |
| **Phase 1.2** | ⚠️ Optimization needed | Multi-hop routing (performance issues) |
| **Phase 1.3** | 🔄 In progress | H3 hexagon accessibility analysis |
| **Phase 2** | 📋 Planned | Population-weighted analysis |
| **Phase 3** | 📋 Planned | Temporal variation analysis |

### Known Issues
- Large graph size (33.6M edges) causes slow routing performance
- Need optimization for city-wide analysis
- Consider alternative routing libraries (igraph, Neo4j)

## 🧪 Testing

```bash
# Run unit tests
pytest tests/

# Test routing connectivity
python src/03_routing_analysis/test_connectivity.py

# Validate configuration
python config.py
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** feature branch (`git checkout -b feature/improvement`)
3. **Commit** changes (`git commit -am 'Add feature'`)
4. **Push** to branch (`git push origin feature/improvement`)
5. **Create** Pull Request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 👥 Authors & Acknowledgments

- **Primary Developer**: [Your Name]
- **Data Source**: HCMC Department of Transportation
- **Spatial Framework**: H3 Hexagonal Hierarchical Geospatial Indexing System (Uber)
- **Network Analysis**: NetworkX Python library

## 📞 Support

- 📧 **Email**: [your.email@domain.com]
- 🐛 **Issues**: [GitHub Issues](https://github.com/username/hcmc-transit-accessibility/issues)
- 📖 **Wiki**: [Project Wiki](https://github.com/username/hcmc-transit-accessibility/wiki)

---

> **🎯 Project Goal**: Enable data-driven transit planning to improve metro accessibility for HCMC residents

*Last updated: June 2025*