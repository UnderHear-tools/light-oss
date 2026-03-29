DROP TABLE IF EXISTS folder_upload_entries;
DROP TABLE IF EXISTS folder_upload_sessions;
DROP TABLE IF EXISTS upload_chunk_blobs;
DROP TABLE IF EXISTS upload_session_chunks;
DROP TABLE IF EXISTS upload_sessions;

ALTER TABLE objects
    DROP KEY idx_objects_bucket_fingerprint,
    DROP COLUMN file_fingerprint;
