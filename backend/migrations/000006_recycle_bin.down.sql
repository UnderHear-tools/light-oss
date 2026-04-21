-- Intentionally allow duplicate-key errors here so rollback aborts instead of
-- silently dropping recycle-bin rows that the pre-recycle-bin schema cannot represent.
INSERT INTO objects (
    bucket_name,
    object_key,
    original_filename,
    storage_path,
    size,
    content_type,
    etag,
    file_fingerprint,
    visibility,
    is_deleted,
    created_at,
    updated_at
)
SELECT
    recycle.bucket_name,
    recycle.object_key,
    recycle.original_filename,
    recycle.storage_path,
    recycle.size,
    recycle.content_type,
    recycle.etag,
    recycle.file_fingerprint,
    recycle.visibility,
    TRUE,
    recycle.created_at,
    recycle.deleted_at
FROM recycle_bin_objects AS recycle;

DROP TABLE IF EXISTS recycle_bin_objects;
