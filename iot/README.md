# 🦯 DRISHTI AI — Smart Cane IoT Companion

Integrated hardware firmware based on **[ANVI](https://github.com/naimulRakib/ANVI)**.  
Converts a standard white walking cane into an intelligent IoT cane equipped with ultrasonic obstacle detection, hands-free AI camera captioning, and remote false-alarm cancellation.

---

## 🛠️ Hardware Components

1. **Raspberry Pi** (Model 3B+, 4B, or Zero 2 W)
2. **Ultrasonic Sensor (HC-SR04)** — for distance & obstacle radar
3. **Active 5V Buzzer** — for acoustic obstacle proximity warning
4. **USB / CSI Camera Module** — for live visual scene questions & reading text
5. **2x Tactile Push-Buttons** — Camera snapshot & Alarm cancel
6. **Rechargeable 5V Power Bank**

---

## 🔌 GPIO Pin Wiring

| Component | Component Pin | Raspberry Pi Header Pin | BCM GPIO |
| :--- | :--- | :--- | :--- |
| **HC-SR04 (Ultrasonic)** | VCC | Pin 2 (5V Power) | — |
| | GND | Pin 6 (Ground) | — |
| | TRIG | Pin 16 | **GPIO 23** |
| | ECHO | Pin 18 | **GPIO 24** |
| **Buzzer** | Positive (+) | Pin 40 | **GPIO 21** |
| | Negative (-) | Pin 6 (Ground) | — |
| **Camera Button** | Terminal 1 | Pin 11 | **GPIO 17** |
| | Terminal 2 | Pin 9 (Ground) | — |
| **Stop Alarm Button** | Terminal 1 | Pin 13 | **GPIO 27** |
| | Terminal 2 | Pin 14 (Ground) | — |

---

## 🚀 Setup & Execution

### 1. Install Dependencies on Raspberry Pi
```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-opencv python3-rpi.gpio
pip3 install requests
```

### 2. Configure Phone IP Address
Create `url.txt` containing your phone's Wi-Fi IP address (shown in the Drishti app's Safety Panel):
```bash
echo "192.168.1.105" > url.txt
```

### 3. Run the Smart Cane Daemon
```bash
python3 smart_cane_service.py
```

### 4. How it Works:
- **Obstacle Alert**: When walking, the buzzer beeps automatically if any object is detected within **20 cm**.
- **Visual Question**: Pressing **Button 17** snaps a photo and streams it to Drishti on `:5000/upload` for optical character recognition and scene description.
- **Alarm Cancel**: In case of a false fall alarm on the phone, pressing **Button 27** immediately stops the phone siren over the local network on `:5000/stopalarm`.
