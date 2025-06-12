import React, { useState, useRef } from 'react';
import { Upload, MapPin, Navigation, Calculator, Eye, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';

// Type definitions
interface BusData {
  [key: string]: RouteData;
}

interface RouteData {
  getroutebyid?: {
    RouteId: number;
    RouteNo: string;
    RouteName: string;
  };
  getvarsbyroute: RouteVariant[];
  getstopsbyvar: { [variantId: string]: BusStop[] };
  getpathsbyvar: { [variantId: string]: RoutePath };
  gettimetablebyroute: TimeTable[];
  gettripsbytimetable: { [timetableId: string]: Trip[] };
}

interface RouteVariant {
  RouteVarId: number;
  RouteVarName: string;
}

interface BusStop {
  StopId: number;
  Name: string;
  Lat: number;
  Lng: number;
}

interface RoutePath {
  lat: number[];
  lng: number[];
}

interface TimeTable {
  TimeTableId: number;
  RouteVarId: number;
}

interface Trip {
  TripId: number;
  StartTime: string;
  EndTime: string;
}

interface ValidationIssue {
  routeId: string;
  routeNo: string;
  timetableId: number;
  tripId: number;
  issue: string;
  startTime: string;
  endTime: string;
}

interface ValidationResult {
  totalTrips: number;
  invalidTrips: number;
  errorRate: string;
  issueTypes: { [key: string]: number };
  issues: ValidationIssue[];
}

interface RouteNode {
  NodeId: number;
  RouteId: number;
  StopId: number;
  Timestamp: number;
  Event: 'ARRIVAL' | 'DEPARTURE';
  StopName: string;
  Time: string;
  Attributes: string;
}

interface AnalysisResult {
  variant: RouteVariant;
  stops: BusStop[];
  paths: RoutePath;
  stopDistances: number[];
  totalDistance: number;
  avgSpeed: number;
  nodes: RouteNode[];
  stats: {
    totalStops: number;
    totalDistance: number;
    avgSpeed: number;
    travelingTime: number;
    totalWaitingTime: number;
  };
}

interface Visualization {
  pathPoints: { x: number; y: number }[];
  stopPoints: (BusStop & { x: number; y: number })[];
  width: number;
  height: number;
  bounds: {
    viewMinLat: number;
    viewMaxLat: number;
    viewMinLng: number;
    viewMaxLng: number;
  };
}

const BusRouteAnalyzer: React.FC = () => {
  const [jsonData, setJsonData] = useState<BusData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [visualization, setVisualization] = useState<Visualization | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse time to seconds with better error handling
  const parseTimeToSeconds = (timeStr: string): number | null => {
    if (!timeStr || typeof timeStr !== 'string') {
      console.warn('Invalid time string:', timeStr);
      return null;
    }
    
    // Trim whitespace
    const trimmed = timeStr.trim();
    
    // Handle various time formats
    const parts = trimmed.split(':');
    if (parts.length < 2) {
      console.warn('Invalid time format:', timeStr);
      return null;
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.warn('Invalid time values:', timeStr, 'hours:', hours, 'minutes:', minutes);
      return null;
    }
    
    return hours * 3600 + minutes * 60;
  };

  // Haversine distance calculation
  const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Find nearest point on path
  const findNearestPointOnPath = (stopLat: number, stopLng: number, pathLats: number[], pathLngs: number[]) => {
    let minDistance = Infinity;
    let nearestIndex = 0;
    let nearestPoint = null;

    for (let i = 0; i < pathLats.length; i++) {
      const distance = haversineDistance(stopLat, stopLng, pathLats[i], pathLngs[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
        nearestPoint = { lat: pathLats[i], lng: pathLngs[i], index: i };
      }
    }

    return { nearestPoint, distance: minDistance, index: nearestIndex };
  };

  // Calculate real distance between stops
  const calculateRealDistance = (stop1: BusStop, stop2: BusStop, pathLats: number[], pathLngs: number[]): number => {
    const nearest1 = findNearestPointOnPath(stop1.Lat, stop1.Lng, pathLats, pathLngs);
    const nearest2 = findNearestPointOnPath(stop2.Lat, stop2.Lng, pathLats, pathLngs);
    
    const startIndex = Math.min(nearest1.index, nearest2.index);
    const endIndex = Math.max(nearest1.index, nearest2.index);
    
    let totalDistance = 0;
    for (let i = startIndex; i < endIndex; i++) {
      totalDistance += haversineDistance(
        pathLats[i], pathLngs[i],
        pathLats[i + 1], pathLngs[i + 1]
      );
    }
    
    return totalDistance;
  };

  // Process route variant with detailed logging
  const processRouteVariant = (routeData: RouteData, variantId: number): AnalysisResult | null => {
    console.log(`Processing variant ${variantId} for route ${routeData.getroutebyid?.RouteId}`);
    
    const variant = routeData.getvarsbyroute.find(v => v.RouteVarId === variantId);
    const stops = routeData.getstopsbyvar[variantId.toString()] || [];
    const paths = routeData.getpathsbyvar[variantId.toString()];
    
    if (!variant || !stops || !paths) {
      console.warn(`Missing data for variant ${variantId}: variant=${!!variant}, stops=${stops.length}, paths=${!!paths}`);
      return null;
    }

    // Get first timetable and trips
    const timetable = routeData.gettimetablebyroute.find(t => t.RouteVarId === variantId);
    if (!timetable) {
      console.warn(`No timetable found for variant ${variantId}`);
      return null;
    }

    const trips = routeData.gettripsbytimetable[timetable.TimeTableId.toString()] || [];
    if (trips.length === 0) {
      console.warn(`No trips found for timetable ${timetable.TimeTableId}`);
      return null;
    }

    console.log(`Found ${trips.length} trips for variant ${variantId}`);
    
    const pathLats = paths.lat;
    const pathLngs = paths.lng;

    // Calculate distances between consecutive stops
    const stopDistances: number[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const distance = calculateRealDistance(stops[i], stops[i + 1], pathLats, pathLngs);
      stopDistances.push(distance);
    }

    const totalDistance = stopDistances.reduce((sum, d) => sum + d, 0);

    // Process first trip as example
    const firstTrip = trips[0];
    console.log('Processing first trip:', firstTrip);
    
    const startTimeSeconds = parseTimeToSeconds(firstTrip.StartTime);
    const endTimeSeconds = parseTimeToSeconds(firstTrip.EndTime);
    
    if (startTimeSeconds === null || endTimeSeconds === null) {
      console.error('Invalid time in first trip:', {
        trip: firstTrip,
        startParsed: startTimeSeconds,
        endParsed: endTimeSeconds
      });
      return null;
    }
    
    const waitingTime = 30; // 30 seconds
    const totalWaitingTime = (stops.length - 1) * waitingTime;
    const travelingTime = endTimeSeconds - startTimeSeconds - totalWaitingTime;
    
    if (travelingTime <= 0) {
      console.error('Invalid traveling time:', travelingTime);
      return null;
    }
    
    const avgSpeed = totalDistance / travelingTime; // m/s

    // Calculate timestamps for each stop
    const nodes: RouteNode[] = [];
    let currentTime = startTimeSeconds;
    let nodeId = 1;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      
      if (i === 0) {
        // First stop: only DEPARTURE
        nodes.push({
          NodeId: nodeId++,
          RouteId: routeData.getroutebyid?.RouteId || 0,
          StopId: stop.StopId,
          Timestamp: currentTime,
          Event: 'DEPARTURE',
          StopName: stop.Name,
          Time: new Date(currentTime * 1000).toISOString().substr(11, 8),
          Attributes: JSON.stringify([routeData.getroutebyid?.RouteId || 0, stop.StopId, currentTime, 'DEPARTURE'])
        });
      } else {
        // Calculate arrival time
        const distanceFromPrevious = stopDistances[i - 1];
        const travelTime = distanceFromPrevious / avgSpeed;
        currentTime += travelTime;

        // ARRIVAL event
        nodes.push({
          NodeId: nodeId++,
          RouteId: routeData.getroutebyid?.RouteId || 0,
          StopId: stop.StopId,
          Timestamp: Math.round(currentTime),
          Event: 'ARRIVAL',
          StopName: stop.Name,
          Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
          Attributes: JSON.stringify([routeData.getroutebyid?.RouteId || 0, stop.StopId, Math.round(currentTime), 'ARRIVAL'])
        });

        if (i < stops.length - 1) {
          // DEPARTURE event (not for last stop)
          currentTime += waitingTime;
          nodes.push({
            NodeId: nodeId++,
            RouteId: routeData.getroutebyid?.RouteId || 0,
            StopId: stop.StopId,
            Timestamp: Math.round(currentTime),
            Event: 'DEPARTURE',
            StopName: stop.Name,
            Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
            Attributes: JSON.stringify([routeData.getroutebyid?.RouteId || 0, stop.StopId, Math.round(currentTime), 'DEPARTURE'])
          });
        }
      }
    }

    return {
      variant,
      stops,
      paths,
      stopDistances,
      totalDistance,
      avgSpeed,
      nodes,
      stats: {
        totalStops: stops.length,
        totalDistance: Math.round(totalDistance),
        avgSpeed: Math.round(avgSpeed * 3.6 * 100) / 100, // km/h
        travelingTime: Math.round(travelingTime / 60 * 100) / 100, // minutes
        totalWaitingTime: Math.round(totalWaitingTime / 60 * 100) / 100 // minutes
      }
    };
  };

  // Create visualization
  const createVisualization = (result: AnalysisResult): Visualization | null => {
    if (!result) return null;

    const { stops, paths } = result;
    
    // Calculate bounds
    const allLats = [...paths.lat, ...stops.map(s => s.Lat)];
    const allLngs = [...paths.lng, ...stops.map(s => s.Lng)];
    
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    
    const padding = 0.1;
    const viewMinLat = minLat - latRange * padding;
    const viewMaxLat = maxLat + latRange * padding;
    const viewMinLng = minLng - lngRange * padding;
    const viewMaxLng = maxLng + lngRange * padding;
    
    const width = 800;
    const height = 600;
    
    // Convert coordinates to SVG coordinates
    const latToY = (lat: number) => height - ((lat - viewMinLat) / (viewMaxLat - viewMinLat)) * height;
    const lngToX = (lng: number) => ((lng - viewMinLng) / (viewMaxLng - viewMinLng)) * width;
    
    // Create path points
    const pathPoints = paths.lat.map((lat, i) => ({
      x: lngToX(paths.lng[i]),
      y: latToY(lat)
    }));
    
    // Create stop points
    const stopPoints = stops.map(stop => ({
      ...stop,
      x: lngToX(stop.Lng),
      y: latToY(stop.Lat)
    }));
    
    return { pathPoints, stopPoints, width, height, bounds: { viewMinLat, viewMaxLat, viewMinLng, viewMaxLng } };
  };

  // Validate all time data in the JSON
  const validateTimeData = (): void => {
    if (!jsonData) {
      console.error('Please upload JSON file first');
      return;
    }

    console.log('=== STARTING TIME DATA VALIDATION ===');
    
    const issues: ValidationIssue[] = [];
    let totalTrips = 0;
    let invalidTrips = 0;
    
    // Check each route
    Object.keys(jsonData).forEach(routeId => {
      const routeData = jsonData[routeId];
      const routeNo = routeData.getroutebyid?.RouteNo || routeId;
      
      // Check each timetable
      const timetables = routeData.gettimetablebyroute || [];
      
      timetables.forEach(timetable => {
        const trips = routeData.gettripsbytimetable?.[timetable.TimeTableId.toString()] || [];
        
        trips.forEach(trip => {
          totalTrips++;
          
          // Check StartTime
          if (!trip.StartTime) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'StartTime is missing',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          } else if (typeof trip.StartTime !== 'string') {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: `StartTime is not string (type: ${typeof trip.StartTime})`,
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          } else if (!trip.StartTime.match(/^\d{1,2}:\d{2}$/)) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'StartTime format invalid (expected HH:MM or H:MM)',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          }
          
          // Check EndTime
          if (!trip.EndTime) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'EndTime is missing',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          } else if (typeof trip.EndTime !== 'string') {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: `EndTime is not string (type: ${typeof trip.EndTime})`,
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          } else if (!trip.EndTime.match(/^\d{1,2}:\d{2}$/)) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'EndTime format invalid (expected HH:MM or H:MM)',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          }
          
          // Check logic
          if (trip.StartTime && trip.EndTime) {
            const start = parseTimeToSeconds(trip.StartTime);
            const end = parseTimeToSeconds(trip.EndTime);
            
            if (start !== null && end !== null && end <= start) {
              issues.push({
                routeId,
                routeNo,
                timetableId: timetable.TimeTableId,
                tripId: trip.TripId,
                issue: 'EndTime <= StartTime',
                startTime: trip.StartTime,
                endTime: trip.EndTime
              });
              invalidTrips++;
            }
          }
        });
      });
    });
    
    // Report results
    console.log(`Total trips: ${totalTrips}`);
    console.log(`Invalid trips: ${invalidTrips}`);
    console.log(`Error rate: ${(invalidTrips/totalTrips*100).toFixed(2)}%`);
    
    // Group by issue type
    const issueTypes: { [key: string]: number } = {};
    
    if (issues.length > 0) {
      console.log('\nDetailed issues:');
      console.table(issues);
      
      issues.forEach(issue => {
        issueTypes[issue.issue] = (issueTypes[issue.issue] || 0) + 1;
      });
      
      console.log('\nIssue statistics:');
      console.table(issueTypes);
      
      // Show some examples
      console.log('\nSample errors:');
      issues.slice(0, 10).forEach(issue => {
        console.log(`Route ${issue.routeNo} (ID: ${issue.routeId}), Trip ${issue.tripId}: ${issue.issue}`);
        console.log(`  StartTime: "${issue.startTime}", EndTime: "${issue.endTime}"`);
      });
    } else {
      console.log('✅ All time data is valid!');
    }
    
    console.log('=== VALIDATION COMPLETE ===');
    
    // Store result for display
    setValidationResult({
      totalTrips,
      invalidTrips,
      errorRate: (invalidTrips/totalTrips*100).toFixed(2),
      issueTypes,
      issues: issues.slice(0, 100) // Show first 100 issues
    });
  };

  // Process all routes for complete Node Table
  const processAllRoutes = async (): Promise<void> => {
    if (!jsonData) {
      console.error('Please upload JSON file first');
      return;
    }

    console.log('Starting Node Table processing...');
    setIsProcessing(true);
    setProcessProgress(0);
    
    const allNodes: any[] = [];
    let globalNodeId = 1;
    const routeIds = Object.keys(jsonData);
    let processedCount = 0;
    
    console.log(`Total routes: ${routeIds.length}`);

    try {
      for (const routeId of routeIds) {
        console.log(`Processing route ${routeId}...`);
        const routeData = jsonData[routeId];
        
        // Get actual RouteId from getroutebyid (may differ from key)
        const actualRouteId = routeData.getroutebyid?.RouteId || parseInt(routeId);
        console.log(`  Actual RouteId: ${actualRouteId}`);
        
        // Process each variant
        const variants = routeData.getvarsbyroute || [];
        console.log(`  - Variants: ${variants.length}`);
        
        for (const variant of variants) {
          const variantId = variant.RouteVarId;
          const stops = routeData.getstopsbyvar?.[variantId.toString()] || [];
          const paths = routeData.getpathsbyvar?.[variantId.toString()];
          
          if (!stops || !paths || stops.length === 0) {
            console.log(`  - Skip variant ${variantId}: no stops/paths`);
            continue;
          }

          // Get all timetables for this variant
          const timetables = routeData.gettimetablebyroute?.filter(t => t.RouteVarId === variantId) || [];
          console.log(`  - Variant ${variantId}: ${timetables.length} timetables`);
          
          for (const timetable of timetables) {
            const trips = routeData.gettripsbytimetable?.[timetable.TimeTableId.toString()] || [];
            
            if (trips.length === 0) continue;
            console.log(`    - TimeTable ${timetable.TimeTableId}: ${trips.length} trips`);

            const pathLats = paths.lat;
            const pathLngs = paths.lng;

            // Calculate distances between consecutive stops (once per variant)
            const stopDistances: number[] = [];
            for (let i = 0; i < stops.length - 1; i++) {
              const distance = calculateRealDistance(stops[i], stops[i + 1], pathLats, pathLngs);
              stopDistances.push(distance);
            }

            const totalDistance = stopDistances.reduce((sum, d) => sum + d, 0);

            // Process each trip
            for (const trip of trips) {
              try {
                const startTimeSeconds = parseTimeToSeconds(trip.StartTime);
                const endTimeSeconds = parseTimeToSeconds(trip.EndTime);
                
                // Skip if invalid times
                if (startTimeSeconds === null || endTimeSeconds === null) {
                  console.warn(`Skip trip ${trip.TripId}: invalid time`, trip.StartTime, trip.EndTime);
                  continue;
                }
                
                const waitingTime = 30; // 30 seconds
                const totalWaitingTime = (stops.length - 1) * waitingTime;
                const travelingTime = endTimeSeconds - startTimeSeconds - totalWaitingTime;
                
                if (travelingTime <= 0) {
                  console.log(`      - Skip trip ${trip.TripId}: invalid travel time (${travelingTime}s)`);
                  continue;
                }
                
                const avgSpeed = totalDistance / travelingTime; // m/s

                // Calculate timestamps for each stop
                let currentTime = startTimeSeconds;

                for (let i = 0; i < stops.length; i++) {
                  const stop = stops[i];
                  
                  if (i === 0) {
                    // First stop: only DEPARTURE
                    allNodes.push({
                      NodeId: globalNodeId++,
                      RouteId: actualRouteId,
                      RouteNo: routeData.getroutebyid?.RouteNo || routeId,
                      RouteVarId: variantId,
                      TripId: trip.TripId,
                      StopId: stop.StopId,
                      Timestamp: Math.round(currentTime),
                      Event: 'DEPARTURE',
                      StopName: stop.Name,
                      Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                      Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'DEPARTURE'])
                    });
                  } else {
                    // Calculate arrival time
                    const distanceFromPrevious = stopDistances[i - 1];
                    const travelTime = distanceFromPrevious / avgSpeed;
                    currentTime += travelTime;

                    // ARRIVAL event
                    allNodes.push({
                      NodeId: globalNodeId++,
                      RouteId: actualRouteId,
                      RouteNo: routeData.getroutebyid?.RouteNo || routeId,
                      RouteVarId: variantId,
                      TripId: trip.TripId,
                      StopId: stop.StopId,
                      Timestamp: Math.round(currentTime),
                      Event: 'ARRIVAL',
                      StopName: stop.Name,
                      Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                      Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'ARRIVAL'])
                    });

                    if (i < stops.length - 1) {
                      // DEPARTURE event (not for last stop)
                      currentTime += waitingTime;
                      allNodes.push({
                        NodeId: globalNodeId++,
                        RouteId: actualRouteId,
                        RouteNo: routeData.getroutebyid?.RouteNo || routeId,
                        RouteVarId: variantId,
                        TripId: trip.TripId,
                        StopId: stop.StopId,
                        Timestamp: Math.round(currentTime),
                        Event: 'DEPARTURE',
                        StopName: stop.Name,
                        Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                        Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'DEPARTURE'])
                      });
                    }
                  }
                }
              } catch (tripError) {
                console.error(`Error processing trip ${trip.TripId}:`, tripError);
              }
            }
          }
        }
        
        processedCount++;
        setProcessProgress((processedCount / routeIds.length) * 100);
        console.log(`Completed ${processedCount}/${routeIds.length} routes`);
      }

      console.log(`Total nodes: ${allNodes.length}`);

      // Export results
      if (allNodes.length > 0) {
        console.log('Creating CSV file...');
        // Create CSV content
        const headers = ['NodeId', 'RouteId', 'RouteNo', 'RouteVarId', 'TripId', 'StopId', 'Timestamp', 'Event', 'Time', 'StopName', 'Attributes'];
        
        const csvRows = [headers.join(',')];
        
        // Add data rows
        allNodes.forEach(node => {
          const row = [
            node.NodeId,
            node.RouteId,
            node.RouteNo,
            node.RouteVarId,
            node.TripId,
            node.StopId,
            node.Timestamp,
            node.Event,
            node.Time,
            `"${node.StopName.replace(/"/g, '""')}"`,
            `"${node.Attributes.replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(','));
        });
        
        const nodeTableCsvContent = csvRows.join('\n');

        // Create download interface
        console.log('Creating download interface...');
        
        // Create download blob
        const blob = new Blob([nodeTableCsvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `node_table_${new Date().toISOString().split('T')[0]}.csv`;
        downloadLink.textContent = `Download Node Table CSV (${allNodes.length.toLocaleString()} nodes)`;
        downloadLink.style.cssText = `
          display: inline-block;
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin: 10px;
          font-weight: bold;
        `;
        
        // Show download interface
        const downloadContainer = document.createElement('div');
        downloadContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          background: white;
          padding: 20px;
          border: 2px solid #4CAF50;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          max-width: 400px;
        `;
        
        downloadContainer.innerHTML = `
          <h3 style="margin: 0 0 10px 0; color: #333;">✅ Node Table Ready!</h3>
          <p style="margin: 0 0 15px 0; color: #666;">
            Generated ${allNodes.length.toLocaleString()} nodes from ${routeIds.length} routes
          </p>
          <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
            File size: ${(nodeTableCsvContent.length / 1024 / 1024).toFixed(2)} MB
          </p>
        `;
        
        downloadContainer.appendChild(downloadLink);
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖ Close';
        closeBtn.style.cssText = `
          display: block;
          width: 100%;
          margin-top: 15px;
          padding: 10px 20px;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
        `;
        closeBtn.onclick = () => {
          downloadContainer.remove();
          URL.revokeObjectURL(url);
        };
        
        downloadContainer.appendChild(closeBtn);
        document.body.appendChild(downloadContainer);

        console.log(`✅ Generated ${allNodes.length} nodes from ${routeIds.length} routes!`);
      } else {
        console.error('❌ No data to export!');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const result = e.target?.result;
          if (typeof result === 'string') {
            const data = JSON.parse(result) as BusData;
            setJsonData(data);
            setSelectedRoute(Object.keys(data)[0] || '');
          }
        } catch (error) {
          alert('Error reading JSON file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleAnalyze = (): void => {
    if (!jsonData || !selectedRoute || !selectedVariant) {
      alert('Please select route and variant');
      return;
    }

    const routeData = jsonData[selectedRoute];
    const result = processRouteVariant(routeData, parseInt(selectedVariant));
    setAnalysisResult(result);
    
    if (result) {
      const viz = createVisualization(result);
      setVisualization(viz);
    }
  };

  const availableVariants = selectedRoute && jsonData ? 
    jsonData[selectedRoute].getvarsbyroute || [] : [];

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
          <Navigation className="text-blue-600" />
          HCMC Bus Route Analyzer & Visualizer
        </h1>
        
        {/* File Upload */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload size={20} />
              Upload JSON File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {jsonData && (
              <>
                <span className="text-sm text-green-600 font-medium">
                  ✓ Loaded {Object.keys(jsonData).length} routes
                </span>
                <button
                  onClick={validateTimeData}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <AlertCircle size={20} />
                  Validate Time Data
                </button>
                <button
                  onClick={processAllRoutes}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
                >
                  <FileSpreadsheet size={20} />
                  {isProcessing ? `Processing... ${Math.round(processProgress)}%` : 'Export Node Table (CSV)'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Route Selection */}
        {jsonData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Route
              </label>
              <select
                value={selectedRoute}
                onChange={(e) => {
                  setSelectedRoute(e.target.value);
                  setSelectedVariant('');
                }}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select Route --</option>
                {Object.keys(jsonData).map(routeId => (
                  <option key={routeId} value={routeId}>
                    Route {jsonData[routeId].getroutebyid?.RouteNo || routeId} - {jsonData[routeId].getroutebyid?.RouteName || 'N/A'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Direction
              </label>
              <select
                value={selectedVariant}
                onChange={(e) => setSelectedVariant(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!selectedRoute}
              >
                <option value="">-- Select Direction --</option>
                {availableVariants.map(variant => (
                  <option key={variant.RouteVarId} value={variant.RouteVarId}>
                    {variant.RouteVarName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Analyze Button */}
        {selectedRoute && selectedVariant && (
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <Calculator size={20} />
            Analyze & Calculate
          </button>
        )}
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertCircle className="text-yellow-600" />
            Time Data Validation Results
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600">Total Trips</div>
              <div className="text-2xl font-bold text-blue-800">{validationResult.totalTrips}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-red-600">Invalid Trips</div>
              <div className="text-2xl font-bold text-red-800">{validationResult.invalidTrips}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-sm text-yellow-600">Error Rate</div>
              <div className="text-2xl font-bold text-yellow-800">{validationResult.errorRate}%</div>
            </div>
          </div>

          {Object.keys(validationResult.issueTypes).length > 0 && (
            <>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Error Categories</h3>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                {Object.entries(validationResult.issueTypes).map(([type, count]) => (
                  <div key={type} className="flex justify-between py-2 border-b border-gray-200 last:border-0">
                    <span className="text-gray-700">{type}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-semibold text-gray-800 mb-3">Error Details (max 20)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-3 py-2 text-left">Route</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">Trip ID</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">Issue</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">Start Time</th>
                      <th className="border border-gray-300 px-3 py-2 text-left">End Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.issues.slice(0, 20).map((issue, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-3 py-2">{issue.routeNo}</td>
                        <td className="border border-gray-300 px-3 py-2">{issue.tripId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-red-600">{issue.issue}</td>
                        <td className="border border-gray-300 px-3 py-2">{issue.startTime || 'N/A'}</td>
                        <td className="border border-gray-300 px-3 py-2">{issue.endTime || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validationResult.issues.length > 20 && (
                  <p className="text-sm text-gray-600 mt-2">
                    ... and {validationResult.issues.length - 20} more errors. See details in Console.
                  </p>
                )}
              </div>
            </>
          )}
          
          <button
            onClick={() => {
              const report = {
                summary: {
                  totalTrips: validationResult.totalTrips,
                  invalidTrips: validationResult.invalidTrips,
                  errorRate: validationResult.errorRate + '%'
                },
                issueTypes: validationResult.issueTypes,
                details: validationResult.issues
              };
              const jsonStr = JSON.stringify(report, null, 2);
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `validation_report_${new Date().toISOString().split('T')[0]}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={16} className="inline mr-2" />
            Download Report
          </button>
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visualization */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Eye className="text-purple-600" />
              Route Visualization
            </h2>
            
            {visualization && (
              <div className="border border-gray-200 rounded-lg overflow-auto">
                <div className="min-w-full inline-block">
                  <svg width={visualization.width} height={visualization.height} className="border">
                    {/* Background */}
                    <rect width={visualization.width} height={visualization.height} fill="#f9fafb" />
                    
                    {/* Path */}
                    <polyline
                      points={visualization.pathPoints.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="3"
                      opacity="0.8"
                    />
                    
                    {/* Stops */}
                    {visualization.stopPoints.map((stop, index) => (
                      <g key={stop.StopId}>
                        <circle
                          cx={stop.x}
                          cy={stop.y}
                          r="8"
                          fill="#EF4444"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x={stop.x}
                          y={stop.y - 12}
                          textAnchor="middle"
                          className="text-xs font-medium fill-gray-700"
                        >
                          {index + 1}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                
                <div className="p-4 bg-gray-50 text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-blue-500"></div>
                      <span>Route Path</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span>Bus Stops</span>
                    </div>
                  </div>
                  <div className="mt-2 text-gray-600">
                    Bounds: {visualization.bounds.viewMinLat.toFixed(6)}, {visualization.bounds.viewMinLng.toFixed(6)} → {visualization.bounds.viewMaxLat.toFixed(6)}, {visualization.bounds.viewMaxLng.toFixed(6)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Statistics */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calculator className="text-green-600" />
              Route Statistics
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Total Stops:</span>
                <span className="font-medium">{analysisResult.stats.totalStops}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Total Distance:</span>
                <span className="font-medium">{analysisResult.stats.totalDistance}m</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Average Speed:</span>
                <span className="font-medium">{analysisResult.stats.avgSpeed} km/h</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Travel Time:</span>
                <span className="font-medium">{analysisResult.stats.travelingTime} minutes</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Waiting Time:</span>
                <span className="font-medium">{analysisResult.stats.totalWaitingTime} minutes</span>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3 flex items-center gap-2">
              <MapPin className="text-blue-600" />
              Stop Distances
            </h3>
            
            <div className="max-h-64 overflow-y-auto">
              {analysisResult.stopDistances.map((distance, index) => (
                <div key={index} className="flex justify-between py-1 text-sm border-b border-gray-50">
                  <span className="text-gray-600">
                    Stop {index + 1} → {index + 2}
                  </span>
                  <span className="font-medium">{Math.round(distance)}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Node Table */}
      {analysisResult && (
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Node Table (Sample - First Trip)
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-3 py-2 text-left">NodeId</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">RouteId</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">StopId</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Timestamp</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Event</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Time</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Stop Name</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Attributes</th>
                </tr>
              </thead>
              <tbody>
                {analysisResult.nodes.map((node, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-3 py-2">{node.NodeId}</td>
                    <td className="border border-gray-300 px-3 py-2">{node.RouteId}</td>
                    <td className="border border-gray-300 px-3 py-2">{node.StopId}</td>
                    <td className="border border-gray-300 px-3 py-2">{node.Timestamp}</td>
                    <td className="border border-gray-300 px-3 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        node.Event === 'ARRIVAL' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {node.Event}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-3 py-2">{node.Time}</td>
                    <td className="border border-gray-300 px-3 py-2 text-sm">{node.StopName}</td>
                    <td className="border border-gray-300 px-3 py-2 text-xs font-mono">{node.Attributes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p>* This is a sample result for the first trip. In practice, all trips will be calculated.</p>
            <p>* Waiting time at each stop: 30 seconds</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusRouteAnalyzer;