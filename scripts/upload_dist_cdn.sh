#!/usr/bin/env bash
# Upload dist/ → DigitalOcean Spaces (public-read) and ensure a CDN endpoint.
#
# Object layout (versioned + latest pointer):
#   s3://$BUCKET/zeus_client_chat_trace/<version>/zeus_client_chat_trace.js
#   s3://$BUCKET/zeus_client_chat_trace/<version>/zeus_client_chat_trace.js.map
#   s3://$BUCKET/zeus_client_chat_trace/latest/zeus_client_chat_trace.js
#   s3://$BUCKET/zeus_client_chat_trace/latest/zeus_client_chat_trace.js.map
#
# CDN URLs (after endpoint exists):
#   https://$BUCKET.$REGION.cdn.digitaloceanspaces.com/zeus_client_chat_trace/0.1.9/zeus_client_chat_trace.js
#   https://$BUCKET.$REGION.cdn.digitaloceanspaces.com/zeus_client_chat_trace/latest/zeus_client_chat_trace.js
#
# Prerequisites:
#   - Python 3 + boto3
#   - DO Spaces credentials (DO_SPACES_KEY / DO_SPACES_SECRET)
#   - Optional DIGITALOCEAN_TOKEN (or doctl auth) to create/list CDN endpoints
#
# Env (optional overrides):
#   DO_SPACES_KEY / DO_SPACES_SECRET     required
#   DO_SPACES_STATIC_BUCKET              default: koten-static-cdn
#   DO_SPACES_STATIC_REGION              default: nyc3
#   DO_SPACES_STATIC_ENDPOINT            default: https://<region>.digitaloceanspaces.com
#   DO_SPACES_STATIC_PREFIX              default: zeus_client_chat_trace
#   TRACE_VERSION                        default: package.json version
#   DIST_DIR                             default: <repo>/dist
#   SKIP_CDN=1                           skip doctl/API CDN ensure
#   DRY_RUN=1                            print plan only
#   UPLOAD_SOURCEMAPS=1                  default on; set 0 to skip .map
#
# Credential load order:
#   1) already-exported env
#   2) $SPACES_ENV_FILE
#   3) <repo>/.secrets/spaces-static.env
#   4) ../koten_remote_deployment/.env
#
# Example:
#   ./scripts/upload_dist_cdn.sh
#   TRACE_VERSION=0.1.9 DRY_RUN=1 ./scripts/upload_dist_cdn.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

if [[ -n "${SPACES_ENV_FILE:-}" ]]; then
  load_env_file "$SPACES_ENV_FILE"
fi
load_env_file "$ROOT/.secrets/spaces-static.env"
load_env_file "$ROOT/../koten_remote_deployment/.env"

: "${DO_SPACES_KEY:?Set DO_SPACES_KEY (or put it in .secrets/spaces-static.env)}"
: "${DO_SPACES_SECRET:?Set DO_SPACES_SECRET}"

BUCKET="${DO_SPACES_STATIC_BUCKET:-koten-static-cdn}"
REGION="${DO_SPACES_STATIC_REGION:-${DO_SPACES_REGION:-nyc3}}"
ENDPOINT="${DO_SPACES_STATIC_ENDPOINT:-https://${REGION}.digitaloceanspaces.com}"
PREFIX="${DO_SPACES_STATIC_PREFIX:-zeus_client_chat_trace}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
DIST_DIR="${DIST_DIR:-$ROOT/dist}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_CDN="${SKIP_CDN:-0}"
UPLOAD_SOURCEMAPS="${UPLOAD_SOURCEMAPS:-1}"

if [[ -z "${TRACE_VERSION:-}" ]]; then
  TRACE_VERSION="$(python3 -c 'import json, pathlib; print(json.loads(pathlib.Path("'"$ROOT"'/package.json").read_text())["version"])')"
fi

