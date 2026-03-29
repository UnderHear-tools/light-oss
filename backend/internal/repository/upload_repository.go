package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"light-oss/backend/internal/model"
)

type UploadRepository struct {
	db *gorm.DB
}

func NewUploadRepository(db *gorm.DB) *UploadRepository {
	return &UploadRepository{db: db}
}

func (r *UploadRepository) WithDB(db *gorm.DB) *UploadRepository {
	if db == nil {
		return r
	}

	return &UploadRepository{db: db}
}

func (r *UploadRepository) DB() *gorm.DB {
	return r.db
}

func (r *UploadRepository) Transaction(ctx context.Context, fn func(repo *UploadRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(r.WithDB(tx))
	})
}

func (r *UploadRepository) CreateUploadSession(
	ctx context.Context,
	session *model.UploadSession,
	chunks []model.UploadSessionChunk,
) error {
	if err := r.db.WithContext(ctx).Create(session).Error; err != nil {
		return err
	}
	if len(chunks) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).Create(&chunks).Error
}

func (r *UploadRepository) FindUploadSessionByIDAndOwner(
	ctx context.Context,
	id string,
	ownerScope string,
) (*model.UploadSession, error) {
	var session model.UploadSession
	err := r.db.WithContext(ctx).
		Where("id = ? AND owner_scope = ?", id, ownerScope).
		First(&session).Error
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (r *UploadRepository) FindResumableUploadSession(
	ctx context.Context,
	ownerScope string,
	bucketName string,
	objectKey string,
	fileFingerprint string,
	size int64,
	folderEntryID *string,
	now time.Time,
) (*model.UploadSession, error) {
	query := r.db.WithContext(ctx).
		Where(
			"owner_scope = ? AND bucket_name = ? AND object_key = ? AND file_fingerprint = ? AND size = ? AND expires_at > ?",
			ownerScope,
			bucketName,
			objectKey,
			fileFingerprint,
			size,
			now,
		).
		Where("status IN ?", []string{"pending", "uploading", "uploaded"})

	if folderEntryID == nil {
		query = query.Where("folder_entry_id IS NULL")
	} else {
		query = query.Where("folder_entry_id = ?", *folderEntryID)
	}

	var session model.UploadSession
	err := query.Order("updated_at DESC").First(&session).Error
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (r *UploadRepository) ListUploadSessionChunks(
	ctx context.Context,
	uploadSessionID string,
) ([]model.UploadSessionChunk, error) {
	var chunks []model.UploadSessionChunk
	err := r.db.WithContext(ctx).
		Where("upload_session_id = ?", uploadSessionID).
		Order("chunk_index ASC").
		Find(&chunks).Error
	return chunks, err
}

func (r *UploadRepository) FindUploadSessionChunk(
	ctx context.Context,
	uploadSessionID string,
	chunkIndex int,
) (*model.UploadSessionChunk, error) {
	var chunk model.UploadSessionChunk
	err := r.db.WithContext(ctx).
		Where("upload_session_id = ? AND chunk_index = ?", uploadSessionID, chunkIndex).
		First(&chunk).Error
	if err != nil {
		return nil, err
	}

	return &chunk, nil
}

func (r *UploadRepository) UpdateUploadSession(
	ctx context.Context,
	id string,
	updates map[string]any,
) error {
	return r.db.WithContext(ctx).
		Model(&model.UploadSession{}).
		Where("id = ?", id).
		Updates(updates).Error
}

func (r *UploadRepository) UpdateUploadSessionChunk(
	ctx context.Context,
	uploadSessionID string,
	chunkIndex int,
	updates map[string]any,
) error {
	return r.db.WithContext(ctx).
		Model(&model.UploadSessionChunk{}).
		Where("upload_session_id = ? AND chunk_index = ?", uploadSessionID, chunkIndex).
		Updates(updates).Error
}

func (r *UploadRepository) DeleteUploadSession(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).
		Where("upload_session_id = ?", id).
		Delete(&model.UploadSessionChunk{}).Error; err != nil {
		return err
	}

	return r.db.WithContext(ctx).
		Where("id = ?", id).
		Delete(&model.UploadSession{}).Error
}

func (r *UploadRepository) CreateFolderUploadSession(
	ctx context.Context,
	session *model.FolderUploadSession,
	entries []model.FolderUploadEntry,
) error {
	if err := r.db.WithContext(ctx).Create(session).Error; err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).Create(&entries).Error
}

