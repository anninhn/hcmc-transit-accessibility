# HCMC Transit Accessibility Analysis

## 🎯 Project Overview
Analyzing spatial and temporal variation in transit accessibility to metro stations across Ho Chi Minh City using a time-expanded network approach.

## 🚌 **Bus Route Analyzer & Visualizer**

**📍 [Launch Tool](https://anninhn.github.io/hcmc-transit-accessibility)**

Interactive web application for bus route analysis and node structure validation:

### Tool Purpose:
- **Route Analysis**: Upload and analyze bus route data with detailed statistics
- **Route Visualization**: Display bus routes with stop-by-stop mapping and metrics
- **Node Structure Inspection**: Examine generated node tables with temporal events (ARRIVAL/DEPARTURE)
- **Data Validation**: Validate time data and route structure for accuracy
- **Quality Assurance**: Verify correctness of route data and node generation process

### Features:
- 📁 **JSON Data Upload**: Load route data files for analysis
- 🗺️ **Route Visualization**: Custom route mapping with stop markers and paths
- 📊 **Route Statistics**: Calculate total stops, distance, average speed, travel time, waiting time
- 📏 **Stop Distance Analysis**: Detailed stop-to-stop distance measurements
- 📋 **Node Table Display**: View temporal events with NodeId, RouteId, StopId, Timestamp, Event
- 💾 **Export Functionality**: Export node tables to CSV format
- ✅ **Data Validation**: Validate time data consistency and route structure

### Development & Deployment:
```
tools/bus-route-visualizer/          # React-based validation tool
├── src/
│   ├── BusRouteAnalyzer.tsx        # Main analysis interface component
│   ├── App.tsx                     # Application root
│   └── components/                 # Reusable UI components
├── public/                         # Static assets & HTML template
├── package.json                    # Node.js dependencies & deployment scripts
└── README.md                       # Tool-specific documentation
```

### Tool Usage:
```bash
# Local development
cd tools/bus-route-visualizer/
npm install
npm start  # → http://localhost:3000

# Production deployment
npm run deploy  # → Updates live tool at GitHub Pages
```

*This tool serves as a comprehensive route analysis and validation system to ensure data quality in the time-expanded network modeling process, providing detailed route metrics and temporal event verification capabilities.*

---

## 📊 Data Architecture - PLANNED

### Time-Expanded Network Structure

#### Node Table Structure:
- **Nodes**: Transit events (NOT physical locations)
  - Format: `[NodeId, RouteId, StopId, Timestamp, Event]`
  - Example: "Bus 104 DEPARTURE from Stop 123 at 07:00:00"
  - Events: ARRIVAL or DEPARTURE

#### Link Table Structure:
- **Format**: `link_id | from_node | to_node | duration | mode`
- **4 Link Modes with Specific Rules**:

1. **"bus"** - Vehicle movement (expected ~0.7%)
   - Same RouteId, TripId
   - From: DEPARTURE at stop i
   - To: ARRIVAL at stop i+1 (consecutive)
   - Duration = arrival_time - departure_time

2. **"wait"** - Wait for next trip same route (expected ~91.5% - most common)
   - Same StopId, same RouteId
   - From: ARRIVAL
   - To: DEPARTURE
   - Duration ≤ MAX_WAITING_TIME (automatic)

3. **"transfer"** - Change to different route (expected ~3.2%)
   - Same StopId, different RouteId
   - From: ARRIVAL (route A)
   - To: DEPARTURE (route B)
   - Duration ≤ MAX_TRANSFER_TIME (1800s = 30 min)

4. **"walk"** - Walk between stops (expected ~4.6%)
   - Different StopIds
   - Distance ≤ WALKING_RADIUS (400m)
   - From: ARRIVAL at stop A
   - To: DEPARTURE at stop B
   - Duration ≤ MAX_WALK_WAIT_TIME (3600s = 1 hour)

#### Configuration Parameters:
```python
CONFIG = {
    # Walking parameters
    'WALKING_RADIUS': 400,        # meters - Search radius
    'MAX_WALK_WAIT_TIME': 3600,   # seconds - Total walk + wait time
    'WALKING_SPEED': 1.2,         # m/s - Average walking speed
    
    # Transfer parameters  
    'MAX_TRANSFER_TIME': 1800,    # seconds - Max transfer wait (30 min)
    'MIN_TRANSFER_TIME': 120,     # seconds - Min transfer time (2 min)
}
```

### ⚡ CRITICAL UNDERSTANDING: Metro Stations in Network
**Metro stations will be stops in the network with their own StopIds:**
- Metro StopIds: 7003-7015 (defined in `lnglatmetro1.json`)
- Example: Bến Thành = StopId 7003, Thủ Đức = StopId 7005
- Metro stops will have ARRIVAL/DEPARTURE events like any other stop
- Walking links will connect bus stops → metro stops (within 400m radius per CONFIG)

**How Walking Links to Metro Will Work:**
```
Bus Stop 123 (within 400m of metro) --walk--> Metro Stop 7003 (Bến Thành)
     ↓                                              ↓
(Bus ARRIVAL)                            (Metro DEPARTURE events)

Link: from_node=ARRIVAL@123, to_node=DEPARTURE@7003, mode='walk'
Duration = walk_distance/1.2 + wait_time (≤ 3600s total)
```

**Planned Implementation Notes**: 
- Metro stations will be integrated as regular stops with designated StopIds
- Walking links will be created based on proximity calculations using WALKING_RADIUS configuration
- The routing system will handle multi-modal connections seamlessly

## ✅ Current Progress - Data Preparation Complete

### Phase 1.0 - Data Foundation ✅
1. **Node Table Created**: `src/01_data_preparation/node_table.csv`
   - Transit events with NodeId, RouteId, StopId, Timestamp, Event
   - All ARRIVAL and DEPARTURE events processed
   - Ready for network graph creation

2. **Link Table Created**: `src/01_data_preparation/link_table.csv`
   - Temporal connections with link_id, from_node, to_node, duration, mode
   - All 4 link types: bus, wait, transfer, walk
   - Ready for network graph import

### Current Status:
- ✅ **Data preparation complete**
- 🔄 **Next step**: Create NetworkX MultiDiGraph from node and link tables
- 📋 **Pending**: Network analysis and accessibility calculations

## 🚧 Next Steps - Network Creation & Analysis

### Phase 1.1 - Network Foundation (In Progress)
1. **Create NetworkX MultiDiGraph**:
   - Load node_table.csv and link_table.csv
   - Build graph structure with temporal edges
   - Verify graph connectivity and properties

2. **Metro Integration**:
   - Include metro stations as network nodes
   - Create walking links to metro stops within 400m
   - Verify metro connectivity with bus network

3. **Network Optimization**:
   - Memory optimization for large graphs
   - Create sample networks for testing
   - Performance benchmarking

### Phase 1.2 - Multi-hop Routing (Planned)
1. **Routing Algorithm Development**:
   - Implement temporal shortest path algorithms
   - Handle multi-modal connections (bus→walk→transfer)
   - Test with sample origin-destination pairs

2. **Validation**:
   - Verify routing results against expected travel patterns
   - Test edge cases and failure scenarios
   - Performance optimization

### Phase 1.3 - Accessibility Analysis (Planned)
1. **H3 Hexagon Grid**:
   - Generate hexagon grid across HCMC (Level 9, ~174m resolution)
   - Map bus stops to hexagons within walking distance
   - Handle areas with no transit access

2. **Accessibility Calculation**:
   - Calculate travel time from each hexagon to all metro stations
   - Generate accessibility metrics and isochrones
   - Create interactive visualizations

### Phase 2 - Advanced Analysis (Future)
1. **Population Integration**:
   - Integrate census/population data
   - Calculate population-weighted accessibility
   - Identify underserved communities

2. **Temporal Analysis**:
   - Peak vs off-peak accessibility comparison
   - Service frequency impact analysis
   - Temporal gap identification

## 💡 Potential Computational Challenges

### Expected Network Size:
- **Nodes**: ~1.6M transit events (arrivals/departures)
- **Links**: ~81M temporal connections (4 types)
- **Full graph**: ~7.2GB memory requirement

### Optimization Strategies for Large Networks:

1. **Sampling Approaches**:
   - Select representative routes for initial analysis
   - Focus on metro-connected routes first
   - Use time windows for temporal sampling

2. **Memory Management**:
   - Graph partitioning for large analyses
   - Chunked processing for city-wide calculations
   - Alternative storage (database, HDF5)

3. **Alternative Tools**:
   - Consider graph databases (Neo4j) for complex queries
   - Specialized routing libraries (igraph, graph-tool)
   - Cloud computing for intensive calculations

## 🚨 Potential Issues & Mitigation Strategies

### Network Connectivity Issues:
- **Problem**: Isolated network components
- **Mitigation**: Verify walking links between route clusters
- **Validation**: Use connectivity analysis tools

### Performance Issues:
- **Problem**: Slow routing on large graphs (>30M edges)
- **Mitigation**: Create smaller samples, optimize algorithms
- **Alternative**: Use specialized routing engines

### Memory Constraints:
- **Problem**: Full network may exceed available RAM
- **Mitigation**: Chunked processing, external storage
- **Scaling**: Cloud computing resources

### Temporal Logic Issues:
- **Problem**: Routing backwards in time
- **Mitigation**: Strict temporal ordering in algorithms
- **Validation**: Time-based path verification

## 📝 Implementation Roadmap

### Immediate Tasks (Phase 1.1):
- [ ] Load node and link tables into NetworkX
- [ ] Create MultiDiGraph with proper edge attributes
- [ ] Verify graph structure and connectivity
- [ ] Include metro stations in network
- [ ] Test with small routing examples

### Short-term Goals (Phase 1.2):
- [ ] Implement temporal routing algorithms
- [ ] Test multi-hop journeys
- [ ] Validate against expected travel patterns
- [ ] Create sample accessibility calculations

### Medium-term Objectives (Phase 1.3):
- [ ] Generate H3 hexagon grid for HCMC
- [ ] Calculate accessibility metrics for sample areas
- [ ] Create interactive accessibility maps
- [ ] Validate results against real travel patterns

### **Tool Development ✅**
- [x] Create interactive bus route analyzer and visualizer
- [x] Implement route data upload and processing capabilities
- [x] Add route visualization with stop mapping and statistics
- [x] Build node table inspection and export functionality
- [x] Deploy tool to GitHub Pages for project workflow integration

## 🔧 Development Workflow

### Data Validation:
```bash
# Use interactive tool for visual inspection
# Visit: https://anninhn.github.io/hcmc-transit-accessibility

# Validate node table structure
python -c "import pandas as pd; print(pd.read_csv('src/01_data_preparation/node_table.csv').info())"

# Validate link table structure  
python -c "import pandas as pd; print(pd.read_csv('src/01_data_preparation/link_table.csv').info())"
```

### Network Creation:
```bash
# Create NetworkX graph (next step)
python src/01_data_preparation/create_network_graph.py

# Verify graph properties
python src/01_data_preparation/analyze_graph_structure.py
```

### Tool Development:
```bash
# Local development
cd tools/bus-route-visualizer/
npm start

# Deploy updates
npm run deploy
```

## 📁 Current File Structure

```
hcmc-transit-accessibility/
├── README.md                          # This file
├── src/
│   └── 01_data_preparation/
│       ├── node_table.csv              # ✅ Generated transit events
│       ├── link_table.csv              # ✅ Generated temporal connections
│       ├── bus_node_generator.py       # Script that created node_table
│       └── create_link_table.py        # Script that created link_table
│
├── tools/
│   └── bus-route-visualizer/           # ✅ Interactive validation tool
│       ├── src/
│       │   ├── BusRouteAnalyzer.tsx    # Main analysis interface
│       │   └── App.tsx                 # Application root
│       ├── package.json                # Tool dependencies & scripts
│       └── README.md                   # Tool documentation
│
├── data/                               # Raw data files (git-ignored)
├── docs/                               # Project documentation
├── notebooks/                          # Jupyter analysis notebooks
└── results/                            # Analysis outputs (future)
```

## 🎯 Success Metrics

### Data Quality:
- ✅ Node table completeness and accuracy
- ✅ Link table connectivity and temporal consistency  
- 🔄 Graph structure validation (next step)

### Performance Targets:
- Graph creation: <10 minutes for full network
- Sample routing: <1 second per query
- City-wide accessibility: <1 hour for full analysis

### Analysis Objectives:
- Identify underserved areas (>60 min to metro)
- Quantify accessibility improvements from new metro line
- Support evidence-based transit planning decisions

---
*Last updated: June 12, 2025 - Data preparation complete, interactive route analyzer deployed*

**Current Status**: 
- ✅ Node and link tables successfully generated from raw transit data
- ✅ Interactive bus route analyzer deployed for route validation and analysis
- 🔄 Ready to create NetworkX MultiDiGraph from prepared data tables
- 📋 Network analysis and accessibility calculations pending graph creation

**Next Milestone**: Complete Phase 1.1 - Network Foundation with functional MultiDiGraph ready for routing analysis.