JS_SRC="$DIST_DIR/zeus_client_chat_trace.js"
MAP_SRC="$DIST_DIR/zeus_client_chat_trace.js.map"

if [[ ! -f "$JS_SRC" ]]; then
  echo "error: missing $JS_SRC — run npm run build first" >&2
  exit 1
fi

ORIGIN_HOST="${BUCKET}.${REGION}.digitaloceanspaces.com"
CDN_HOST="${BUCKET}.${REGION}.cdn.digitaloceanspaces.com"
ORIGIN_BASE="https://${ORIGIN_HOST}/${PREFIX}"
CDN_BASE="https://${CDN_HOST}/${PREFIX}"

echo "==> bucket   s3://${BUCKET}/"
echo "==> region   ${REGION}"
echo "==> endpoint ${ENDPOINT}"
echo "==> version  ${TRACE_VERSION}"
echo "==> source   ${DIST_DIR}"
echo "==> keys     ${PREFIX}/${TRACE_VERSION}/ and ${PREFIX}/latest/"
echo "==> CDN base ${CDN_BASE}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "==> DRY_RUN — would upload:"
  echo "    ${PREFIX}/${TRACE_VERSION}/zeus_client_chat_trace.js"
  [[ "$UPLOAD_SOURCEMAPS" == "1" && -f "$MAP_SRC" ]] && echo "    ${PREFIX}/${TRACE_VERSION}/zeus_client_chat_trace.js.map"
  echo "    ${PREFIX}/latest/zeus_client_chat_trace.js"
  [[ "$UPLOAD_SOURCEMAPS" == "1" && -f "$MAP_SRC" ]] && echo "    ${PREFIX}/latest/zeus_client_chat_trace.js.map"
  exit 0
fi

export DO_SPACES_KEY DO_SPACES_SECRET BUCKET REGION ENDPOINT PREFIX TRACE_VERSION
export JS_SRC MAP_SRC UPLOAD_SOURCEMAPS

python3 <<'PY'
import os
import mimetypes
import pathlib
import sys

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

endpoint = os.environ["ENDPOINT"]
region = os.environ["REGION"]
bucket = os.environ["BUCKET"]
prefix = os.environ["PREFIX"]
version = os.environ["TRACE_VERSION"]
js_src = pathlib.Path(os.environ["JS_SRC"])
map_src = pathlib.Path(os.environ["MAP_SRC"])
upload_maps = os.environ.get("UPLOAD_SOURCEMAPS", "1") == "1"

session = boto3.session.Session()
client = session.client(
    "s3",
    region_name=region,
    endpoint_url=endpoint,
    aws_access_key_id=os.environ["DO_SPACES_KEY"],
    aws_secret_access_key=os.environ["DO_SPACES_SECRET"],
    config=Config(signature_version="s3v4"),
)

def ensure_bucket() -> None:
    try:
        client.head_bucket(Bucket=bucket)
        print(f"==> bucket exists: {bucket}")
        return
    except ClientError as e:
        code = str(e.response.get("Error", {}).get("Code", ""))
        http = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if http not in (404, 403) and code not in ("404", "NoSuchBucket", "NotFound", "403", "Forbidden"):
            # 403 can mean missing bucket or no access; try create
            pass
    print(f"==> creating Space {bucket} in {region}")
    params = {
        "Bucket": bucket,
        "ACL": "private",  # objects are public-read; bucket listing stays private
    }
    # nyc3 and most DO regions want LocationConstraint == region; some reject us-east-1 style.
    if region and region != "us-east-1":
        params["CreateBucketConfiguration"] = {"LocationConstraint": region}
    try:
        client.create_bucket(**params)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
            raise
        print(f"==> create_bucket: {code} (ok)")

    # CORS so browsers can fetch the script/source map cross-origin when needed.
    try:
        client.put_bucket_cors(
            Bucket=bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": ["*"],
                        "AllowedMethods": ["GET", "HEAD"],
                        "AllowedHeaders": ["*"],
                        "MaxAgeSeconds": 86400,
                    }
                ]
            },
        )
        print("==> CORS: GET/HEAD *")
    except ClientError as e:
        print(f"warn: put_bucket_cors failed: {e}", file=sys.stderr)

