# ZKTeco Biometric Device Setup Guide

## Overview

Your KASMS system supports **two modes** for receiving attendance data from ZKTeco devices:

### Mode 1: Push (ADMS Protocol) - RECOMMENDED
- The device **pushes** attendance data to your server in real-time
- More reliable, immediate attendance recording
- No polling/celery needed for basic operation

### Mode 2: Pull (Server Polls Device)
- Your server **polls** the device periodically via Celery tasks
- Requires network connectivity from server → device
- Uses the `pyzk` library

---

## Mode 1: Configure Push (ADMS Protocol)

### Step 1: Ensure the device can reach your server

The ZKTeco device must be able to reach your Django server at:
```
http://YOUR_SERVER_IP:PORT/api/biometric/push/
```

**On your Ubuntu server**, ensure the port is accessible:
```bash
# If running via Gunicorn on port 8000
sudo ufw allow 8000/tcp

# If behind Nginx (standard HTTP/HTTPS)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### Step 2: Register the Device in KASMS

1. Log in to KASMS as admin
2. Navigate to **Biometric Devices** (or use API: `POST /api/biometric-devices/`)
3. Create a device with these fields:
   - `name`: e.g., "Main Entrance Reader"
   - `device_type`: `zkteco_f22` (or your model)
   - `ip_address`: The device's IP (e.g., `192.168.97.201`)
   - `port`: `4370`
   - `school`: Select your school
   - `status`: `active`
   - `is_active`: `true`

### Step 3: Configure the ZKTeco Device

On the **physical device** menu:

1. Go to **Communication** → **ADMS/Cloud Server Settings**
   (Menu names may vary by firmware: "Cloud Server", "Push Server", "ADMS")

2. Configure:
   - **Server Address**: `YOUR_SERVER_IP` or domain (e.g., `192.168.1.100` or `kasms.example.com`)
   - **Port**: Your Django server port (e.g., `8000` or `80` if behind Nginx)
   - **Protocol**: `HTTP` (not HTTPS unless you have SSL configured)
   - **Path/URL**: `/api/biometric/push/`

3. Set the **upload interval**:
   - **Attendance Upload**: `Real-time` or `1 minute`
   - **User Upload**: Enable (so device sends user changes)

4. **Save** and the device should show as "Connected" or "Online"

### Step 4: Map Device Users to Students

The device identifies users by their **User ID** (the number entered on the device).
This must match the student's **SVC Number** in KASMS.

**Option A: Auto-map** (recommended)
```bash
# Use the API endpoint to auto-map device users to students
curl -X POST http://YOUR_SERVER/api/biometric-devices/DEVICE_ID/auto_map_users/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Option B: Manual mapping**
```bash
# Create individual mappings
curl -X POST http://YOUR_SERVER/api/biometric-user-mappings/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device": "DEVICE_UUID",
    "device_user_id": "001",
    "student": STUDENT_ID,
    "school": SCHOOL_UUID
  }'
```

### Step 5: Test the Push

Have a student scan their fingerprint/card on the device.
Then check:

```bash
# Check biometric records
curl http://YOUR_SERVER/api/biometric-records/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check the device sync status
curl http://YOUR_SERVER/api/biometric-devices/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Or check the Django logs:
```bash
tail -f logs/django.log | grep biometric
```

---

## Mode 2: Configure Pull (Server Polls Device)

### Step 1: Ensure Network Connectivity

Your Ubuntu server must reach the device on port 4370:

```bash
# Test connectivity
ping 192.168.97.201
nc -zv 192.168.97.201 4370

# Or use the test script
chmod +x test_device_connection.sh
./test_device_connection.sh
```

### Step 2: Verify pyzk Library

```bash
cd /home/eric/Documents/projects/KASMS
source venv/bin/activate
python test_zkteco_connection.py
```

Expected output:
```
Firmware: Ver 6.4.20 (Build 123)
Serial: XXXXXXXXXXX
Device Name: ZKTeco F22
Registered Users: 150
Attendance Logs: 5000
```

### Step 3: Configure Celery Beat for Periodic Sync

Add to your Celery beat schedule (usually in `kasms/celery.py` or `celerybeat-schedule`):

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    'sync-biometric-devices-every-5-minutes': {
        'task': 'core.tasks.sync_all_devices',
        'schedule': 300.0,  # every 5 minutes
    },
    'process-pending-biometric-records': {
        'task': 'core.tasks.process_pending_records',
        'schedule': 60.0,  # every minute
    },
}
```

