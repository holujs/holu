#!/bin/bash

TAG="next"

# List of packages to process
PACKAGES=(
  "authjs"
  "body-parser"
  "cli"
  "core"
  "cors"
  "i18n"
  "jwt"
  "openapi"
  "openapi-validation"
  "rest"
  "rest-testing"
  "schedule"
  "sentry"
  "session-cookie"
  "trpc"
  "typeorm"
)

# Prompt for Version
read -p "Enter package version (e.g. 0.3.0): " VERSION

if [ -z "$VERSION" ]; then
  echo "Error: Version cannot be empty."
  exit 1
fi

# Prompt for OTP
read -p "Enter OTP (One-Time Password) for NPM: " NPM_OTP

if [ -z "$NPM_OTP" ]; then
  echo "Error: OTP cannot be empty."
  exit 1
fi

echo "Starting to add the '$TAG' tag for version $VERSION..."

# Iterate over each package and add the dist-tag
for PKG in "${PACKAGES[@]}"; do
  FULL_PKG_NAME="@holu/$PKG"
  echo "-> npm dist-tag add $FULL_PKG_NAME@$VERSION $TAG"
  npm dist-tag add "$FULL_PKG_NAME@$VERSION" "$TAG" --otp="$NPM_OTP"
done

echo "Done!"
