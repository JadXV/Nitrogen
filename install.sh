#!/bin/zsh

[[ -t 0 && -t 1 ]] && INTERACTIVE=true || INTERACTIVE=false
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
  
  if [ "$INTERACTIVE" = true ]; then
    read "choice?Would you like to Update / Reinstall Nitrogen? (y/n): "
    case "$choice" in
      y|Y|yes|Yes ) 
        echo "Removing existing installation..."
        rm -rf /Applications/Nitrogen.app
        ;;
      * ) 
        echo "Installation cancelled."
        exit 0
        ;;
    esac
  else
    echo "Updating / Reinstalling Nitrogen..."
    rm -rf /Applications/Nitrogen.app
  fi
fi


if [ -f "$HOME/Documents/Nitrogen/metadata.json" ]; then
  echo "Deleting metadata.json file..."
  rm "$HOME/Documents/Nitrogen/metadata.json"
fi

echo "Downloading Nitrogen"
curl -fsSL "$Nitrogen_URL" -o "$TMP_ZIP" || echo "Failed to download Nitrogen"

echo "Installing Nitrogen"
unzip -q "$TMP_ZIP" -d /tmp || echo "Failed to unzip"

echo "Installing $ARCH_FOLDER"

mv /tmp/$ARCH_FOLDER.app /tmp/Nitrogen.app || echo "Failed to move the correct version"
mv /tmp/Nitrogen.app /Applications || echo "Failed to install"
xattr -rd com.apple.quarantine /Applications/Nitrogen.app

rm "$TMP_ZIP"

echo "Nitrogen installed successfully!"
echo "You can now open Nitrogen from your Applications folder."