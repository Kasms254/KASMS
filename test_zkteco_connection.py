from zk import ZK

DEVICE_IP = '192.168.1.201'
DEVICE_PORT = 4370

zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=5)
conn = None

try:
    conn = zk.connect()
    conn.disable_device()  

   
    print(f'Firmware: {conn.get_firmware_version()}')
    print(f'Serial: {conn.get_serialnumber()}')
    print(f'Device Name: {conn.get_device_name()}')

 
    users = conn.get_users()
    print(f'\nRegistered Users: {len(users)}')
    for user in users[:5]:  
        print(f'  UID={user.uid}, ID={user.user_id}, Name={user.name}')


    attendance = conn.get_attendance()
    print(f'\nAttendance Logs: {len(attendance)}')
    for log in attendance[-5:]: 
        print(f'  UserID={log.user_id}, Time={log.timestamp}, Status={log.status}')

    conn.enable_device()
except Exception as e:
    print(f'Connection failed: {e}')
finally:
    if conn:
        conn.disconnect()