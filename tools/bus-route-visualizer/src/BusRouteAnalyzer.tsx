import React, { useState, useRef } from 'react';
import { Upload, BarChart3, Clock, Truck, MapPin, TrendingUp, Filter, Download, RefreshCw, FileSpreadsheet, AlertCircle, Eye, Calculator, Navigation, ZoomIn, ZoomOut, RotateCcw, RotateCw } from 'lucide-react';

// Type definitions for updated node table with TripId
interface BusNode {
  NodeId: number;
  RouteId: number;
  RouteNo: string;
  RouteVarId: number;
  TripId: string;  // NEW COLUMN
  StopId: number;
  Timestamp: number;
  Event: 'ARRIVAL' | 'DEPARTURE';
  Time: string;
  StopName: string;
  Attributes: string;
}

interface BusLink {
  link_id: number;
  from_node: number;
  to_node: number;
  duration: number;
  mode: 'bus' | 'wait' | 'transfer' | 'walk';
}

// JSON Data Types
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

interface RouteStats {
  routeNo: string;
  routeId: number;
  totalNodes: number;
  totalTrips: number;
  variants: number;
  stops: number;
  avgTripDuration: number;
  timeSpan: {
    start: string;
    end: string;
    duration: number;
  };
}

interface TripStats {
  tripId: string;
  routeNo: string;
  nodeCount: number;
  duration: number;
  startTime: string;
  endTime: string;
  stopCount: number;
}

interface ValidationResult {
  totalTrips: number;
  invalidTrips: number;
  errorRate: string;
  issueTypes: { [key: string]: number };
  issues: any[];
}

