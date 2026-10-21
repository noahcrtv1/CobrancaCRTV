#!/bin/zsh
# Compila e empacota CobrancaCRTV.app em ./build.
# Uso: scripts/build-app.sh [--install]
#   --install  copia para /Applications
set -euo pipefail
cd "$(dirname "$0")/.."

APP=${APP:-build/CobrancaCRTV.app}
VERSION=1.0.0
BUILD_NUMBER=1
INSTALL=0
PROJECT_DIR=$(cd .. && pwd)
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
  esac
done

swift build -c release

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/CobrancaCRTV "$APP/Contents/MacOS/CobrancaCRTV"

# Ícone Liquid Glass do Icon Composer
if xcrun --find actool >/dev/null 2>&1 && [[ -d Resources/AppIcon.icon ]]; then
  rm -rf build/actool && mkdir -p build/actool
  xcrun actool Resources/AppIcon.icon \
    --compile build/actool \
    --platform macosx --minimum-deployment-target 26.0 \
    --app-icon AppIcon \
    --output-partial-info-plist build/actool/partial.plist \
    --errors --warnings --output-format human-readable-text >/dev/null
  cp build/actool/Assets.car "$APP/Contents/Resources/"
  cp build/actool/AppIcon.icns "$APP/Contents/Resources/"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>CobrancaCRTV</string>
  <key>CFBundleDisplayName</key><string>CobrançaCRTV</string>
  <key>CFBundleIdentifier</key><string>com.lipenoe.cobrancacrtv</string>
  <key>CFBundleExecutable</key><string>CobrancaCRTV</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${BUILD_NUMBER}</string>
  <key>CFBundleDevelopmentRegion</key><string>pt-BR</string>
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.business</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CRTVProjectDir</key><string>${PROJECT_DIR}</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP"
echo "OK: $APP ($(du -sh "$APP" | cut -f1))"

if [[ $INSTALL == 1 ]]; then
  rm -rf /Applications/CobrancaCRTV.app
  ditto "$APP" /Applications/CobrancaCRTV.app
  echo "Instalado em /Applications/CobrancaCRTV.app"
fi
