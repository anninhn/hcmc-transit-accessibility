#!/usr/bin/env python3
"""
Bus Node Table Generator
Tạo bảng nodes cho NetworkX từ dữ liệu JSON tuyến xe buýt
"""

import json
import csv
import math
from datetime import datetime
import sys
import os
from typing import List, Dict, Tuple, Optional

# ===== CÁC THAM SỐ CÓ THỂ ĐIỀU CHỈNH =====
WAITING_TIME = 30  # Thời gian chờ tại mỗi trạm (giây) - mặc định

# Thời gian chờ theo loại bus (ưu tiên nếu có)
WAITING_TIME_BY_TYPE = {
    # "Học sinh - Có trợ giá": 20, 
    # "Không trợ giá - Du Lịch": 30, 
    # "Phổ thông - Có trợ giá": 30
    # "Phổ thông - Có trợ giá - Buýt nhanh": 30
    # "Phổ thông - Không trợ giá": 30,
}

ROUTE_LIMIT = None  # None = xử lý tất cả, hoặc số nguyên để giới hạn số tuyến
OUTPUT_ENCODING = 'utf-8'  # Encoding cho file output
SKIP_INVALID_TRIPS = True  # True = bỏ qua trips lỗi, False = dừng khi gặp lỗi
MIN_AVG_SPEED = 1.0  # Tốc độ tối thiểu (m/s) ~ 3.6 km/h

# ==========================================

def parse_time_to_seconds(time_str: str, is_next_day: bool = False) -> Optional[int]:
    """
    Chuyển đổi thời gian từ HH:MM sang số giây từ 00:00
    
    Args:
        time_str: Thời gian dạng "HH:MM"
        is_next_day: True nếu thời gian thuộc ngày hôm sau
        
    Returns:
        Số giây từ 00:00 hoặc None nếu không hợp lệ
    """
    if not time_str or not isinstance(time_str, str):
        return None
    
    try:
        time_str = time_str.strip()
        parts = time_str.split(':')
        if len(parts) != 2:
            return None
            
        hours = int(parts[0])
        minutes = int(parts[1])
        
        if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
            return None
        
        seconds = hours * 3600 + minutes * 60
        
        # Nếu là ngày hôm sau, cộng thêm 24 giờ
        if is_next_day:
            seconds += 24 * 3600
            
        return seconds
    except:
        return None

