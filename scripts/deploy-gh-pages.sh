#!/bin/sh
# Builds the site and publishes dist/ to the gh-pages branch of origin,
# which GitHub Pages serves at https://<user>.github.io/<repo>/.
set -e
cd "$(dirname "$0")/.."
npm run build
REMOTE=$(git config --get remote.origin.url)
NAME=$(git config user.name)
EMAIL=$(git config user.email)
REV=$(git rev-parse --short HEAD)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "${DEPLOY_MESSAGE:-Deploy $REV}"
git push -f -q "$REMOTE" gh-pages
rm -rf .git
echo "Published $REV to gh-pages"
