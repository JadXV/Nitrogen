#!/bin/bash

clear

LATEST_VER=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/JadXV/Nitrogen/releases/latest | sed 's|.*/tag/||')
echo "Latest version determined to be: $LATEST_VER"
echo ""

Nitrogen_URL="https://github.com/JadXV/Nitrogen/releases/download/$LATEST_VER/NitrogenCompressed.zip"
TMP_ZIP="/tmp/NitrogenCompressed.zip"

ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  ARCH_FOLDER="Nitrogen-ARM64"
elif [[ "$ARCH" == "x86_64" ]]; then
  ARCH_FOLDER="Nitrogen-x86_64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

if [ -d "/Applications/Nitrogen.app" ]; then
  echo "Nitrogen is already installed."
  echo "Updating / Reinstalling Nitrogen..."
  rm -rf /Applications/Nitrogen.app
fi

if [ -d "$HOME/Documents/Nitrogen" ]; then
  if [ -f "$HOME/Documents/Nitrogen/metadata.json" ]; then
    echo "Deleting old metadata.json file..."
    rm "$HOME/Documents/Nitrogen/metadata.json"
  fi

  echo "Migrating from old Documents location..."
  mkdir -p "$HOME/Nitrogen"
  
  mv "$HOME/Documents/Nitrogen/"* "$HOME/Nitrogen/" 2>/dev/null || true
  rm -rf "$HOME/Documents/Nitrogen"
  echo "Old Documents location deleted."
  echo "Nitrogen files migrated to $HOME/Nitrogen"
fi


echo "Cleaning up temporary files..."
rm -rf /tmp/Nitrogen*.app /tmp/Nitrogen-*.app

echo "Downloading Nitrogen..."
curl -fsSL "$Nitrogen_URL" -o "$TMP_ZIP" || {
  echo "❌ Failed to download Nitrogen"
  exit 1
}

echo "Unzipping Nitrogen..."
unzip -o -q "$TMP_ZIP" -d /tmp || {
  echo "❌ Failed to unzip Nitrogen"
  exit 1
}

echo "Installing $ARCH_FOLDER..."
mv "/tmp/$ARCH_FOLDER.app" "/tmp/Nitrogen.app" || {
  echo "❌ Failed to rename app folder"
  exit 1
}

mv "/tmp/Nitrogen.app" "/Applications" || {
  echo "❌ Failed to move Nitrogen to Applications"
  exit 1
}

xattr -rd com.apple.quarantine /Applications/Nitrogen.app

rm "$TMP_ZIP"

echo ""
echo "✅ Nitrogen installed successfully!"
echo "You can now find Nitrogen in your Applications folder."

open -a /Applications/Nitrogen.app