### Step 4: Start Celery Workers

```bash
# In one terminal (worker)
cd /home/eric/Documents/projects/KASMS
source venv/bin/activate
celery -A kasms worker --loglevel=info --concurrency=4

# In another terminal (beat scheduler)
celery -A kasms beat --loglevel=info
```

### Step 5: Manual Sync Trigger

Via API:
```bash
# Trigger sync for a specific device
curl -X POST http://YOUR_SERVER/api/biometric-devices/DEVICE_ID/trigger_sync/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Or sync now (synchronous)
curl -X POST http://YOUR_SERVER/api/biometric-devices/DEVICE_ID/sync_now/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### Device not pushing data

1. **Check device network**: `ping YOUR_SERVER_IP` from the device (if it has a network test)
2. **Check firewall**: `sudo ufw status` on Ubuntu
3. **Check Django logs**: Look for push requests
4. **Check device ADMS settings**: Verify server URL/port/path
5. **Test endpoint manually**:
   ```bash
   curl -X POST http://YOUR_SERVER/api/biometric/push/ \
     -d "table=ATTLOG&stamp=2024-01-01 00:00:00"
   # Should return "OK"
   ```

### Pull sync fails

1. **Check pyzk**: `pip show pyzk` (should be installed)
2. **Test connection**: `python test_zkteco_connection.py`
3. **Check device is not in "locked" state**: Some devices need the menu unlocked
4. **Try disabling/enabling device**: Via device menu → Communication → Disable, then Enable

### Student not found on scan

1. **Check SVC Number matches device User ID**: They must be identical
2. **Check student has active membership** at the school
3. **Check biometric user mappings**: `GET /api/biometric-user-mappings/`
4. **Run auto-map**: `POST /api/biometric-devices/DEVICE_ID/auto_map_users/`

### Attendance not appearing in session

1. **Check AttendanceSession exists**: The session must be "active" and cover the scan time
2. **Check scan_time timezone**: Ensure device time matches server timezone (Africa/Nairobi)
3. **Check session time window**: The scan must fall within `scheduled_start` to `scheduled_end`

---

## Architecture Diagram

```
┌──────────────────┐         PUSH (ADMS)          ┌──────────────────┐
│  ZKTeco Device   │ ──────────────────────────►  │  Django Server   │
│  (Student scans)  │   POST /api/biometric/push/  │  (Ubuntu Linux)  │
└──────────────────┘                              └────────┬─────────┘
                                                           │
                                              ┌────────────▼──────────┐
                                              │  BiometricRecord      │
                                              │  ↓ auto-match         │
                                              │  AttendanceSession    │
                                              │  ↓ create             │
                                              │  SessionAttendance    │
                                              └───────────────────────┘

         OR (Pull Mode)

┌──────────────────┐         POLL (pyzk)          ┌──────────────────┐
│  Django Server   │ ──────────────────────────►  │  ZKTeco Device   │
│  Celery Worker    │   TCP:4370, get_attendance() │  (Student scans)  │
└────────┬─────────┘                              └──────────────────┘
         │
         ▼
  BiometricRecord → AttendanceSession → SessionAttendance
```

---

## Device Configuration Checklist

- [ ] Device registered in KASMS (BiometricDevice model)
- [ ] Device IP and port correct
- [ ] ADMS/Push server configured on device
- [ ] Server URL accessible from device network
- [ ] Student SVC Numbers match device User IDs
- [ ] BiometricUserMapping entries created
- [ ] AttendanceSession active during scan times
- [ ] Celery worker running (if using pull mode)
- [ ] Firewall allows device → server communication
