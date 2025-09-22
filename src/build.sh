echo "This builder is intended for me (JadXV) to build Nitrogen for installation, if you are just trying to use nitrogen normally, run install.sh instead."
npx electron-builder build --mac --x64 --arm64 \
    -c.mac.identity=null \
    -c.mac.target=zip \
    -c.productName="Nitrogen"

mv dist/mac/Nitrogen.app ./Nitrogen-x86_64.app

mv dist/mac-arm64/Nitrogen.app ./Nitrogen-ARM64.app

mkdir NitrogenCompressed
cp -R Nitrogen-ARM64.app Nitrogen-x86_64.app NitrogenCompressed/
ditto -c -k --sequesterRsrc --keepParent NitrogenCompressed NitrogenCompressed.zip

rm -rf NitrogenCompressed
rm -rf Nitrogen-x86_64.app Nitrogen-ARM64.app
rm -rf dist

echo "Build complete."