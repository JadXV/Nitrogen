#!/bin/zsh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

print_header() {
  echo "${BLUE}"
  echo "  _   _ _ _                              "
  echo " | \ | (_) |                             "
  echo " |  \| |_| |_ _ __ ___   __ _  ___ _ __  "
  echo " | . \` | | __| '__/ _ \ / _\` |/ _ \ '_ \ "
  echo " | |\  | | |_| | | (_) | (_| |  __/ | | |"
  echo " |_| \_|_|\__|_|  \___/ \__, |\___|_| |_|"
  echo "                         __/ |           "
  echo "                        |___/            "
  echo "${RESET}"
  echo ""
}

log_info() { echo "${BLUE}[INFO]${RESET} $1"; }
log_success() { echo "${GREEN}[SUCCESS]${RESET} $1"; }
log_warning() { echo "${YELLOW}[WARNING]${RESET} $1"; }
log_error() { echo "${RED}[ERROR]${RESET} $1"; }

get_latest_version() {
  log_info "Fetching latest version information..."
  LATEST_VER=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/JadXV/Nitrogen/releases/latest | sed 's|.*/tag/||')
  
  [[ -z "$LATEST_VER" ]] && { log_error "Failed to determine latest version."; exit 1; }
  
  DISPLAY_VER="$LATEST_VER"
  [[ ! "$DISPLAY_VER" =~ ^v ]] && DISPLAY_VER="v${DISPLAY_VER}"
  
  log_success "Latest version: $LATEST_VER"
  NITROGEN_URL="https://github.com/JadXV/Nitrogen/releases/download/$LATEST_VER/NitrogenCompressed.zip"
}

determine_architecture() {
  ARCH=$(uname -m)
  log_info "Detected architecture: $ARCH"
  
  if [[ "$ARCH" == "arm64" ]]; then
    ARCH_FOLDER="Nitrogen-ARM64"
  elif [[ "$ARCH" == "x86_64" ]]; then
    ARCH_FOLDER="Nitrogen-x86_64"
  else
    log_error "Unsupported architecture: $ARCH"; exit 1
  fi
}

check_existing_installation() {
  if [ -d "/Applications/Nitrogen.app" ]; then
    log_warning "Nitrogen is already installed."
    log_info "Updating/reinstalling Nitrogen..."
    rm -rf "/Applications/Nitrogen.app"
  fi
}

migrate_data() {
  if [ -d "$HOME/Documents/Nitrogen" ]; then
    log_info "Found data in old location."
    
    [ -f "$HOME/Documents/Nitrogen/metadata.json" ] && { log_info "Removing outdated metadata file..."; rm "$HOME/Documents/Nitrogen/metadata.json"; }

    log_info "Migrating data to new location: $HOME/Nitrogen"
    mkdir -p "$HOME/Nitrogen"
    
    echo -n "Migrating files..."
    mv "$HOME/Documents/Nitrogen/"* "$HOME/Nitrogen/" 2>/dev/null || true
    echo " done"
    
    rm -rf "$HOME/Documents/Nitrogen"
    log_success "Data migration completed"
  fi
}

cleanup_temp_files() {
  if ls /tmp/Nitrogen*.app >/dev/null 2>&1 || ls /tmp/Nitrogen-*.app >/dev/null 2>&1 || [[ -f "/tmp/NitrogenCompressed.zip" ]]; then
    log_info "Cleaning up temporary files..."
    [[ -d /tmp/Nitrogen.app ]] && rm -rf /tmp/Nitrogen.app
    [[ -d /tmp/Nitrogen-ARM64.app ]] && rm -rf /tmp/Nitrogen-ARM64.app
    [[ -d /tmp/Nitrogen-x86_64.app ]] && rm -rf /tmp/Nitrogen-x86_64.app
    [[ -f "/tmp/NitrogenCompressed.zip" ]] && rm "/tmp/NitrogenCompressed.zip"
  fi
}

download_app() {
  log_info "Downloading Nitrogen..."
  echo ""
  curl -fsSL --progress-bar "$NITROGEN_URL" -o "/tmp/NitrogenCompressed.zip" || { log_error "Failed to download Nitrogen"; exit 1; }
  echo ""
  log_success "Download completed"
}

install_app() {
  log_info "Extracting files..."
  unzip -o -q "/tmp/NitrogenCompressed.zip" -d /tmp || { log_error "Failed to extract files"; exit 1; }
  
  log_info "Installing for $ARCH architecture..."
  mv "/tmp/$ARCH_FOLDER.app" "/tmp/Nitrogen.app" || { log_error "Failed to prepare app for installation"; exit 1; }
  mv "/tmp/Nitrogen.app" "/Applications/" || { log_error "Failed to move app to Applications folder"; exit 1; }
  
  log_info "Removing quarantine attribute..."
  xattr -rd com.apple.quarantine "/Applications/Nitrogen.app"
}

trap 'cleanup_temp_files >/dev/null 2>&1' EXIT

clear
print_header
get_latest_version
determine_architecture
check_existing_installation
migrate_data
cleanup_temp_files >/dev/null 2>&1

download_app
install_app

open /Applications/Nitrogen.app

echo ""
echo "${GREEN}✅ Nitrogen $DISPLAY_VER has been successfully installed!${RESET}"
echo "${BLUE}You can now find Nitrogen in your Applications folder.${RESET}"
echo ""