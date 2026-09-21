#!/usr/bin/env bash
set -euo pipefail

DEST="${NEMEA_BACKUP_DIR:-$HOME/backups/nemea}"
KEEP_DAYS="${NEMEA_BACKUP_KEEP_DAYS:-14}"
CONTAINER="${NEMEA_PG_CONTAINER:-nemea-postgres}"

mkdir -p "$DEST"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$DEST/nemea-$stamp.sql.gz"

docker exec "$CONTAINER" pg_dump -U nemea -d nemea --no-owner | gzip -9 > "$out.tmp"
gzip -t "$out.tmp"
bytes=$(stat -c%s "$out.tmp")
[ "$bytes" -gt 2000 ] || { echo "backup is only $bytes bytes, refusing to keep it" >&2; rm -f "$out.tmp"; exit 1; }
mv "$out.tmp" "$out"
find "$DEST" -name 'nemea-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $out ($bytes bytes), $(ls "$DEST"/nemea-*.sql.gz | wc -l) kept"