interface AnalysisResult {
  variant: RouteVariant;
  stops: BusStop[];
  paths: RoutePath;
  stopDistances: number[];
  totalDistance: number;
  avgSpeed: number;
  nodes: BusNode[];
  isLoopRoute: boolean;
  tripCount: number;
  segmentDetails: {
    from: string;
    to: string;
    distance: number;
    pathIndices: { start: number; end: number };
    isWraparound: boolean;
  }[];
  stats: {
    totalStops: number;
    totalDistance: number;
    avgSpeed: number;
    travelingTime: number;
    totalWaitingTime: number;
    totalTrips: number;
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
  // JSON Data States
  const [jsonData, setJsonData] = useState<BusData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [visualization, setVisualization] = useState<Visualization | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // CSV Data States
  const [nodes, setNodes] = useState<BusNode[]>([]);
  const [links, setLinks] = useState<BusLink[]>([]);

  // UI States
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'routes' | 'trips' | 'network' | 'temporal' | 'json-analysis'>('overview');
  const [selectedTripFilter, setSelectedTripFilter] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<{ start: number; end: number }>({ start: 0, end: 86400 });
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // File input refs
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const nodeFileInputRef = useRef<HTMLInputElement>(null);
  const linkFileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV with TripId support
  const parseCSV = (text: string, hasHeader: boolean = true): any[] => {
    const lines = text.trim().split('\n');
    const startIndex = hasHeader ? 1 : 0;
    const headers = hasHeader ? lines[0].split(',').map(h => h.trim()) : null;

    return lines.slice(startIndex).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      if (hasHeader && headers) {
        const obj: any = {};
        headers.forEach((header, index) => {
          const value = values[index];
          // Type conversion for node data
          if (['NodeId', 'RouteId', 'RouteVarId', 'StopId', 'Timestamp'].includes(header)) {
            obj[header] = parseInt(value) || 0;
          } else if (['link_id', 'from_node', 'to_node', 'duration'].includes(header)) {
            obj[header] = parseInt(value) || 0;
          } else {
            obj[header] = value;
          }
        });
        return obj;
      }
      return values;
    });
  };

  // Parse time to seconds with better error handling
  const parseTimeToSeconds = (timeStr: string): number | null => {
    if (!timeStr || typeof timeStr !== 'string') {
      console.warn('Invalid time string:', timeStr);
      return null;
    }

    const trimmed = timeStr.trim();
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
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Check if route is a loop
  const isLoopRoute = (stops: BusStop[]): boolean => {
    if (stops.length < 2) return false;

    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];

    const tolerance = 0.000001;
    return Math.abs(firstStop.Lat - lastStop.Lat) < tolerance &&
      Math.abs(firstStop.Lng - lastStop.Lng) < tolerance;
  };

  // File upload handlers
  const handleJsonUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const result = e.target?.result;
          if (typeof result === 'string') {
            const data = JSON.parse(result) as BusData;
            setJsonData(data);
            setSelectedRoute(Object.keys(data)[0] || '');
            console.log(`📂 Loaded JSON with ${Object.keys(data).length} routes`);
          }
        } catch (error) {
          window.alert('❌ Error reading JSON file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleNodeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsedNodes = parseCSV(text) as BusNode[];
          setNodes(parsedNodes);
          console.log(`Loaded ${parsedNodes.length} nodes with TripId support`);
        } catch (error) {
          console.error('Error parsing node file:', error);
          window.alert('Error parsing node file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLinkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsedLinks = parseCSV(text) as BusLink[];
          setLinks(parsedLinks);
          console.log(`Loaded ${parsedLinks.length} links`);
        } catch (error) {
          console.error('Error parsing link file:', error);
          window.alert('Error parsing link file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    }
  };

  // Enhanced statistics with trip analysis
  const routeStats = React.useMemo((): RouteStats[] => {
    if (nodes.length === 0) return [];

    const routeGroups = nodes.reduce((acc, node) => {
      if (!acc[node.RouteNo]) {
        acc[node.RouteNo] = {
          routeNo: node.RouteNo,
          routeId: node.RouteId,
          nodes: [],
          trips: new Set<string>(),
          variants: new Set<number>(),
          stops: new Set<number>()
        };
      }
      acc[node.RouteNo].nodes.push(node);
      acc[node.RouteNo].trips.add(node.TripId);
      acc[node.RouteNo].variants.add(node.RouteVarId);
      acc[node.RouteNo].stops.add(node.StopId);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(routeGroups).map(group => {
      const timestamps = group.nodes.map((n: BusNode) => n.Timestamp);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);

      // Calculate average trip duration
      const tripDurations = Array.from(group.trips).map(tripId => {
        const tripNodes = group.nodes.filter((n: BusNode) => n.TripId === tripId);
        const tripTimestamps = tripNodes.map((n: BusNode) => n.Timestamp);
        return Math.max(...tripTimestamps) - Math.min(...tripTimestamps);
      });
      const avgTripDuration = tripDurations.length > 0
        ? tripDurations.reduce((a, b) => a + b, 0) / tripDurations.length
        : 0;

      return {
        routeNo: group.routeNo,
        routeId: group.routeId,
        totalNodes: group.nodes.length,
        totalTrips: group.trips.size,
        variants: group.variants.size,
        stops: group.stops.size,
        avgTripDuration,
        timeSpan: {
          start: new Date(minTime * 1000).toTimeString().substr(0, 8),
          end: new Date(maxTime * 1000).toTimeString().substr(0, 8),
          duration: maxTime - minTime
        }
      };
    }).sort((a, b) => b.totalNodes - a.totalNodes);
  }, [nodes]);

  // Trip-level statistics
  const tripStats = React.useMemo((): TripStats[] => {
    if (nodes.length === 0) return [];

    const tripGroups = nodes.reduce((acc, node) => {
      if (!acc[node.TripId]) {
        acc[node.TripId] = {
          tripId: node.TripId,
          routeNo: node.RouteNo,
          nodes: [],
          stops: new Set<number>()
        };
      }
      acc[node.TripId].nodes.push(node);
      acc[node.TripId].stops.add(node.StopId);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(tripGroups).map(group => {
      const timestamps = group.nodes.map((n: BusNode) => n.Timestamp);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);

      return {
        tripId: group.tripId,
        routeNo: group.routeNo,
        nodeCount: group.nodes.length,
        duration: maxTime - minTime,
        startTime: new Date(minTime * 1000).toTimeString().substr(0, 8),
        endTime: new Date(maxTime * 1000).toTimeString().substr(0, 8),
        stopCount: group.stops.size
      };
    }).sort((a, b) => b.duration - a.duration);
  }, [nodes]);

  // Filtered data based on selections
  const filteredNodes = React.useMemo(() => {
    return nodes.filter(node => {
      const tripMatch = !selectedTripFilter || node.TripId === selectedTripFilter;
      const timeMatch = node.Timestamp >= timeFilter.start && node.Timestamp <= timeFilter.end;
      return tripMatch && timeMatch;
    });
  }, [nodes, selectedTripFilter, timeFilter]);

  // Link statistics
  const linkStats = React.useMemo(() => {
    const modeCount = links.reduce((acc, link) => {
      acc[link.mode] = (acc[link.mode] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgDurationByMode = Object.keys(modeCount).reduce((acc, mode) => {
      const modeLinks = links.filter(link => link.mode === mode);
      const avgDuration = modeLinks.reduce((sum, link) => sum + link.duration, 0) / modeLinks.length;
      acc[mode] = avgDuration || 0;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: links.length,
      byMode: modeCount,
      avgDurationByMode
    };
  }, [links]);

  // Format duration helper
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
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
  const calculateRealDistance = (
    stop1: BusStop,
    stop2: BusStop,
    pathLats: number[],
    pathLngs: number[],
    isLoop: boolean,
    stopIndex1: number,
    stopIndex2: number,
    totalStops: number
  ): { distance: number; pathIndices: { start: number; end: number }; isWraparound: boolean } => {
    const nearest1 = findNearestPointOnPath(stop1.Lat, stop1.Lng, pathLats, pathLngs);
    const nearest2 = findNearestPointOnPath(stop2.Lat, stop2.Lng, pathLats, pathLngs);

    let totalDistance = 0;
    let isWraparound = false;

    if (isLoop && stopIndex1 === totalStops - 2 && stopIndex2 === totalStops - 1) {
      if (nearest2.index < nearest1.index) {
        isWraparound = true;

        for (let i = nearest1.index; i < pathLats.length - 1; i++) {
          totalDistance += haversineDistance(
            pathLats[i], pathLngs[i],
            pathLats[i + 1], pathLngs[i + 1]
          );
        }

        for (let i = 0; i < nearest2.index; i++) {
          totalDistance += haversineDistance(
            pathLats[i], pathLngs[i],
            pathLats[i + 1], pathLngs[i + 1]
          );
        }

        console.log(`Loop route wraparound detected: Stop ${stopIndex1} → Stop ${stopIndex2}`);
      } else {
        const startIndex = Math.min(nearest1.index, nearest2.index);
        const endIndex = Math.max(nearest1.index, nearest2.index);

        for (let i = startIndex; i < endIndex; i++) {
          totalDistance += haversineDistance(
            pathLats[i], pathLngs[i],
            pathLats[i + 1], pathLngs[i + 1]
          );
        }
      }
    } else {
      const startIndex = Math.min(nearest1.index, nearest2.index);
      const endIndex = Math.max(nearest1.index, nearest2.index);

      for (let i = startIndex; i < endIndex; i++) {
        totalDistance += haversineDistance(
          pathLats[i], pathLngs[i],
          pathLats[i + 1], pathLngs[i + 1]
        );
      }
    }

    return {
      distance: totalDistance,
      pathIndices: { start: nearest1.index, end: nearest2.index },
      isWraparound
    };
  };

  // Enhanced process route variant with trip counting
  const processRouteVariant = (routeData: RouteData, variantId: number): AnalysisResult | null => {
    console.log(`\n=== Processing variant ${variantId} for route ${routeData.getroutebyid?.RouteNo} ===`);

    const variant = routeData.getvarsbyroute.find(v => v.RouteVarId === variantId);
    const stops = routeData.getstopsbyvar[variantId.toString()] || [];
    const paths = routeData.getpathsbyvar[variantId.toString()];

    if (!variant || !stops || !paths) {
      console.warn(`Missing data for variant ${variantId}`);
      return null;
    }

    const isLoop = isLoopRoute(stops);
    console.log(`Route type: ${isLoop ? 'LOOP ROUTE' : 'Normal route'}`);

    // Get all timetables and count trips
    const timetables = routeData.gettimetablebyroute.filter(t => t.RouteVarId === variantId);
    let totalTrips = 0;

    timetables.forEach(timetable => {
      const trips = routeData.gettripsbytimetable[timetable.TimeTableId.toString()] || [];
      totalTrips += trips.length;
    });

    console.log(`Found ${totalTrips} total trips across ${timetables.length} timetables`);

    if (timetables.length === 0) {
      console.warn(`No timetables found for variant ${variantId}`);
      return null;
    }

    const pathLats = paths.lat;
    const pathLngs = paths.lng;

    // Calculate distances between consecutive stops
    const stopDistances: number[] = [];
    const segmentDetails: any[] = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const result = calculateRealDistance(
        stops[i],
        stops[i + 1],
        pathLats,
        pathLngs,
        isLoop,
        i,
        i + 1,
        stops.length
      );

      stopDistances.push(result.distance);
      segmentDetails.push({
        from: `${stops[i].Name} (Stop ${i + 1})`,
        to: `${stops[i + 1].Name} (Stop ${i + 2})`,
        distance: Math.round(result.distance),
        pathIndices: result.pathIndices,
        isWraparound: result.isWraparound
      });
    }

    const totalDistance = stopDistances.reduce((sum, d) => sum + d, 0);
    console.log(`Total route distance: ${Math.round(totalDistance)}m`);

    // Generate nodes for ALL trips in this variant
    const nodes: BusNode[] = [];
    let nodeId = 1;
    let validTrips = 0;
    let avgSpeedSum = 0;

    for (const timetable of timetables) {
      const trips = routeData.gettripsbytimetable[timetable.TimeTableId.toString()] || [];

      for (const trip of trips) {
        const startTimeSeconds = parseTimeToSeconds(trip.StartTime);
        const endTimeSeconds = parseTimeToSeconds(trip.EndTime);

        if (startTimeSeconds === null || endTimeSeconds === null) {
          console.warn(`Skipping trip ${trip.TripId}: invalid time`);
          continue;
        }

        const waitingTime = 30;
        const totalWaitingTime = (stops.length - 1) * waitingTime;
        const travelingTime = endTimeSeconds - startTimeSeconds - totalWaitingTime;

        if (travelingTime <= 0) {
          console.warn(`Skipping trip ${trip.TripId}: invalid travel time`);
          continue;
        }

        const avgSpeed = totalDistance / travelingTime;
        avgSpeedSum += avgSpeed;
        validTrips++;

        let currentTime = startTimeSeconds;

        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i];

          if (i === 0) {
            nodes.push({
              NodeId: nodeId++,
              RouteId: routeData.getroutebyid?.RouteId || 0,
              RouteNo: routeData.getroutebyid?.RouteNo || '',
              RouteVarId: variantId,
              TripId: trip.TripId.toString(),
              StopId: stop.StopId,
              Timestamp: currentTime,
              Event: 'DEPARTURE',
              StopName: stop.Name,
              Time: new Date(currentTime * 1000).toISOString().substr(11, 8),
              Attributes: JSON.stringify([routeData.getroutebyid?.RouteId || 0, stop.StopId, currentTime, 'DEPARTURE'])
            });
          } else {
            const distanceFromPrevious = stopDistances[i - 1];
            const travelTime = distanceFromPrevious / avgSpeed;
            currentTime += travelTime;

            nodes.push({
              NodeId: nodeId++,
              RouteId: routeData.getroutebyid?.RouteId || 0,
              RouteNo: routeData.getroutebyid?.RouteNo || '',
              RouteVarId: variantId,
              TripId: trip.TripId.toString(),
              StopId: stop.StopId,
              Timestamp: Math.round(currentTime),
              Event: 'ARRIVAL',
              StopName: stop.Name,
              Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
              Attributes: JSON.stringify([routeData.getroutebyid?.RouteId || 0, stop.StopId, Math.round(currentTime), 'ARRIVAL'])
            });

            if (i < stops.length - 1) {
              currentTime += waitingTime;
              nodes.push({
                NodeId: nodeId++,
                RouteId: routeData.getroutebyid?.RouteId || 0,
                RouteNo: routeData.getroutebyid?.RouteNo || '',
                RouteVarId: variantId,
                TripId: trip.TripId.toString(),
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
      }
    }

    console.log(`Generated ${nodes.length} nodes from ${validTrips} valid trips`);

    if (validTrips === 0) {
      console.warn(`No valid trips found for variant ${variantId}`);
      return null;
    }

    // Sort nodes by NodeId for proper display order
    nodes.sort((a, b) => a.NodeId - b.NodeId);

    // Calculate average speed from all valid trips
    const avgSpeed = validTrips > 0 ? avgSpeedSum / validTrips : 0;

    return {
      variant,
      stops,
      paths,
      stopDistances,
      totalDistance,
      avgSpeed,
      nodes,
      isLoopRoute: isLoop,
      tripCount: totalTrips,
      segmentDetails,
      stats: {
        totalStops: stops.length,
        totalDistance: Math.round(totalDistance),
        avgSpeed: Math.round(avgSpeed * 3.6 * 100) / 100,
        travelingTime: validTrips > 0 ? Math.round((totalDistance / avgSpeed) / 60 * 100) / 100 : 0,
        totalWaitingTime: Math.round((stops.length - 1) * 30 / 60 * 100) / 100,
        totalTrips: totalTrips
      }
    };
  };

  // Create visualization
  const createVisualization = (result: AnalysisResult): Visualization | null => {
    if (!result) return null;

    const { stops, paths } = result;

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

    const width = 648;
    const height = 502;

    const latToY = (lat: number) => height - ((lat - viewMinLat) / (viewMaxLat - viewMinLat)) * height;
    const lngToX = (lng: number) => ((lng - viewMinLng) / (viewMaxLng - viewMinLng)) * width;

    const pathPoints = paths.lat.map((lat, i) => ({
      x: lngToX(paths.lng[i]),
      y: latToY(lat)
    }));

    const stopPoints = stops.map(stop => ({
      ...stop,
      x: lngToX(stop.Lng),
      y: latToY(stop.Lat)
    }));

    return { pathPoints, stopPoints, width, height, bounds: { viewMinLat, viewMaxLat, viewMinLng, viewMaxLng } };
  };

  // Handle analyze route
  const handleAnalyze = (): void => {
    if (!jsonData || !selectedRoute || !selectedVariant) {
      window.alert('Please select route and variant');
      return;
    }

    // Reset zoom when analyzing new route
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);

    const routeData = jsonData[selectedRoute];

    // Check if this will be a large processing job
    const variant = routeData.getvarsbyroute.find(v => v.RouteVarId === parseInt(selectedVariant));
    const timetables = routeData.gettimetablebyroute?.filter(t => t.RouteVarId === parseInt(selectedVariant)) || [];
    let totalTrips = 0;

    timetables.forEach(timetable => {
      const trips = routeData.gettripsbytimetable?.[timetable.TimeTableId.toString()] || [];
      totalTrips += trips.length;
    });

    if (totalTrips > 100) {
      const proceed = window.confirm(`This route variant has ${totalTrips} trips which will generate a large number of nodes. Processing may take a moment. Continue?`);
      if (!proceed) return;
    }

    console.log(`Starting analysis of ${variant?.RouteVarName} with ${totalTrips} trips...`);

    const result = processRouteVariant(routeData, parseInt(selectedVariant));
    setAnalysisResult(result);

    if (result) {
      const viz = createVisualization(result);
      setVisualization(viz);
      console.log(`Analysis complete: Generated ${result.nodes.length} nodes`);
    }
  };

  // Enhanced process all routes with TripId support
  const processAllRoutes = async (): Promise<void> => {
    if (!jsonData) {
      window.alert('Please upload JSON file first');
      return;
    }

    console.log('🚀 Starting Node Table generation...');
    setIsProcessing(true);
    setProcessProgress(0);

    const allNodes: any[] = [];
    let globalNodeId = 1;
    const routeIds = Object.keys(jsonData);
    let processedCount = 0;

    console.log(`📊 Total routes to process: ${routeIds.length}`);

    try {
      for (const routeId of routeIds) {
        console.log(`🔄 Processing route ${routeId}...`);
        const routeData = jsonData[routeId];

        const actualRouteId = routeData.getroutebyid?.RouteId || parseInt(routeId);
        const routeNo = routeData.getroutebyid?.RouteNo || routeId;

        const variants = routeData.getvarsbyroute || [];
        console.log(`  📍 Variants: ${variants.length}`);

        for (const variant of variants) {
          const variantId = variant.RouteVarId;
          const stops = routeData.getstopsbyvar?.[variantId.toString()] || [];
          const paths = routeData.getpathsbyvar?.[variantId.toString()];

          if (!stops || !paths || stops.length === 0) {
            continue;
          }

          const isLoop = isLoopRoute(stops);
          const timetables = routeData.gettimetablebyroute?.filter(t => t.RouteVarId === variantId) || [];

          console.log(`  🚌 Variant ${variantId}: ${timetables.length} timetables, Loop: ${isLoop}`);

          for (const timetable of timetables) {
            const trips = routeData.gettripsbytimetable?.[timetable.TimeTableId.toString()] || [];

            if (trips.length === 0) continue;

            const pathLats = paths.lat;
            const pathLngs = paths.lng;

            // Calculate stop distances once per variant
            const stopDistances: number[] = [];
            for (let i = 0; i < stops.length - 1; i++) {
              const result = calculateRealDistance(
                stops[i],
                stops[i + 1],
                pathLats,
                pathLngs,
                isLoop,
                i,
                i + 1,
                stops.length
              );
              stopDistances.push(result.distance);
            }

            const totalDistance = stopDistances.reduce((sum, d) => sum + d, 0);

            // Process each trip
            for (const trip of trips) {
              try {
                const startTimeSeconds = parseTimeToSeconds(trip.StartTime);
                const endTimeSeconds = parseTimeToSeconds(trip.EndTime);

                if (startTimeSeconds === null || endTimeSeconds === null) {
                  continue;
                }

                const waitingTime = 30;
                const totalWaitingTime = (stops.length - 1) * waitingTime;
                const travelingTime = endTimeSeconds - startTimeSeconds - totalWaitingTime;

                if (travelingTime <= 0) {
                  continue;
                }

                const avgSpeed = totalDistance / travelingTime;
                let currentTime = startTimeSeconds;

                for (let i = 0; i < stops.length; i++) {
                  const stop = stops[i];

                  if (i === 0) {
                    // First stop: only DEPARTURE
                    allNodes.push({
                      NodeId: globalNodeId++,
                      RouteId: actualRouteId,
                      RouteNo: routeNo,
                      RouteVarId: variantId,
                      TripId: trip.TripId,
                      StopId: stop.StopId,
                      Timestamp: Math.round(currentTime),
                      Event: 'DEPARTURE',
                      Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                      StopName: stop.Name,
                      Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'DEPARTURE'])
                    });
                  } else {
                    const distanceFromPrevious = stopDistances[i - 1];
                    const travelTime = distanceFromPrevious / avgSpeed;
                    currentTime += travelTime;

                    // ARRIVAL event
                    allNodes.push({
                      NodeId: globalNodeId++,
                      RouteId: actualRouteId,
                      RouteNo: routeNo,
                      RouteVarId: variantId,
                      TripId: trip.TripId,
                      StopId: stop.StopId,
                      Timestamp: Math.round(currentTime),
                      Event: 'ARRIVAL',
                      Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                      StopName: stop.Name,
                      Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'ARRIVAL'])
                    });

                    if (i < stops.length - 1) {
                      currentTime += waitingTime;
                      // DEPARTURE event
                      allNodes.push({
                        NodeId: globalNodeId++,
                        RouteId: actualRouteId,
                        RouteNo: routeNo,
                        RouteVarId: variantId,
                        TripId: trip.TripId,
                        StopId: stop.StopId,
                        Timestamp: Math.round(currentTime),
                        Event: 'DEPARTURE',
                        Time: new Date(Math.round(currentTime) * 1000).toISOString().substr(11, 8),
                        StopName: stop.Name,
                        Attributes: JSON.stringify([actualRouteId, stop.StopId, Math.round(currentTime), 'DEPARTURE'])
                      });
                    }
                  }
                }
              } catch (tripError) {
                console.error(`❌ Error processing trip ${trip.TripId}:`, tripError);
              }
            }
          }
        }

        processedCount++;
        setProcessProgress((processedCount / routeIds.length) * 100);
      }

      console.log(`✅ Generated ${allNodes.length.toLocaleString()} nodes`);

      if (allNodes.length > 0) {
        // Create CSV
        const headers = ['NodeId', 'RouteId', 'RouteNo', 'RouteVarId', 'TripId', 'StopId', 'Timestamp', 'Event', 'Time', 'StopName', 'Attributes'];

        const csvRows = [headers.join(',')];

        allNodes.forEach(node => {
          const row = [
            node.NodeId,
            node.RouteId,
            `"${node.RouteNo}"`,
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

        // Enhanced download interface
        const blob = new Blob([nodeTableCsvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `node_table_${new Date().toISOString().split('T')[0]}.csv`;
        downloadLink.textContent = `📥 Download Node Table CSV (${allNodes.length.toLocaleString()} nodes)`;
        downloadLink.style.cssText = `
          display: inline-block;
          padding: 12px 24px;
          background: linear-gradient(135deg, #4CAF50, #45a049);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          margin: 10px;
          font-weight: bold;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          transition: transform 0.2s;
        `;

        downloadLink.onmouseover = () => downloadLink.style.transform = 'translateY(-2px)';
        downloadLink.onmouseout = () => downloadLink.style.transform = 'translateY(0)';

        const downloadContainer = document.createElement('div');
        downloadContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          background: white;
          padding: 25px;
          border: 3px solid #4CAF50;
          border-radius: 12px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
          max-width: 450px;
          animation: slideIn 0.3s ease-out;
        `;

        downloadContainer.innerHTML = `
          <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
            ✅ Node Table Generated Successfully!
          </h3>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
              📊 <strong>${allNodes.length.toLocaleString()} nodes</strong> from <strong>${routeIds.length} routes</strong>
            </p>
            <p style="margin: 0; color: #666; font-size: 14px;">
              📁 File size: <strong>${(nodeTableCsvContent.length / 1024 / 1024).toFixed(2)} MB</strong>
            </p>
          </div>
        `;

        downloadContainer.appendChild(downloadLink);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖ Close';
        closeBtn.style.cssText = `
          display: block;
          width: 100%;
          margin-top: 15px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #f44336, #d32f2f);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.2s;
        `;
        closeBtn.onclick = () => {
          downloadContainer.remove();
          URL.revokeObjectURL(url);
        };

        downloadContainer.appendChild(closeBtn);

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);

        document.body.appendChild(downloadContainer);

        console.log(`🎉 SUCCESS: Generated ${allNodes.length.toLocaleString()} nodes!`);
      } else {
        console.error('❌ No data to export!');
        window.alert('❌ No data generated! Please check your JSON file.');
      }
    } catch (error) {
      console.error('💥 Error:', error);
      window.alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // Zoom and Pan controls
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.2, 0.2));
  };

  const handleResetView = () => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  };

  // Validation function for JSON data
  const validateTimeData = (): void => {
    if (!jsonData) {
      window.alert('Please upload JSON file first');
      return;
    }

    console.log('=== STARTING TIME DATA VALIDATION ===');

    const issues: any[] = [];
    let totalTrips = 0;
    let invalidTrips = 0;

    Object.keys(jsonData).forEach(routeId => {
      const routeData = jsonData[routeId];
      const routeNo = routeData.getroutebyid?.RouteNo || routeId;

      const timetables = routeData.gettimetablebyroute || [];

      timetables.forEach(timetable => {
        const trips = routeData.gettripsbytimetable?.[timetable.TimeTableId.toString()] || [];

        trips.forEach(trip => {
          totalTrips++;

          if (!trip.StartTime || typeof trip.StartTime !== 'string' || !trip.StartTime.match(/^\d{1,2}:\d{2}$/)) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'Invalid StartTime',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          }

          if (!trip.EndTime || typeof trip.EndTime !== 'string' || !trip.EndTime.match(/^\d{1,2}:\d{2}$/)) {
            issues.push({
              routeId,
              routeNo,
              timetableId: timetable.TimeTableId,
              tripId: trip.TripId,
              issue: 'Invalid EndTime',
              startTime: trip.StartTime,
              endTime: trip.EndTime
            });
            invalidTrips++;
          }

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

    console.log(`Total trips: ${totalTrips}`);
    console.log(`Invalid trips: ${invalidTrips}`);
    console.log(`Error rate: ${(invalidTrips / totalTrips * 100).toFixed(2)}%`);

    const issueTypes: { [key: string]: number } = {};
    issues.forEach(issue => {
      issueTypes[issue.issue] = (issueTypes[issue.issue] || 0) + 1;
    });

    setValidationResult({
      totalTrips,
      invalidTrips,
      errorRate: (invalidTrips / totalTrips * 100).toFixed(2),
      issueTypes,
      issues: issues.slice(0, 100)
    });
  };

  // Render methods for different tabs
  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={20} />
            <h3 className="font-semibold text-blue-900">Total Nodes</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600">{nodes.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Truck className="text-green-600" size={20} />
            <h3 className="font-semibold text-green-900">Total Routes</h3>
          </div>
          <p className="text-2xl font-bold text-green-600">{routeStats.length}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="text-purple-600" size={20} />
            <h3 className="font-semibold text-purple-900">Total Trips</h3>
          </div>
          <p className="text-2xl font-bold text-purple-600">{tripStats.length}</p>
        </div>
      </div>

      {links.length > 0 && (
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="font-semibold mb-4">Link Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(linkStats.byMode).map(([mode, count]) => (
              <div key={mode} className="text-center">
                <p className="text-sm text-gray-600 capitalize">{mode}</p>
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-gray-500">
                  Avg: {linkStats.avgDurationByMode[mode]?.toFixed(1)}s
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {jsonData && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 className="font-semibold mb-2 text-yellow-900">JSON Data Loaded</h3>
          <p className="text-yellow-800">
            {Object.keys(jsonData).length} routes available for detailed analysis.
            Switch to "JSON Analysis" tab to explore and generate node tables.
          </p>
        </div>
      )}
    </div>
  );

  const renderRoutes = () => (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left">Route</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Nodes</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Trips</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Variants</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Stops</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Avg Trip Duration</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Time Span</th>
            </tr>
          </thead>
          <tbody>
            {routeStats.map(route => (
              <tr key={route.routeNo} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 font-semibold">{route.routeNo}</td>
                <td className="border border-gray-300 px-4 py-2">{route.totalNodes}</td>
                <td className="border border-gray-300 px-4 py-2">{route.totalTrips}</td>
                <td className="border border-gray-300 px-4 py-2">{route.variants}</td>
                <td className="border border-gray-300 px-4 py-2">{route.stops}</td>
                <td className="border border-gray-300 px-4 py-2">{formatDuration(route.avgTripDuration)}</td>
                <td className="border border-gray-300 px-4 py-2">
                  {route.timeSpan.start} - {route.timeSpan.end}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTrips = () => (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <select
          value={selectedTripFilter}
          onChange={(e) => setSelectedTripFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Trips</option>
          {tripStats.slice(0, 100).map(trip => (
            <option key={trip.tripId} value={trip.tripId}>
              {trip.tripId} (Route {trip.routeNo})
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left">Trip ID</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Route</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Nodes</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Stops</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Duration</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Start Time</th>
              <th className="border border-gray-300 px-4 py-2 text-left">End Time</th>
            </tr>
          </thead>
          <tbody>
            {tripStats.slice(0, 50).map(trip => (
              <tr key={trip.tripId} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 font-mono text-sm">{trip.tripId}</td>
                <td className="border border-gray-300 px-4 py-2">{trip.routeNo}</td>
                <td className="border border-gray-300 px-4 py-2">{trip.nodeCount}</td>
                <td className="border border-gray-300 px-4 py-2">{trip.stopCount}</td>
                <td className="border border-gray-300 px-4 py-2">{formatDuration(trip.duration)}</td>
                <td className="border border-gray-300 px-4 py-2">{trip.startTime}</td>
                <td className="border border-gray-300 px-4 py-2">{trip.endTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderNetwork = () => (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-semibold mb-4">Network Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">Total Links</p>
            <p className="text-2xl font-bold">{links.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Unique Nodes</p>
            <p className="text-2xl font-bold">{new Set(nodes.map(n => n.NodeId)).size}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Bus Links</p>
            <p className="text-2xl font-bold">{linkStats.byMode.bus || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Transfer Links</p>
            <p className="text-2xl font-bold">{linkStats.byMode.transfer || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTemporal = () => (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-semibold mb-4">Temporal Analysis</h3>
        <p className="text-gray-600">
          Filtered data contains {filteredNodes.length} nodes
        </p>
        {filteredNodes.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              Time range: {new Date(Math.min(...filteredNodes.map(n => n.Timestamp)) * 1000).toLocaleString()}
              {' to '}
              {new Date(Math.max(...filteredNodes.map(n => n.Timestamp)) * 1000).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderJsonAnalysis = () => {
    if (!jsonData) {
      return (
        <div className="text-center py-12">
          <FileSpreadsheet size={64} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No JSON Data Loaded</h3>
          <p className="text-gray-500">Upload a JSON file to access route analysis and node generation features.</p>
        </div>
      );
    }

    const availableVariants = selectedRoute && jsonData ?
      jsonData[selectedRoute].getvarsbyroute || [] : [];

    return (
      <div className="space-y-6">
        {/* Route Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Route
            </label>
            <select
              value={selectedRoute}
              onChange={(e) => {
                setSelectedRoute(e.target.value);
                setSelectedVariant('');
                setAnalysisResult(null);
                setVisualization(null);
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
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
              Select Direction/Variant
            </label>
            <select
              value={selectedVariant}
              onChange={(e) => {
                setSelectedVariant(e.target.value);
                setAnalysisResult(null);
                setVisualization(null);
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
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

        {/* Action Buttons */}
        <div className="flex gap-4 flex-wrap">
          {selectedRoute && selectedVariant && (
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <Calculator size={20} />
              Analyze Route & Generate Nodes
            </button>
          )}

          <button
            onClick={validateTimeData}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors shadow-md"
          >
            <AlertCircle size={20} />
            Validate Data
          </button>

          <button
            onClick={processAllRoutes}
            disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 shadow-md"
          >
            <FileSpreadsheet size={20} />
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing... {Math.round(processProgress)}%
              </>
            ) : (
              'Generate Node Table (CSV)'
            )}
          </button>
        </div>

        {/* Validation Results */}
        {validationResult && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle className="text-yellow-600" />
              Data Validation Results
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="text-sm text-blue-600 font-medium">Total Trips</div>
                <div className="text-2xl font-bold text-blue-800">{validationResult.totalTrips.toLocaleString()}</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-red-600 font-medium">Invalid Trips</div>
                <div className="text-2xl font-bold text-red-800">{validationResult.invalidTrips.toLocaleString()}</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                <div className="text-sm text-yellow-600 font-medium">Error Rate</div>
                <div className="text-2xl font-bold text-yellow-800">{validationResult.errorRate}%</div>
              </div>
            </div>

            {Object.keys(validationResult.issueTypes).length > 0 && (
              <>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Error Categories</h3>
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border">
                  {Object.entries(validationResult.issueTypes).map(([type, count]) => (
                    <div key={type} className="flex justify-between py-2 border-b border-gray-200 last:border-0">
                      <span className="text-gray-700">{type}</span>
                      <span className="font-medium text-gray-900 bg-gray-200 px-2 py-1 rounded text-sm">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <>
            {/* Enhanced Loop Route Indicator */}
            {analysisResult.isLoopRoute && (
              <div className="bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-300 rounded-lg p-4 mb-6 flex items-center gap-3 shadow-md">
                <RotateCw className="text-amber-600" size={24} />
                <div>
                  <h3 className="font-semibold text-amber-900">🔄 Loop Route Detected</h3>
                  <p className="text-sm text-amber-700">
                    This route starts and ends at the same location. Enhanced distance calculations with wraparound logic applied.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Enhanced Visualization with Zoom Controls */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Eye className="text-purple-600" />
                    Route Visualization
                  </h2>

                  {/* Zoom Controls */}
                  {visualization && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleZoomOut}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
                        title="Zoom Out"
                      >
                        <ZoomOut size={16} />
                      </button>
                      <span className="text-sm text-gray-600 min-w-[60px] text-center font-mono">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        onClick={handleZoomIn}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
                        title="Zoom In"
                      >
                        <ZoomIn size={16} />
                      </button>
                      <button
                        onClick={handleResetView}
                        className="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors ml-2"
                        title="Reset View"
                      >
                        <RotateCcw size={16} />
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {visualization ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <div
                      className="overflow-auto max-h-[600px] bg-gray-50 border-2 border-dashed border-gray-300"
                      onWheel={(e) => {
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? 0.9 : 1.1;
                        setZoomLevel(prev => Math.max(0.2, Math.min(5, prev * delta)));
                      }}
                      style={{
                        minHeight: '400px'
                      }}
                    >
                      <div
                        style={{
                          width: visualization.width * zoomLevel,
                          height: visualization.height * zoomLevel,
                          minWidth: '100%',
                          minHeight: '100%',
                          cursor: 'move'
                        }}
                        onMouseDown={(e) => {
                          let isDragging = true;
                          const startX = e.clientX - panX;
                          const startY = e.clientY - panY;

                          const handleMouseMove = (e: MouseEvent) => {
                            if (isDragging) {
                              setPanX(e.clientX - startX);
                              setPanY(e.clientY - startY);
                            }
                          };

                          const handleMouseUp = () => {
                            isDragging = false;
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };

                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      >
                        <svg
                          width={visualization.width * zoomLevel}
                          height={visualization.height * zoomLevel}
                          className="border"
                          style={{
                            transform: `translate(${panX}px, ${panY}px)`
                          }}
                        >
                          {/* Enhanced Background */}
                          <defs>
                            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" style={{ stopColor: "#f8fafc", stopOpacity: 1 }} />
                              <stop offset="100%" style={{ stopColor: "#e2e8f0", stopOpacity: 1 }} />
                            </linearGradient>
                          </defs>
                          <rect width={visualization.width * zoomLevel} height={visualization.height * zoomLevel} fill="url(#bgGradient)" />

                          {/* Enhanced Path */}
                          <polyline
                            points={visualization.pathPoints.map(p => `${p.x * zoomLevel},${p.y * zoomLevel}`).join(' ')}
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth={4 * zoomLevel}
                            opacity="0.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Enhanced Stops */}
                          {visualization.stopPoints.map((stop, index) => {
                            const isStartEnd = index === 0 || index === visualization.stopPoints.length - 1;
                            const isLoop = analysisResult?.isLoopRoute && index === visualization.stopPoints.length - 1;

                            return (
                              <g key={stop.StopId}>
                                <circle
                                  cx={stop.x * zoomLevel}
                                  cy={stop.y * zoomLevel}
                                  r={10 * zoomLevel}
                                  fill={isStartEnd ? (isLoop ? "#F59E0B" : "#10B981") : "#EF4444"}
                                  stroke="#ffffff"
                                  strokeWidth={3 * zoomLevel}
                                />
                                <text
                                  x={stop.x * zoomLevel}
                                  y={(stop.y - 16) * zoomLevel}
                                  textAnchor="middle"
                                  fontSize={12 * zoomLevel}
                                  className="font-bold fill-gray-800"
                                >
                                  {index + 1}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 text-sm">
                      <div className="flex flex-wrap items-center gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-1 bg-blue-500 rounded"></div>
                          <span>Route Path</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span>Start Stop</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span>Regular Stops</span>
                        </div>
                        {analysisResult?.isLoopRoute && (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                            <span>Loop End</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600 text-xs mb-2">
                        Coverage: {visualization.bounds.viewMinLat.toFixed(4)}, {visualization.bounds.viewMinLng.toFixed(4)} → {visualization.bounds.viewMaxLat.toFixed(4)}, {visualization.bounds.viewMaxLng.toFixed(4)}
                      </div>
                      <div className="text-gray-600 text-xs">
                        💡 <strong>Interactive Controls:</strong> Mouse wheel to zoom, click and drag to pan, or use zoom buttons above.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg bg-gray-50 h-96 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <MapPin size={48} className="mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium">No Route Selected</p>
                      <p className="text-sm">Select a route and variant, then click "Analyze" to see the visualization</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Enhanced Statistics */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="text-green-600" />
                  Route Statistics
                </h2>

                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Route Type:</span>
                    <span className="font-medium flex items-center gap-2">
                      {analysisResult.isLoopRoute ? (
                        <>
                          <RotateCw size={16} className="text-amber-600" />
                          Loop Route
                        </>
                      ) : (
                        <>
                          <MapPin size={16} className="text-blue-600" />
                          Linear Route
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Total Stops:</span>
                    <span className="font-medium text-blue-600">{analysisResult.stats.totalStops}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Total Distance:</span>
                    <span className="font-medium text-green-600">{analysisResult.stats.totalDistance.toLocaleString()}m</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Average Speed:</span>
                    <span className="font-medium text-purple-600">{analysisResult.stats.avgSpeed} km/h</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Travel Time:</span>
                    <span className="font-medium text-orange-600">{analysisResult.stats.travelingTime} min</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Waiting Time:</span>
                    <span className="font-medium text-indigo-600">{analysisResult.stats.totalWaitingTime} min</span>
                  </div>
                  <div className="flex justify-between py-2 bg-green-50 rounded px-3">
                    <span className="text-gray-600 font-medium">Total Trips:</span>
                    <span className="font-bold text-green-700">{analysisResult.stats.totalTrips.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-blue-50 rounded px-3 mt-2">
                    <span className="text-gray-600 font-medium">Generated Nodes:</span>
                    <span className="font-bold text-blue-700">{analysisResult.nodes.length.toLocaleString()}</span>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3 flex items-center gap-2">
                  <Clock className="text-blue-600" />
                  Segment Analysis
                </h3>

                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {analysisResult.segmentDetails.map((segment, index) => (
                    <div key={index} className={`p-3 text-sm border-b border-gray-100 last:border-0 ${segment.isWraparound ? 'bg-amber-50 border-l-4 border-l-amber-400' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 flex-1 text-xs">
                          {segment.from} → {segment.to}
                        </span>
                        {segment.isWraparound && (
                          <RotateCw size={14} className="text-amber-600 mx-2" />
                        )}
                        <span className="font-medium text-green-600">{segment.distance.toLocaleString()}m</span>
                      </div>
                      {segment.isWraparound && (
                        <div className="text-xs text-amber-600 mt-1 font-medium">
                          🔄 Wraparound: Path {segment.pathIndices.start} → end → start → {segment.pathIndices.end}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Enhanced Node Table */}
            <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileSpreadsheet className="text-blue-600" />
                Complete Node Table - {analysisResult.variant.RouteVarName}
                <span className="text-sm font-normal text-gray-600 bg-green-50 px-2 py-1 rounded">
                  {analysisResult.nodes.length.toLocaleString()} nodes
                </span>
                {analysisResult.nodes.length > 1000 && (
                  <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    Large dataset - scrollable view
                  </span>
                )}
              </h2>

              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">NodeId</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">RouteId</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">RouteNo</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">RouteVarId</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">TripId</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">StopId</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Timestamp</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Event</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Time</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Stop Name</th>
                      <th className="border border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Attributes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResult.nodes.map((node, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.NodeId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.RouteId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm font-medium">{node.RouteNo}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.RouteVarId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.TripId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.StopId}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{node.Timestamp}</td>
                        <td className="border border-gray-300 px-3 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${node.Event === 'ARRIVAL' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                            {node.Event}
                          </span>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm font-mono">{node.Time}</td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={node.StopName}>
                          {node.StopName}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs font-mono text-gray-500 max-w-xs truncate" title={node.Attributes}>
                          {node.Attributes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2">✅ Complete Node Analysis:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• This table shows <strong>ALL nodes</strong> for the selected route variant</li>
                      <li>• Generated from <strong>{analysisResult.stats.totalTrips.toLocaleString()} trips</strong> across all timetables</li>
                      <li>• Waiting time at each stop: <strong>30 seconds</strong></li>
                      <li>• Total nodes: <strong>{analysisResult.nodes.length.toLocaleString()}</strong></li>
                    </ul>
                  </div>
                  <div className="text-sm text-green-700">
                    {analysisResult.nodes.length > 0 && (
                      <>
                        <div className="mb-1">
                          <strong>Time Coverage:</strong>
                        </div>
                        <div>
                          • First departure: <span className="font-mono">{new Date(Math.min(...analysisResult.nodes.map(n => n.Timestamp)) * 1000).toISOString().substr(11, 8)}</span>
                        </div>
                        <div>
                          • Last arrival: <span className="font-mono">{new Date(Math.max(...analysisResult.nodes.map(n => n.Timestamp)) * 1000).toISOString().substr(11, 8)}</span>
                        </div>
                        <div>
                          • Time span: <strong>{Math.round((Math.max(...analysisResult.nodes.map(n => n.Timestamp)) - Math.min(...analysisResult.nodes.map(n => n.Timestamp))) / 3600 * 10) / 10} hours</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-sm text-green-700 border-t border-green-200 pt-2">
                  <li>• NodeId sequence is for display only - actual CSV export uses global numbering</li>
                  {analysisResult.isLoopRoute && (
                    <li>• 🔄 <strong>Loop route:</strong> Last segment uses enhanced wraparound distance calculation</li>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Navigation className="text-blue-600" />
          Enhanced Bus Route Analyzer
        </h1>

        {/* File Upload Section - 3 separate uploads */}
        <div className="mb-8 space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Data Upload</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* JSON Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <label className="cursor-pointer block">
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleJsonUpload}
                  className="hidden"
                  disabled={loading}
                />
                <div className="text-center">
                  <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-sm text-gray-600">Upload JSON Data</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Bus route structure & schedules
                  </p>
                  {jsonData && (
                    <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      ✓ {Object.keys(jsonData).length} routes loaded
                    </div>
                  )}
                </div>
              </label>
            </div>

            {/* Node Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <label className="cursor-pointer block">
                <input
                  ref={nodeFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleNodeUpload}
                  className="hidden"
                  disabled={loading}
                />
                <div className="text-center">
                  <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-sm text-gray-600">Upload Node Data (CSV)</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Should include TripId column
                  </p>
                  {nodes.length > 0 && (
                    <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      ✓ {nodes.length.toLocaleString()} nodes loaded
                    </div>
                  )}
                </div>
              </label>
            </div>

            {/* Link Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <label className="cursor-pointer block">
                <input
                  ref={linkFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleLinkUpload}
                  className="hidden"
                  disabled={loading}
                />
                <div className="text-center">
                  <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-sm text-gray-600">Upload Link Data (CSV)</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Network connectivity
                  </p>
                  {links.length > 0 && (
                    <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      ✓ {links.length.toLocaleString()} links loaded
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-blue-600">
              <RefreshCw className="animate-spin" size={16} />
              <span>Loading data...</span>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'routes', label: 'Routes', icon: Truck },
                { id: 'trips', label: 'Trips', icon: Clock },
                { id: 'network', label: 'Network', icon: MapPin },
                { id: 'temporal', label: 'Temporal', icon: TrendingUp },
                { id: 'json-analysis', label: 'JSON Analysis', icon: FileSpreadsheet }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'routes' && renderRoutes()}
          {activeTab === 'trips' && renderTrips()}
          {activeTab === 'network' && renderNetwork()}
          {activeTab === 'temporal' && renderTemporal()}
          {activeTab === 'json-analysis' && renderJsonAnalysis()}
        </div>
      </div>
    </div>
  );
};

export default BusRouteAnalyzer;