#!/bin/bash
clear

if [[ $(uname -m) != "arm64" ]]; then
    echo "This builder is intended for building Nitrogen for both Intel and Apple silicon, but since you are on an Intel Mac (x86-64),"
    read -p "Press enter to only build for x86-64, or Ctrl+C to exit: "
    pyinstaller --windowed --icon="nitrogen.ico" --add-data "index.html:." --name "Nitrogen" main.py
    echo "Cleaning up x86-64 build..."
    rm -rf build
    mv dist/Nitrogen.app .
    rm -rf dist
    rm -f Nitrogen.spec
    echo "Compiled Nitrogen for x86-64 architecture."
    exit 1
fi

if [ -d "venv_x86" ]; then
    echo "venv_x86 folder already exists, skipping creation."
else
    echo "Creating virtual environment for x86_64..."
    /usr/bin/python3 -m venv venv_x86
    source venv_x86/bin/activate
    arch -x86_64 pip3 install pyinstaller pywebview pillow requests
    deactivate
    echo "Virtual environment for x86_64 created and dependencies installed."
fi

echo "This builder is intended for me (JadXV) to build Nitrogen for installation, if you are just trying to use nitrogen normally, run install.sh instead."
read -p "Press enter to compile Nitrogen for ARM64 and x86_64: "

pyinstaller --windowed --icon="nitrogen.ico" --add-data "index.html:." --name "Nitrogen" main.py

echo "Renaming ARM64 build..."
mv dist/Nitrogen.app dist/Nitrogen-ARM64.app
echo "Cleaning up ARM64 build..."
rm -rf build
mv dist/Nitrogen-ARM64.app .
rm -rf dist
rm -f Nitrogen.spec

source ./venv_x86/bin/activate
arch -x86_64 pyinstaller --windowed --icon="nitrogen.ico" --add-data "index.html:." --name "Nitrogen" main.py

echo "Renaming x86_64 build..."
mv dist/Nitrogen.app dist/Nitrogen-x86_64.app
echo "Cleaning up x86_64 build..."
rm -rf build
mv dist/Nitrogen-x86_64.app .

rm -rf dist
rm -f Nitrogen.spec
deactivate

zip -r NitrogenCompressed.zip Nitrogen-ARM64.app Nitrogen-x86_64.app
rm -rf Nitrogen-ARM64.app Nitrogen-x86_64.app
mv NitrogenCompressed.zip ../
echo "Both apps zipped and originals removed."

echo "Compiled Nitrogen for ARM64 and x86_64 architectures."
