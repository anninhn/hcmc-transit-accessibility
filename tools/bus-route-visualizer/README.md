# HCMC Bus Route Visualizer

React-based validation tool for HCMC transit data.

## Features

🗺️ Route Visualization: Interactive SVG visualization of bus routes and stops
🔄 Loop Route Detection: Automatically detects and handles circular routes
📏 Accurate Distance Calculation: Calculates real distances along GPS paths with wraparound support
📊 Route Statistics: Displays comprehensive route metrics including speed, distance, and travel time
⏱️ Time-Expanded Network: Generates node tables for temporal network analysis
✅ Data Validation: Validates time data integrity across all routes
📥 CSV Export: Exports complete node tables for further analysis

## Key Improvements

Fixed Loop Route Detection: Properly identifies routes where first and last stops are identical
Fixed Distance Calculation: Implements wraparound logic for the final segment in loop routes
Enhanced Visualization: Different colors for start/end stops and wraparound indicators

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## Usage

1. Upload `bus_data_no_dl.json` file
2. Select route and variant to analyze
3. View route visualization and statistics
4. Generate complete node table for all routes
5. Download CSV for network analysis

## Tech Stack

- React 18 + TypeScript
- Lucide React icons
- Tailwind CSS
- SVG-based route visualization
