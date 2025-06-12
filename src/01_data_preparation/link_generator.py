#!/usr/bin/env python3
"""
Create Link Table - Memory Optimized Version
Ghi trực tiếp ra file để tránh out of memory
"""

import pandas as pd
import numpy as np
from math import radians, cos, sin, asin, sqrt
import json
import sys
import os
from datetime import datetime
from collections import defaultdict
import time

# Configuration parameters
CONFIG = {
    # Walking parameters
    'WALKING_RADIUS': 400,          # meters - Bán kính tìm kiếm
    'MAX_WALK_WAIT_TIME': 3600,     # seconds - Tổng thời gian đi bộ + chờ (60 phút)
    'WALKING_SPEED': 1.2,           # m/s - Tốc độ đi bộ trung bình
    
    # Transfer parameters  
    'MAX_TRANSFER_TIME': 1800,      # seconds - Thời gian chờ chuyển tuyến (30 phút)
    'MIN_TRANSFER_TIME': 120,       # seconds - Thời gian tối thiểu để chuyển (2 phút)
}

def haversine_distance(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371000
    return c * r

def load_stop_info(json_file):
    print("Loading stop information...")
    stop_info = {}
    stop_routes = defaultdict(set)
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for route_key, route_data in data.items():
        route_id = route_data.get('getroutebyid', {}).get('RouteId', route_key)
        
        for variant in route_data.get('getvarsbyroute', []):
            variant_id = variant['RouteVarId']
            stops = route_data.get('getstopsbyvar', {}).get(str(variant_id), [])
            
            for stop in stops:
                stop_id = stop['StopId']
                if stop_id not in stop_info:
                    stop_info[stop_id] = {
                        'Lat': stop['Lat'],
                        'Lng': stop['Lng'],
                        'Name': stop['Name'],
                        'Routes': set()
                    }
                stop_info[stop_id]['Routes'].add(route_id)
                stop_routes[stop_id].add(route_id)
    
    for stop_id in stop_info:
        stop_info[stop_id]['Routes'] = list(stop_info[stop_id]['Routes'])
    
    print(f"Loaded {len(stop_info)} stops")
    return stop_info, stop_routes

def find_stops_within_radius(center_stop_id, stop_info, radius):
    center = stop_info[center_stop_id]
    nearby_stops = []
    
    for stop_id, stop in stop_info.items():
        if stop_id != center_stop_id:
            distance = haversine_distance(
                center['Lat'], center['Lng'],
                stop['Lat'], stop['Lng']
            )
            if distance <= radius:
                nearby_stops.append({
                    'StopId': stop_id,
                    'Distance': distance,
                    'Name': stop['Name']
                })
    
    return nearby_stops

def create_bus_links_to_file(node_df, output_file, start_link_id=1):
    """Create BUS links and write directly to file"""
    print("\nCreating BUS links...")
    
    # Write header
    with open(output_file, 'w') as f:
        f.write('link_id,from_node,to_node,duration,mode\n')
    
    link_id = start_link_id
    link_count = 0
    chunk_size = 10000
    chunk_links = []
    
    grouped = node_df.groupby(['RouteId', 'TripId'])
    
    for (route_id, trip_id), trip_nodes in grouped:
        trip_nodes = trip_nodes.sort_values('Timestamp')
        departures = trip_nodes[trip_nodes['Event'] == 'DEPARTURE'].reset_index()
        arrivals = trip_nodes[trip_nodes['Event'] == 'ARRIVAL'].reset_index()
        
        for i in range(len(departures)):
            dep_time = departures.iloc[i]['Timestamp']
            dep_node = departures.iloc[i]['NodeId']
            
            next_arrivals = arrivals[arrivals['Timestamp'] > dep_time]
            
            if not next_arrivals.empty:
                next_arrival = next_arrivals.iloc[0]
                time_diff = next_arrival['Timestamp'] - dep_time
                
                if time_diff < 1800:
                    chunk_links.append({
                        'link_id': link_id,
                        'from_node': dep_node,
                        'to_node': next_arrival['NodeId'],
                        'duration': time_diff,
                        'mode': 'bus'
                    })
                    link_id += 1
                    link_count += 1
                    
                    # Write chunk to file
                    if len(chunk_links) >= chunk_size:
                        df_chunk = pd.DataFrame(chunk_links)
                        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
                        chunk_links = []
    
    # Write remaining links
    if chunk_links:
        df_chunk = pd.DataFrame(chunk_links)
        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
    
    print(f"Created {link_count} BUS links")
    return link_id

def append_wait_links_to_file(node_df, output_file, start_link_id):
    """Create WAIT links and append to file"""
    print("\nCreating WAIT links...")
    
    link_id = start_link_id
    link_count = 0
    chunk_size = 50000
    chunk_links = []
    
    grouped = node_df.groupby(['StopId', 'RouteId'])
    total_groups = len(grouped)
    processed = 0
    
    for (stop_id, route_id), stop_nodes in grouped:
        processed += 1
        if processed % 1000 == 0:
            print(f"  Processing group {processed}/{total_groups}...")
            
        arrivals = stop_nodes[stop_nodes['Event'] == 'ARRIVAL'].sort_values('Timestamp')
        departures = stop_nodes[stop_nodes['Event'] == 'DEPARTURE'].sort_values('Timestamp')
        
        for _, arrival in arrivals.iterrows():
            arr_time = arrival['Timestamp']
            arr_node = arrival['NodeId']
            
            future_deps = departures[departures['Timestamp'] > arr_time]
            
            for _, departure in future_deps.iterrows():
                dep_time = departure['Timestamp']
                wait_time = dep_time - arr_time
                
                chunk_links.append({
                    'link_id': link_id,
                    'from_node': arr_node,
                    'to_node': departure['NodeId'],
                    'duration': wait_time,
                    'mode': 'wait'
                })
                link_id += 1
                link_count += 1
                
                if len(chunk_links) >= chunk_size:
                    df_chunk = pd.DataFrame(chunk_links)
                    df_chunk.to_csv(output_file, mode='a', header=False, index=False)
                    chunk_links = []
    
    if chunk_links:
        df_chunk = pd.DataFrame(chunk_links)
        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
    
    print(f"Created {link_count} WAIT links")
    return link_id

def append_transfer_links_to_file(node_df, output_file, start_link_id, max_transfer_time):
    """Create TRANSFER links and append to file"""
    print("\nCreating TRANSFER links...")
    
    link_id = start_link_id
    link_count = 0
    chunk_size = 50000
    chunk_links = []
    
    grouped = node_df.groupby('StopId')
    total_stops = len(grouped)
    processed = 0
    
    for stop_id, stop_nodes in grouped:
        processed += 1
        if processed % 500 == 0:
            print(f"  Processing stop {processed}/{total_stops}...")
            
        arrivals = stop_nodes[stop_nodes['Event'] == 'ARRIVAL'].sort_values('Timestamp')
        departures = stop_nodes[stop_nodes['Event'] == 'DEPARTURE'].sort_values('Timestamp')
        
        for _, arrival in arrivals.iterrows():
            arr_time = arrival['Timestamp']
            arr_node = arrival['NodeId']
            arr_route = arrival['RouteId']
            
            other_route_deps = departures[
                (departures['RouteId'] != arr_route) & 
                (departures['Timestamp'] > arr_time) &
                (departures['Timestamp'] - arr_time <= max_transfer_time)
            ]
            
            for _, departure in other_route_deps.iterrows():
                transfer_time = departure['Timestamp'] - arr_time
                
                if transfer_time >= CONFIG['MIN_TRANSFER_TIME']:
                    chunk_links.append({
                        'link_id': link_id,
                        'from_node': arr_node,
                        'to_node': departure['NodeId'],
                        'duration': transfer_time,
                        'mode': 'transfer'
                    })
                    link_id += 1
                    link_count += 1
                    
                    if len(chunk_links) >= chunk_size:
                        df_chunk = pd.DataFrame(chunk_links)
                        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
                        chunk_links = []
    
    if chunk_links:
        df_chunk = pd.DataFrame(chunk_links)
        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
    
    print(f"Created {link_count} TRANSFER links")
    return link_id

def append_walk_links_to_file(node_df, stop_info, stop_routes, output_file, start_link_id, 
                             walking_radius, max_walk_wait_time):
    """Create WALK links and append to file"""
    print("\nCreating WALK links...")
    print(f"Walking radius: {walking_radius}m, Max walk+wait time: {max_walk_wait_time}s")
    
    link_id = start_link_id
    link_count = 0
    chunk_size = 50000
    chunk_links = []
    
    arrivals = node_df[node_df['Event'] == 'ARRIVAL'].copy()
    print(f"Processing {len(arrivals)} arrival nodes...")
    
    departures_by_stop = {}
    all_departures = node_df[node_df['Event'] == 'DEPARTURE']
    for stop_id in all_departures['StopId'].unique():
        departures_by_stop[stop_id] = all_departures[
            all_departures['StopId'] == stop_id
        ].sort_values('Timestamp')
    
    processed = 0
    for idx, arrival in arrivals.iterrows():
        processed += 1
        if processed % 1000 == 0:
            print(f"  Processed {processed}/{len(arrivals)} arrivals...")
        
        arr_stop = arrival['StopId']
        arr_time = arrival['Timestamp']
        arr_node = arrival['NodeId']
        
        nearby_stops = find_stops_within_radius(arr_stop, stop_info, walking_radius)
        
        for nearby in nearby_stops:
            nearby_stop_id = nearby['StopId']
            walk_distance = nearby['Distance']
            walk_time = walk_distance / CONFIG['WALKING_SPEED']
            
            arr_routes = stop_routes[arr_stop]
            nearby_routes = stop_routes[nearby_stop_id]
            
            if arr_routes & nearby_routes:
                continue
            
            if nearby_stop_id not in departures_by_stop:
                continue
                
            nearby_deps = departures_by_stop[nearby_stop_id]
            
            earliest_dep_time = arr_time + walk_time
            valid_deps = nearby_deps[
                (nearby_deps['Timestamp'] >= earliest_dep_time) &
                (nearby_deps['Timestamp'] - arr_time <= max_walk_wait_time)
            ]
            
            for _, departure in valid_deps.iterrows():
                total_time = departure['Timestamp'] - arr_time
                
                chunk_links.append({
                    'link_id': link_id,
                    'from_node': arr_node,
                    'to_node': departure['NodeId'],
                    'duration': total_time,
                    'mode': 'walk'
                })
                link_id += 1
                link_count += 1
                
                if len(chunk_links) >= chunk_size:
                    df_chunk = pd.DataFrame(chunk_links)
                    df_chunk.to_csv(output_file, mode='a', header=False, index=False)
                    chunk_links = []
    
    if chunk_links:
        df_chunk = pd.DataFrame(chunk_links)
        df_chunk.to_csv(output_file, mode='a', header=False, index=False)
    
    print(f"Created {link_count} WALK links")
    return link_id

def create_link_table_memory_optimized(node_csv, bus_json, output_csv, config=None):
    """Main function - memory optimized version"""
    print(f"\n=== CREATE LINK TABLE (MEMORY OPTIMIZED) ===")
    print(f"Node table: {node_csv}")
    print(f"Bus data: {bus_json}")
    print(f"Output: {output_csv}")
    print("=" * 50)
    
    if config:
        CONFIG.update(config)
    
    print("\nConfiguration:")
    for key, value in CONFIG.items():
        print(f"  {key}: {value}")
    
    # Load data
    print("\nLoading node table...")
    node_df = pd.read_csv(node_csv, dtype={
        'NodeId': 'int32',
        'RouteId': 'int32', 
        'StopId': 'int32',
        'Timestamp': 'int32',
        'TripId': 'int32'
    })
    print(f"Loaded {len(node_df)} nodes")
    
    stop_info, stop_routes = load_stop_info(bus_json)
    
    # Track total time
    total_start = time.time()
    
    # Create each type of link and write directly to file
    start_time = time.time()
    next_link_id = create_bus_links_to_file(node_df, output_csv, 1)
    print(f"  Time: {time.time() - start_time:.1f}s")
    
    start_time = time.time()
    next_link_id = append_wait_links_to_file(node_df, output_csv, next_link_id)
    print(f"  Time: {time.time() - start_time:.1f}s")
    
    start_time = time.time()
    next_link_id = append_transfer_links_to_file(node_df, output_csv, next_link_id, CONFIG['MAX_TRANSFER_TIME'])
    print(f"  Time: {time.time() - start_time:.1f}s")
    
    start_time = time.time()
    final_link_id = append_walk_links_to_file(
        node_df, stop_info, stop_routes, output_csv, next_link_id,
        CONFIG['WALKING_RADIUS'], CONFIG['MAX_WALK_WAIT_TIME']
    )
    print(f"  Time: {time.time() - start_time:.1f}s")
    
    total_links = final_link_id - 1
    
    print("\n" + "=" * 50)
    print("SUMMARY:")
    print(f"Total links created: {total_links:,}")
    print(f"Total time: {time.time() - total_start:.1f}s")
    print(f"\nOutput saved to: {output_csv}")
    print(f"File size: {os.path.getsize(output_csv) / 1024 / 1024:.1f} MB")
    
    # Count by mode (sampling for speed)
    print("\nCounting links by mode (sampling)...")
    sample_df = pd.read_csv(output_csv, nrows=100000)
    mode_ratios = sample_df['mode'].value_counts(normalize=True)
    
    print("\nEstimated breakdown by mode:")
    for mode, ratio in mode_ratios.items():
        estimated_count = int(total_links * ratio)
        print(f"  {mode:8} : ~{estimated_count:10,} ({ratio*100:5.1f}%)")

def main():
    if len(sys.argv) < 4:
        print("Usage: python create_link_table_optimized.py <node_table.csv> <bus_data.json> <output_link_table.csv>")
        sys.exit(1)
    
    node_csv = sys.argv[1]
    bus_json = sys.argv[2]
    output_csv = sys.argv[3]
    
    try:
        create_link_table_memory_optimized(node_csv, bus_json, output_csv)
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()