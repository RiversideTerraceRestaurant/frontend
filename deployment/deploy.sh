#!/usr/bin/env bash
set -Eeuo pipefail

archive=${1:?Archive path required}
revision=${2:?Commit SHA required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$archive" == /home/ubuntu/.cache/rtr-frontend-*.tar.gz ]] || exit 1
exec 9>"$HOME/.cache/rtr-frontend-deploy.lock"
flock -w 300 9
staging=$(mktemp -d)
webroot=/var/www/rtr
activated=false
success=false
cleanup() {
  status=$?
  if [[ "$activated" == true && "$success" != true && -f "$staging/previous-index.html" ]]; then
    cp "$staging/previous-index.html" "$webroot/.index-rollback.html"
    mv -f "$webroot/.index-rollback.html" "$webroot/index.html"
    echo 'Restored previous frontend index.' >&2
  fi
  rm -rf -- "$staging"
  rm -f -- "$archive"
  exit "$status"
}
trap cleanup EXIT
mkdir "$staging/build"
tar -xzf "$archive" -C "$staging/build"
test -s "$staging/build/index.html"
test -d "$staging/build/assets"
cp "$webroot/index.html" "$staging/previous-index.html"
# Keep existing hashed assets so already-open browser tabs continue working.
rsync -a --exclude=index.html "$staging/build/" "$webroot/"
cp "$staging/build/index.html" "$webroot/.index-next.html"
activated=true
mv -f "$webroot/.index-next.html" "$webroot/index.html"
curl --fail --silent --show-error --max-time 15 \
  --resolve mingsensei.site:443:127.0.0.1 https://mingsensei.site/ \
  | cmp "$webroot/index.html" -
success=true
printf '%s\n' "$revision" > "$HOME/.cache/rtr-frontend-revision"
echo "Frontend deployed: $revision"
