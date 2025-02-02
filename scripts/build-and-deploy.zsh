#!/bin/zsh
set -e  # Exit on error

if [ -z "$1" ]; then
  echo "Usage: ./scripts/build-and-deploy.zsh <function_name>"
  exit 1
fi

FUNCTION_NAME=$1
FUNCTION_DIR="functions/$FUNCTION_NAME"

if [ ! -d "$FUNCTION_DIR" ]; then
  echo "Function '$FUNCTION_NAME' not found in packages!"
  exit 1
fi

echo "Building function '$FUNCTION_NAME'..."

# Navigate to the function directory
cd "$FUNCTION_DIR"

# Build the TypeScript source (using the build script defined in package.json)
npm run build

# Go back to the root
cd - > /dev/null

# Create a deployment package
ZIP_FILE="./${FUNCTION_NAME}.zip"
rm -f "$ZIP_FILE"  # Remove old zip if it exists

# Package the main file as index.js in the root of the zip and include package.json
cd "$FUNCTION_DIR"
# zip -r "../../${FUNCTION_NAME}.zip"
zip -r "../../${FUNCTION_NAME}.zip" package.json
zip -rj "../../${FUNCTION_NAME}.zip" dist/

cd - > /dev/null
zip -r $ZIP_FILE node_modules -x "node_modules/aws-sdk/*"

echo "Deploying function '$FUNCTION_NAME' to AWS Lambda..."
aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://$(pwd)/${FUNCTION_NAME}.zip"

echo "Deployment complete for '$FUNCTION_NAME'!"