func (r *UploadRepository) FindFolderUploadSessionByIDAndOwner(
	ctx context.Context,
	id string,
	ownerScope string,
) (*model.FolderUploadSession, error) {
	var session model.FolderUploadSession
	err := r.db.WithContext(ctx).
		Where("id = ? AND owner_scope = ?", id, ownerScope).
		First(&session).Error
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (r *UploadRepository) FindResumableFolderUploadSession(
	ctx context.Context,
	ownerScope string,
	bucketName string,
	prefix string,
	batchFingerprint string,
	now time.Time,
) (*model.FolderUploadSession, error) {
	var session model.FolderUploadSession
	err := r.db.WithContext(ctx).
		Where(
			"owner_scope = ? AND bucket_name = ? AND prefix = ? AND batch_fingerprint = ? AND expires_at > ?",
			ownerScope,
			bucketName,
			prefix,
			batchFingerprint,
			now,
		).
		Where("status IN ?", []string{"pending", "uploading"}).
		Order("updated_at DESC").
		First(&session).Error
	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (r *UploadRepository) ListFolderUploadEntries(
	ctx context.Context,
	folderUploadSessionID string,
) ([]model.FolderUploadEntry, error) {
	var entries []model.FolderUploadEntry
	err := r.db.WithContext(ctx).
		Where("folder_upload_session_id = ?", folderUploadSessionID).
		Order("relative_path ASC").
		Find(&entries).Error
	return entries, err
}

func (r *UploadRepository) FindFolderUploadEntryByIDAndSession(
	ctx context.Context,
	id string,
	folderUploadSessionID string,
) (*model.FolderUploadEntry, error) {
	var entry model.FolderUploadEntry
	err := r.db.WithContext(ctx).
		Where("id = ? AND folder_upload_session_id = ?", id, folderUploadSessionID).
		First(&entry).Error
	if err != nil {
		return nil, err
	}

	return &entry, nil
}

func (r *UploadRepository) UpdateFolderUploadEntry(
	ctx context.Context,
	id string,
	updates map[string]any,
) error {
	return r.db.WithContext(ctx).
		Model(&model.FolderUploadEntry{}).
		Where("id = ?", id).
		Updates(updates).Error
}

func (r *UploadRepository) UpdateFolderUploadSession(
	ctx context.Context,
	id string,
	updates map[string]any,
) error {
	return r.db.WithContext(ctx).
		Model(&model.FolderUploadSession{}).
		Where("id = ?", id).
		Updates(updates).Error
}

func (r *UploadRepository) DeleteFolderUploadSession(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).
		Where("folder_upload_session_id = ?", id).
		Delete(&model.FolderUploadEntry{}).Error; err != nil {
		return err
	}

	return r.db.WithContext(ctx).
		Where("id = ?", id).
		Delete(&model.FolderUploadSession{}).Error
}

func (r *UploadRepository) UpsertChunkBlob(ctx context.Context, blob *model.UploadChunkBlob) error {
	now := time.Now().UTC()
	blob.CreatedAt = now
	blob.UpdatedAt = now

	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "sha256"}},
			DoUpdates: clause.Assignments(map[string]any{
				"storage_path": blob.StoragePath,
				"size":         blob.Size,
				"expires_at":   blob.ExpiresAt,
				"updated_at":   now,
			}),
		}).
		Create(blob).Error
}

func (r *UploadRepository) FindChunkBlob(
	ctx context.Context,
	sha256 string,
) (*model.UploadChunkBlob, error) {
	var blob model.UploadChunkBlob
	err := r.db.WithContext(ctx).
		Where("sha256 = ?", sha256).
		First(&blob).Error
	if err != nil {
		return nil, err
	}

	return &blob, nil
}

func (r *UploadRepository) ListExpiredUploadSessions(
	ctx context.Context,
	now time.Time,
) ([]model.UploadSession, error) {
	var sessions []model.UploadSession
	err := r.db.WithContext(ctx).
		Where("expires_at <= ?", now).
		Where("status IN ?", []string{"pending", "uploading", "uploaded", "cancelled"}).
		Find(&sessions).Error
	return sessions, err
}

func (r *UploadRepository) ListExpiredFolderUploadSessions(
	ctx context.Context,
	now time.Time,
) ([]model.FolderUploadSession, error) {
	var sessions []model.FolderUploadSession
	err := r.db.WithContext(ctx).
		Where("expires_at <= ?", now).
		Where("status IN ?", []string{"pending", "uploading", "cancelled"}).
		Find(&sessions).Error
	return sessions, err
}

func (r *UploadRepository) ListExpiredChunkBlobsWithoutActiveReferences(
	ctx context.Context,
	now time.Time,
) ([]model.UploadChunkBlob, error) {
	var blobs []model.UploadChunkBlob
	subQuery := r.db.WithContext(ctx).
		Table("upload_session_chunks").
		Select("1").
		Joins("JOIN upload_sessions ON upload_sessions.id = upload_session_chunks.upload_session_id").
		Where("upload_session_chunks.chunk_sha256 = upload_chunk_blobs.sha256").
		Where("upload_session_chunks.status = ?", "uploaded").
		Where("upload_sessions.expires_at > ?", now).
		Where("upload_sessions.status IN ?", []string{"pending", "uploading", "uploaded"})

	err := r.db.WithContext(ctx).
		Where("expires_at <= ?", now).
		Where("NOT EXISTS (?)", subQuery).
		Find(&blobs).Error
	return blobs, err
}

func (r *UploadRepository) DeleteChunkBlob(ctx context.Context, sha256 string) error {
	return r.db.WithContext(ctx).
		Where("sha256 = ?", sha256).
		Delete(&model.UploadChunkBlob{}).Error
}
