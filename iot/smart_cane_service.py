#!/usr/bin/env python3
"""
DRISHTI AI — Smart Cane Multi-Peripheral Daemon
Ported and Enhanced from ANVI (https://github.com/naimulRakib/ANVI)

Features:
1. Ultrasonic Distance Radar: HC-SR04 sensor triggers active buzzer when obstacle < 20cm.
2. Smart Vision Button: GPIO 17 push-button captures camera photo and HTTP POSTs to phone on :5000/upload.
3. Emergency Alarm Cancel Button: GPIO 27 push-button cancels phone fall sirens on :5000/stopalarm.
"""

import time
import threading
import requests
import cv2
import os

try:
    import RPi.GPIO as GPIO
except ImportError:
    print("[WARNING] RPi.GPIO not found. Running in mock/simulation mode.")
    GPIO = None

# Hardware GPIO Pin Configuration
BUTTON_CAM_PIN = 17       # Pin 11: Button for Camera Snap & Visual Describe
BUTTON_STOP_ALARM_PIN = 27 # Pin 13: Button to Cancel/Stop Emergency Alarm
TRIG_PIN = 23             # Pin 16: HC-SR04 Trigger
ECHO_PIN = 24             # Pin 18: HC-SR04 Echo
BUZZER_PIN = 21           # Pin 40: Active Obstacle Buzzer

DISTANCE_THRESHOLD_CM = 20.0
URL_CONFIG_FILE = "url.txt"

def get_server_url():
    """Reads target phone IP address from url.txt"""
    if os.path.exists(URL_CONFIG_FILE):
        with open(URL_CONFIG_FILE, "r") as f:
            ip = f.read().strip()
            if ip:
                return f"http://{ip}:5000"
    return "http://127.0.0.1:5000"

def setup_gpio():
    if not GPIO:
        return
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    # Buttons
    GPIO.setup(BUTTON_CAM_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.setup(BUTTON_STOP_ALARM_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    # Ultrasonic & Buzzer
    GPIO.setup(TRIG_PIN, GPIO.OUT)
    GPIO.setup(ECHO_PIN, GPIO.IN)
    GPIO.setup(BUZZER_PIN, GPIO.OUT)

    GPIO.output(TRIG_PIN, False)
    GPIO.output(BUZZER_PIN, False)

def measure_distance():
    if not GPIO:
        return 50.0

    GPIO.output(TRIG_PIN, True)
    time.sleep(0.00001)
    GPIO.output(TRIG_PIN, False)

    timeout = time.time() + 0.04
    pulse_start = time.time()
    while GPIO.input(ECHO_PIN) == 0:
        pulse_start = time.time()
        if pulse_start > timeout:
            return None

    pulse_end = time.time()
    while GPIO.input(ECHO_PIN) == 1:
        pulse_end = time.time()
        if pulse_end > timeout:
            return None

    duration = pulse_end - pulse_start
    distance = duration * 17150
    return round(distance, 2)

def ultrasonic_loop(stop_event):
    print("[DRISHTI IoT] Ultrasonic distance detection active (Threshold: 20cm)")
    while not stop_event.is_set():
        dist = measure_distance()
        if dist is not None:
            if dist < DISTANCE_THRESHOLD_CM:
                if GPIO:
                    GPIO.output(BUZZER_PIN, True)
                # print(f"[ALERT] Obstacle ahead: {dist} cm!")
            else:
                if GPIO:
                    GPIO.output(BUZZER_PIN, False)
        else:
            if GPIO:
                GPIO.output(BUZZER_PIN, False)
        time.sleep(0.1)

def camera_button_loop(stop_event):
    print("[DRISHTI IoT] Camera button listener active (GPIO 17)")
    while not stop_event.is_set():
        if GPIO and GPIO.input(BUTTON_CAM_PIN) == GPIO.LOW:
            print("[DRISHTI IoT] Camera button pressed! Capturing frame...")
            server_url = get_server_url() + "/upload"

            try:
                cap = cv2.VideoCapture(0)
                if cap.isOpened():
                    ret, frame = cap.read()
                    cap.release()
                    if ret:
                        success, buffer = cv2.imencode(".jpg", frame)
                        if success:
                            headers = {"Content-Type": "application/octet-stream"}
                            res = requests.post(server_url, data=buffer.tobytes(), headers=headers, timeout=5)
                            print(f"[DRISHTI IoT] Upload response: {res.text}")
            except Exception as e:
                print(f"[ERROR] Camera capture/upload failed: {e}")

            time.sleep(0.5)
            while GPIO and GPIO.input(BUTTON_CAM_PIN) == GPIO.LOW:
                time.sleep(0.1)
        time.sleep(0.05)

def stop_alarm_button_loop(stop_event):
    print("[DRISHTI IoT] Stop alarm button listener active (GPIO 27)")
    while not stop_event.is_set():
        if GPIO and GPIO.input(BUTTON_STOP_ALARM_PIN) == GPIO.LOW:
            print("[DRISHTI IoT] Emergency Stop Alarm button pressed! Sending request...")
            server_url = get_server_url() + "/stopalarm"
            try:
                res = requests.post(server_url, timeout=3)
                print(f"[DRISHTI IoT] Stop alarm response: {res.text}")
            except Exception as e:
                print(f"[ERROR] Stop alarm request failed: {e}")

            time.sleep(0.5)
            while GPIO and GPIO.input(BUTTON_STOP_ALARM_PIN) == GPIO.LOW:
                time.sleep(0.1)
        time.sleep(0.05)

def main():
    print("=" * 60)
    print("   DRISHTI AI — Smart Cane IoT Controller (ANVI Engine)   ")
    print("=" * 60)
    setup_gpio()

    stop_event = threading.Event()
    threads = [
        threading.Thread(target=ultrasonic_loop, args=(stop_event,), daemon=True),
        threading.Thread(target=camera_button_loop, args=(stop_event,), daemon=True),
        threading.Thread(target=stop_alarm_button_loop, args=(stop_event,), daemon=True),
    ]

    for t in threads:
        t.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down Smart Cane service...")
        stop_event.set()
    finally:
        if GPIO:
            GPIO.cleanup()
        print("GPIO cleaned up. Goodbye.")

if __name__ == "__main__":
    main()
