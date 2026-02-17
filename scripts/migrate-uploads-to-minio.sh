#!/usr/bin/env bash
set -euo pipefail

# Migrate local uploads to MinIO
# Requires: mc (MinIO client) — https://min.io/docs/minio/linux/reference/minio-mc.html
#
# Usage: ./scripts/migrate-uploads-to-minio.sh [source_dir] [minio_alias]
#
# Environment: S3_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, S3_BUCKET

SOURCE_DIR="${1:-/data/uploads}"
ALIAS="${2:-jic}"
BUCKET="${S3_BUCKET:-uploads}"

if ! command -v mc &>/dev/null; then
  echo "Error: mc (MinIO client) not found. Install from https://min.io/docs/minio/linux/reference/minio-mc.html"
  exit 1
fi

if [ -z "${S3_ENDPOINT:-}" ] || [ -z "${MINIO_ACCESS_KEY:-}" ] || [ -z "${MINIO_SECRET_KEY:-}" ]; then
  echo "Error: S3_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY must be set"
  exit 1
fi

echo "Configuring MinIO alias '${ALIAS}'..."
mc alias set "$ALIAS" "${S3_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"

echo "Creating bucket '${BUCKET}' (if needed)..."
mc mb "${ALIAS}/${BUCKET}" --ignore-existing

if [ -d "${SOURCE_DIR}/public" ]; then
  echo "Syncing ${SOURCE_DIR}/public/ -> ${ALIAS}/${BUCKET}/public/"
  mc mirror "${SOURCE_DIR}/public/" "${ALIAS}/${BUCKET}/public/" --overwrite
else
  echo "Skipping public/ (not found at ${SOURCE_DIR}/public)"
fi

if [ -d "${SOURCE_DIR}/private" ]; then
  echo "Syncing ${SOURCE_DIR}/private/ -> ${ALIAS}/${BUCKET}/private/"
  mc mirror "${SOURCE_DIR}/private/" "${ALIAS}/${BUCKET}/private/" --overwrite
else
  echo "Skipping private/ (not found at ${SOURCE_DIR}/private)"
fi

echo "Migration complete."
mc ls "${ALIAS}/${BUCKET}/" --summarize