def seconds_to_time(seconds: int) -> str:
    """
    Chuyển đổi số giây sang định dạng HH:MM:SS
    Xử lý cả trường hợp qua ngày (> 24 giờ)
    """
    # Xử lý số giây âm hoặc quá lớn
    if seconds < 0:
        return "00:00:00"
    
    days = seconds // (24 * 3600)
    remaining_seconds = seconds % (24 * 3600)
    
    hours = remaining_seconds // 3600
    minutes = (remaining_seconds % 3600) // 60
    secs = remaining_seconds % 60
    
    if days > 0:
        # Hiển thị ngày tiếp theo
        return f"{hours:02d}:{minutes:02d}:{secs:02d}+{days}d"
    else:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Tính khoảng cách giữa 2 điểm trên Trái Đất (meters)
    """
    R = 6371000  # Bán kính Trái Đất (meters)
    
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    
    a = (math.sin(dlat/2)**2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dlng/2)**2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def find_nearest_point_on_path(stop_lat: float, stop_lng: float, 
                               path_lats: List[float], path_lngs: List[float]) -> Dict:
    """
    Tìm điểm gần nhất trên path với một trạm
    """
    min_distance = float('inf')
    nearest_index = 0
    
    for i in range(len(path_lats)):
        distance = haversine_distance(stop_lat, stop_lng, path_lats[i], path_lngs[i])
        if distance < min_distance:
            min_distance = distance
            nearest_index = i
    
    return {
        'index': nearest_index,
        'distance': min_distance,
        'lat': path_lats[nearest_index],
        'lng': path_lngs[nearest_index]
    }

def calculate_real_distance(stop1: Dict, stop2: Dict, 
                          path_lats: List[float], path_lngs: List[float]) -> float:
    """
    Tính khoảng cách thực tế giữa 2 trạm dọc theo path
    """
    nearest1 = find_nearest_point_on_path(stop1['Lat'], stop1['Lng'], path_lats, path_lngs)
    nearest2 = find_nearest_point_on_path(stop2['Lat'], stop2['Lng'], path_lats, path_lngs)
    
    start_idx = min(nearest1['index'], nearest2['index'])
    end_idx = max(nearest1['index'], nearest2['index'])
    
    total_distance = 0.0
    for i in range(start_idx, end_idx):
        total_distance += haversine_distance(
            path_lats[i], path_lngs[i],
            path_lats[i + 1], path_lngs[i + 1]
        )
    
    return total_distance

def process_route_variant(route_data: Dict, variant_id: int, 
                         route_id: int, route_no: str,
                         global_node_id: int) -> Tuple[List[Dict], int]:
    """
    Xử lý một chiều (variant) của tuyến
    
    Returns:
        (danh_sách_nodes, node_id_tiếp_theo)
    """
    nodes = []
    
    # Lấy loại bus để xác định thời gian chờ
    bus_type = route_data.get('getroutebyid', {}).get('Type', 'Unknown')
    waiting_time = WAITING_TIME_BY_TYPE.get(bus_type, WAITING_TIME)
    
    # Lấy thông tin variant
    variant = None
    for v in route_data.get('getvarsbyroute', []):
        if v['RouteVarId'] == variant_id:
            variant = v
            break
    
    if not variant:
        print(f"  ! Không tìm thấy variant {variant_id}")
        return nodes, global_node_id
    
    # Lấy stops và paths
    stops = route_data.get('getstopsbyvar', {}).get(str(variant_id), [])
    paths = route_data.get('getpathsbyvar', {}).get(str(variant_id), {})
    
    if not stops or not paths:
        print(f"  ! Thiếu stops hoặc paths cho variant {variant_id}")
        return nodes, global_node_id
    
    path_lats = paths.get('lat', [])
    path_lngs = paths.get('lng', [])
    
    if not path_lats or not path_lngs:
        print(f"  ! Paths không có tọa độ cho variant {variant_id}")
        return nodes, global_node_id
    
    # Kiểm tra số lượng stops
    if len(stops) < 2:
        print(f"  ! Variant {variant_id} chỉ có {len(stops)} stops, skip!")
        return nodes, global_node_id
    
    # Kiểm tra path data
    if len(path_lats) < 2 or len(path_lngs) < 2:
        print(f"  ! Variant {variant_id} không đủ path data (cần >=2 điểm), skip!")
        return nodes, global_node_id
    
    # Kiểm tra loop route (tuyến vòng tròn)
    is_loop_route = False
    if len(stops) == 2:
        # Kiểm tra 2 stops có cùng tọa độ không
        if (stops[0]['Lat'] == stops[1]['Lat'] and 
            stops[0]['Lng'] == stops[1]['Lng']):
            is_loop_route = True
            print(f"  ! Variant {variant_id} là tuyến vòng tròn (loop route)")
    
    # Tính khoảng cách
    if is_loop_route:
        # Với loop route, tính tổng chiều dài của path
        total_distance = 0.0
        for i in range(len(path_lats) - 1):
            total_distance += haversine_distance(
                path_lats[i], path_lngs[i],
                path_lats[i + 1], path_lngs[i + 1]
            )
        print(f"    Loop distance (từ path): {total_distance:.0f}m")
        
        # Fake stop distances cho logic phía sau
        stop_distances = [total_distance]  # 1 khoảng cách duy nhất
    else:
        # Tính khoảng cách thông thường giữa các trạm
        stop_distances = []
        for i in range(len(stops) - 1):
            distance = calculate_real_distance(stops[i], stops[i + 1], path_lats, path_lngs)
            stop_distances.append(distance)
        
        total_distance = sum(stop_distances)
    
    # Kiểm tra total_distance
    if total_distance <= 0:
        print(f"  ! Variant {variant_id} có total_distance = {total_distance}m")
        print(f"    Stops: {[(s['Name'], s['Lat'], s['Lng']) for s in stops[:3]]}")
        print(f"    Path points: {len(path_lats)}")
        if not is_loop_route:
            print(f"    Stop distances: {stop_distances[:5]}")
        print(f"    => SKIP variant này!")
        return nodes, global_node_id
    
    # Lấy tất cả timetables cho variant này
    timetables = [t for t in route_data.get('gettimetablebyroute', []) 
                  if t['RouteVarId'] == variant_id]
    
    print(f"  - Variant {variant_id}: {variant['RouteVarName']}")
    print(f"    Stops: {len(stops)}, Distance: {total_distance:.0f}m, Waiting: {waiting_time}s/stop")
    print(f"    Bus type: {bus_type}, Timetables: {len(timetables)}")
    if is_loop_route:
        print(f"    Route type: Loop (vòng tròn)")
    
    # Xử lý từng timetable
    for timetable in timetables:
        trips = route_data.get('gettripsbytimetable', {}).get(str(timetable['TimeTableId']), [])
        
        if not trips:
            continue
        
        valid_trips = 0
        skipped_trips = 0
        
        # Xử lý từng trip
        for trip in trips:
            # Parse time ban đầu
            start_seconds = parse_time_to_seconds(trip.get('StartTime'))
            end_seconds = parse_time_to_seconds(trip.get('EndTime'))
            
            # Skip invalid trips
            if start_seconds is None or end_seconds is None:
                if not SKIP_INVALID_TRIPS:
                    raise ValueError(f"Invalid time in trip {trip['TripId']}: "
                                   f"Start={trip.get('StartTime')}, End={trip.get('EndTime')}")
                skipped_trips += 1
                continue
            
            # Kiểm tra chuyến qua đêm (overnight trip)
            is_overnight = False
            if end_seconds <= start_seconds:
                # Có thể là chuyến qua đêm
                # Ví dụ: 21:00 -> 00:00 hoặc 22:30 -> 01:30
                end_seconds_next_day = parse_time_to_seconds(trip.get('EndTime'), is_next_day=True)
                if end_seconds_next_day:
                    end_seconds = end_seconds_next_day
                    is_overnight = True
                    print(f"      Trip {trip['TripId']}: Overnight {trip.get('StartTime')} -> {trip.get('EndTime')} (next day)")
            
            # Tính thời gian di chuyển
            total_waiting_time = (len(stops) - 1) * waiting_time
            traveling_time = end_seconds - start_seconds - total_waiting_time
            
            if traveling_time <= 0:
                if not SKIP_INVALID_TRIPS:
                    raise ValueError(f"Invalid traveling time for trip {trip['TripId']}: {traveling_time}s")
                skipped_trips += 1
                print(f"      ! Skip trip {trip['TripId']}: traveling_time={traveling_time}s "
                      f"(total_time={end_seconds-start_seconds}s, waiting={total_waiting_time}s)")
                continue
            
            avg_speed = total_distance / traveling_time  # m/s
            
            # Kiểm tra tốc độ hợp lý
            if avg_speed < MIN_AVG_SPEED:
                skipped_trips += 1
                print(f"      ! Skip trip {trip['TripId']}: avg_speed={avg_speed:.2f}m/s "
                      f"(< {MIN_AVG_SPEED}m/s)")
                continue
            
            # Kiểm tra tốc độ quá cao (> 80km/h)
            if avg_speed > 22.2:  # 80 km/h
                skipped_trips += 1
                print(f"      ! Skip trip {trip['TripId']}: avg_speed={avg_speed*3.6:.1f}km/h (> 80km/h)")
                continue
            
            valid_trips += 1
            
            # Tạo nodes cho trip
            current_time = start_seconds
            
            # Xử lý đặc biệt cho loop route
            if is_loop_route:
                # DEPARTURE từ điểm đầu
                nodes.append({
                    'NodeId': global_node_id,
                    'RouteId': route_id,
                    'RouteNo': route_no,
                    'RouteVarId': variant_id,
                    'TripId': trip['TripId'],
                    'StopId': stops[0]['StopId'],
                    'Timestamp': round(current_time),
                    'Event': 'DEPARTURE',
                    'Time': seconds_to_time(round(current_time)),
                    'StopName': stops[0]['Name'],
                    'Attributes': json.dumps([route_id, stops[0]['StopId'], round(current_time), 'DEPARTURE'])
                })
                global_node_id += 1
                
                # ARRIVAL tại điểm cuối (cùng vị trí nhưng sau 1 vòng)
                current_time = end_seconds  # Dùng end time trực tiếp
                nodes.append({
                    'NodeId': global_node_id,
                    'RouteId': route_id,
                    'RouteNo': route_no,
                    'RouteVarId': variant_id,
                    'TripId': trip['TripId'],
                    'StopId': stops[1]['StopId'],
                    'Timestamp': round(current_time),
                    'Event': 'ARRIVAL',
                    'Time': seconds_to_time(round(current_time)),
                    'StopName': stops[1]['Name'],
                    'Attributes': json.dumps([route_id, stops[1]['StopId'], round(current_time), 'ARRIVAL'])
                })
                global_node_id += 1
            else:
                # Xử lý thông thường cho non-loop routes
                for i, stop in enumerate(stops):
                    if i == 0:
                        # Trạm đầu: chỉ có DEPARTURE
                        nodes.append({
                            'NodeId': global_node_id,
                            'RouteId': route_id,
                            'RouteNo': route_no,
                            'RouteVarId': variant_id,
                            'TripId': trip['TripId'],
                            'StopId': stop['StopId'],
                            'Timestamp': round(current_time),
                            'Event': 'DEPARTURE',
                            'Time': seconds_to_time(round(current_time)),
                            'StopName': stop['Name'],
                            'Attributes': json.dumps([route_id, stop['StopId'], round(current_time), 'DEPARTURE'])
                        })
                        global_node_id += 1
                    else:
                        # Tính thời gian đến trạm
                        distance_from_previous = stop_distances[i - 1]
                        travel_time = distance_from_previous / avg_speed
                        current_time += travel_time
                        
                        # ARRIVAL event
                        nodes.append({
                            'NodeId': global_node_id,
                            'RouteId': route_id,
                            'RouteNo': route_no,
                            'RouteVarId': variant_id,
                            'TripId': trip['TripId'],
                            'StopId': stop['StopId'],
                            'Timestamp': round(current_time),
                            'Event': 'ARRIVAL',
                            'Time': seconds_to_time(round(current_time)),
                            'StopName': stop['Name'],
                            'Attributes': json.dumps([route_id, stop['StopId'], round(current_time), 'ARRIVAL'])
                        })
                        global_node_id += 1
                        
                        # DEPARTURE event (không cho trạm cuối)
                        if i < len(stops) - 1:
                            current_time += waiting_time
                            nodes.append({
                                'NodeId': global_node_id,
                                'RouteId': route_id,
                                'RouteNo': route_no,
                                'RouteVarId': variant_id,
                                'TripId': trip['TripId'],
                                'StopId': stop['StopId'],
                                'Timestamp': round(current_time),
                                'Event': 'DEPARTURE',
                                'Time': seconds_to_time(round(current_time)),
                                'StopName': stop['Name'],
                                'Attributes': json.dumps([route_id, stop['StopId'], round(current_time), 'DEPARTURE'])
                            })
                            global_node_id += 1
        
        if trips:
            print(f"    TimeTable {timetable['TimeTableId']}: {valid_trips} valid, {skipped_trips} skipped / {len(trips)} trips")
    
    return nodes, global_node_id

def process_all_routes(json_file: str, output_csv: str):
    """
    Xử lý tất cả các tuyến từ file JSON và xuất ra CSV
    """
    print(f"\n=== BUS NODE TABLE GENERATOR ===")
    print(f"Input: {json_file}")
    print(f"Output: {output_csv}")
    print(f"Waiting time: {WAITING_TIME}s")
    print(f"Route limit: {ROUTE_LIMIT or 'All'}")
    print(f"Skip invalid trips: {SKIP_INVALID_TRIPS}")
    print("=" * 40)
    
    # Load JSON
    print("\nĐang đọc file JSON...")
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    all_route_keys = list(data.keys())
    route_keys = all_route_keys[:ROUTE_LIMIT] if ROUTE_LIMIT else all_route_keys
    
    print(f"Tổng số tuyến trong file: {len(all_route_keys)}")
    print(f"Sẽ xử lý: {len(route_keys)} tuyến")
    
    # Process routes
    all_nodes = []
    global_node_id = 1
    
    for idx, route_key in enumerate(route_keys, 1):
        route_data = data[route_key]
        
        # Lấy RouteId và RouteNo
        route_id = route_data.get('getroutebyid', {}).get('RouteId', int(route_key))
        route_no = route_data.get('getroutebyid', {}).get('RouteNo', route_key)
        
        print(f"\n[{idx}/{len(route_keys)}] Xử lý tuyến {route_no} (ID: {route_id})...")
        
        # Xử lý từng variant
        variants = route_data.get('getvarsbyroute', [])
        for variant in variants:
            variant_id = variant['RouteVarId']
            variant_nodes, global_node_id = process_route_variant(
                route_data, variant_id, route_id, route_no, global_node_id
            )
            all_nodes.extend(variant_nodes)
        
        print(f"  => Đã tạo {len(variant_nodes)} nodes")
    
    # Write CSV
    print(f"\nĐang ghi file CSV...")
    with open(output_csv, 'w', newline='', encoding=OUTPUT_ENCODING) as f:
        writer = csv.DictWriter(f, fieldnames=[
            'NodeId', 'RouteId', 'RouteNo', 'RouteVarId', 'TripId', 
            'StopId', 'Timestamp', 'Event', 'Time', 'StopName', 'Attributes'
        ])
        writer.writeheader()
        writer.writerows(all_nodes)
    
    # Summary
    print("\n" + "=" * 40)
    print(f"✅ HOÀN THÀNH!")
    print(f"Tổng số nodes: {len(all_nodes):,}")
    print(f"File output: {output_csv}")
    print(f"Kích thước: {os.path.getsize(output_csv) / 1024 / 1024:.2f} MB")
    print("=" * 40)

def main():
    """
    Main function
    """
    # Kiểm tra arguments
    if len(sys.argv) < 2:
        print("Usage: python bus_node_generator.py <input_json> [output_csv]")
        print("\nExample:")
        print("  python bus_node_generator.py bus_data.json")
        print("  python bus_node_generator.py bus_data.json node_table.csv")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'node_table.csv'
    
    # Kiểm tra file input
    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' không tồn tại!")
        sys.exit(1)
    
    try:
        process_all_routes(input_file, output_file)
    except Exception as e:
        print(f"\n❌ LỖI: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()