def upload(local: pathlib.Path, key: str, cache_control: str, content_type: str) -> None:
    extra = {
        "ACL": "public-read",
        "CacheControl": cache_control,
        "ContentType": content_type,
        "MetadataDirective": "REPLACE",
    }
    # MetadataDirective only valid on copy; strip for put
    extra.pop("MetadataDirective", None)
    print(f"==> put s3://{bucket}/{key} ({local.stat().st_size} bytes, {content_type})")
    client.upload_file(
        str(local),
        bucket,
        key,
        ExtraArgs={
            "ACL": "public-read",
            "CacheControl": cache_control,
            "ContentType": content_type,
        },
    )

ensure_bucket()

immutable = "public, max-age=31536000, immutable"
mutable = "public, max-age=60, must-revalidate"

targets = [
    (js_src, f"{prefix}/{version}/zeus_client_chat_trace.js", immutable, "application/javascript; charset=utf-8"),
    (js_src, f"{prefix}/latest/zeus_client_chat_trace.js", mutable, "application/javascript; charset=utf-8"),
]
if upload_maps and map_src.is_file():
    targets.extend(
        [
            (map_src, f"{prefix}/{version}/zeus_client_chat_trace.js.map", immutable, "application/json; charset=utf-8"),
            (map_src, f"{prefix}/latest/zeus_client_chat_trace.js.map", mutable, "application/json; charset=utf-8"),
        ]
    )
elif upload_maps:
    print(f"warn: no sourcemap at {map_src}", file=sys.stderr)

for path, key, cache, ctype in targets:
    upload(path, key, cache, ctype)

print("==> upload complete")
PY

# Ensure CDN endpoint (DO API / doctl)
CDN_ENDPOINT_ID=""
if [[ "$SKIP_CDN" != "1" ]]; then
  ensure_cdn() {
    local origin="https://${ORIGIN_HOST}"
    # Prefer DIGITALOCEAN_TOKEN from env / remote .env; doctl context as fallback
    if [[ -z "${DIGITALOCEAN_TOKEN:-}" ]] && command -v doctl >/dev/null 2>&1; then
      DIGITALOCEAN_TOKEN="$(doctl auth token 2>/dev/null || true)"
    fi

    if [[ -n "${DIGITALOCEAN_TOKEN:-}" ]]; then
      local resp existing
      resp="$(curl -sS -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
        "https://api.digitalocean.com/v2/cdn/endpoints?per_page=200")"
      existing="$(ORIGIN_HOST="$ORIGIN_HOST" python3 -c '
import json,os,sys
d=json.load(sys.stdin)
origin_host=os.environ["ORIGIN_HOST"]
for e in d.get("endpoints") or []:
    o=(e.get("origin") or "").replace("https://","").rstrip("/")
    if o==origin_host or o.endswith(origin_host):
        print(e.get("endpoint") or "")
        print(e.get("id") or "", file=sys.stderr)
        sys.exit(0)
