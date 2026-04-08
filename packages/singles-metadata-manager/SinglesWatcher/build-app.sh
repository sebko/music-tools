#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="SinglesWatcher"
APP_BUNDLE="$SCRIPT_DIR/$APP_NAME.app"
BUNDLE_ID="com.djtools.singles-watcher-app"

echo "Building $APP_NAME..."
cd "$SCRIPT_DIR"
swift build -c release

echo "Creating app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp ".build/release/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>SinglesWatcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.djtools.singles-watcher-app</string>
    <key>CFBundleName</key>
    <string>SinglesWatcher</string>
    <key>CFBundleDisplayName</key>
    <string>Singles Watcher</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "Done! App bundle created at:"
echo "  $APP_BUNDLE"
echo ""
echo "You can double-click it, drag it to /Applications, or add it to your Dock."
