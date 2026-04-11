#!/bin/bash
# Test network connectivity to ZKTeco biometric device
# Usage: ./test_device_connection.sh

DEVICE_IP="192.168.97.201"
DEVICE_PORT=4370

echo "=== ZKTeco Device Connection Test ==="
echo ""

# 1. Ping test
echo "1. Testing ping to $DEVICE_IP..."
if ping -c 3 -W 2 "$DEVICE_IP" > /dev/null 2>&1; then
    echo "    Ping successful"
else
    echo "    Ping failed - device may be offline or blocking ICMP"
fi

# 2. Port test
echo ""
echo "2. Testing TCP port $DEVICE_PORT on $DEVICE_IP..."
if timeout 5 bash -c "echo > /dev/tcp/$DEVICE_IP/$DEVICE_PORT" 2>/dev/null; then
    echo "    Port $DEVICE_PORT is open"
else
    echo "    Port $DEVICE_PORT is closed or unreachable"
    echo "   Check: firewall rules, device network settings, cable connection"
fi

# 3. Python ZK library test
echo ""
echo "3. Testing ZK library connection..."
cd "$(dirname "$0")"
python3 test_zkteco_connection.py

echo ""
echo "=== Test Complete ==="