sys.exit(1)
' <<<"$resp" 2>/tmp/cdn_id.txt || true)"
      if [[ -n "${existing:-}" ]]; then
        CDN_ENDPOINT_ID="$(tr -d "[:space:]" </tmp/cdn_id.txt 2>/dev/null || true)"
        echo "==> CDN already enabled: https://${existing}"
        return 0
      fi
      echo "==> creating CDN for origin ${origin}"
      resp="$(curl -sS -X POST -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"origin\":\"${ORIGIN_HOST}\",\"ttl\":3600}" \
        "https://api.digitalocean.com/v2/cdn/endpoints")"
      ENDPOINT_HOST="$(python3 -c 'import json,sys; d=json.load(sys.stdin); e=d.get("endpoint") or {}; print(e.get("endpoint") or "")' <<<"$resp")"
      CDN_ENDPOINT_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); e=d.get("endpoint") or {}; print(e.get("id") or "")' <<<"$resp")"
      if [[ -n "$ENDPOINT_HOST" ]]; then
        echo "==> CDN created: https://${ENDPOINT_HOST}"
        return 0
      fi
      echo "warn: CDN create response unexpected: ${resp:0:300}" >&2
    elif command -v doctl >/dev/null 2>&1; then
      if doctl compute cdn list --format Origin,Endpoint --no-header 2>/dev/null | grep -q "${ORIGIN_HOST}"; then
        echo "==> CDN already present for ${ORIGIN_HOST}"
        return 0
      fi
      doctl compute cdn create "${ORIGIN_HOST}" --ttl 3600
    else
      echo "warn: no DIGITALOCEAN_TOKEN/doctl — enable CDN in DO UI for Space ${BUCKET}" >&2
      return 0
    fi
  }
  ensure_cdn || echo "warn: CDN ensure failed — objects may still be reachable on origin" >&2

  # Purge mutable latest/* so CDN does not keep a stale short-TTL object for up to edge TTL.
  purge_cdn_latest() {
    if [[ -z "${DIGITALOCEAN_TOKEN:-}" || -z "${CDN_ENDPOINT_ID:-}" ]]; then
      return 0
    fi
    local files='["/'"${PREFIX}"'/latest/zeus_client_chat_trace.js","/'"${PREFIX}"'/latest/zeus_client_chat_trace.js.map"]'
    echo "==> CDN purge latest/* on endpoint ${CDN_ENDPOINT_ID}"
    curl -sS -X DELETE -H "Authorization: Bearer ${DIGITALOCEAN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"files\":${files}}" \
      "https://api.digitalocean.com/v2/cdn/endpoints/${CDN_ENDPOINT_ID}/cache" >/dev/null \
      || echo "warn: CDN purge failed (non-fatal)" >&2
  }
  purge_cdn_latest
fi

probe() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -L -A 'koten-cdn-probe' "$url" || true)"
  echo "==> probe HTTP ${code}  ${url}"
  [[ "$code" == "200" ]]
}

VER_URL="${CDN_BASE}/${TRACE_VERSION}/zeus_client_chat_trace.js"
LATEST_URL="${CDN_BASE}/latest/zeus_client_chat_trace.js"
ORIGIN_VER_URL="${ORIGIN_BASE}/${TRACE_VERSION}/zeus_client_chat_trace.js"

echo
echo "==> verifying"
sleep 2
if ! probe "$VER_URL"; then
  echo "==> CDN miss — trying origin"
  probe "$ORIGIN_VER_URL" || true
fi
probe "$LATEST_URL" || probe "${ORIGIN_BASE}/latest/zeus_client_chat_trace.js" || true

# Write a small machine-readable pointer (gitignored under .secrets)
mkdir -p "$ROOT/.secrets"
cat > "$ROOT/.secrets/cdn-urls.env" <<EOF
# Generated by scripts/upload_dist_cdn.sh — do not commit
TRACE_CDN_VERSION=${TRACE_VERSION}
TRACE_CDN_BASE=${CDN_BASE}
TRACE_CDN_JS=${VER_URL}
TRACE_CDN_JS_LATEST=${LATEST_URL}
TRACE_CDN_ORIGIN_JS=${ORIGIN_VER_URL}
EOF
chmod 600 "$ROOT/.secrets/cdn-urls.env" 2>/dev/null || true

echo
echo "Embed (versioned, immutable cache):"
echo "  <script src=\"${VER_URL}\" async></script>"
echo
echo "Embed (latest pointer, short cache):"
echo "  <script src=\"${LATEST_URL}\" async></script>"
echo
echo "Saved URL pointer → .secrets/cdn-urls.env"
