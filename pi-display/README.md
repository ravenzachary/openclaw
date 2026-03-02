# Pi Display for OpenClaw

Shows the most recent OpenClaw chat message on a small screen. Designed for a 3.5" Raspberry Pi touchscreen but adapts to any display size.

Green (#00b140) text on black background with an avatar info box in the top-left corner. Message text wraps around the info box. Auto-refreshes every 2 seconds.

## Setup (Raspberry Pi 5 / Ubuntu)

```bash
sudo apt install python3-pygame
# or:
pip install -r requirements.txt
```

Place your avatar as `avatar.png` in the `pi-display/` folder (next to `display.py`).

### Emoji support (optional)

Install a monochrome vector emoji font so emojis render inline:

```bash
# Option A: system package (if available)
sudo apt install fonts-noto-extra

# Option B: download directly
mkdir -p ~/.local/share/fonts
wget -O ~/.local/share/fonts/NotoEmoji-Regular.ttf \
  https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/fonts/NotoEmoji-Regular.ttf
fc-cache -f
```

Color bitmap emoji fonts (e.g. Noto Color Emoji) are not supported — they render at native bitmap size and cannot be scaled by SDL_ttf.

## Running

```bash
# Fullscreen (default) — fills the entire screen, no title bar
python3 display.py

# Windowed (for testing/development)
python3 display.py --windowed

# Custom font size
python3 display.py --font-size 18

# Watch a specific agent
python3 display.py --agent-id main

# Custom window size (only applies with --windowed)
python3 display.py --windowed --width 320 --height 480
```

## Exiting

- **Keyboard:** press `Q` or `Escape`
- **Touchscreen:** triple-tap the top-left corner of the screen (within 1.5 seconds)
- **Remote (SSH):** `pkill -f display.py`

## Screensaver

After 60 seconds of no input, the display enters screensaver mode — a black screen with the avatar bouncing to a random position every 15 seconds. Any tap, mouse movement, or keypress returns to the message view.

## Auto-start on boot

Add to `/etc/xdg/autostart/pi-display.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Pi Display
Exec=python3 /path/to/pi-display/display.py
X-GNOME-Autostart-enabled=true
```

Or add to crontab (`crontab -e`):

```
@reboot DISPLAY=:0 python3 /path/to/pi-display/display.py &
```

For a dedicated kiosk (no desktop environment at all):

```
startx /usr/bin/python3 /path/to/pi-display/display.py
```
