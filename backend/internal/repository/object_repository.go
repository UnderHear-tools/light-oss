package repository

import (
	"context"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"light-oss/backend/internal/model"
)

type Cursor struct {
	CreatedAt time.Time
	ID        uint64
}

type ListObjectsParams struct {
	BucketName string
	Prefix     string
	Limit      int
	Cursor     *Cursor
}

type ObjectRepository struct {
	db *gorm.DB
}

const objectKeyPrefixLikeClause = "object_key LIKE ? ESCAPE '!'"

func NewObjectRepository(db *gorm.DB) *ObjectRepository {
	return &ObjectRepository{db: db}
}

func (r *ObjectRepository) WithDB(db *gorm.DB) *ObjectRepository {
	if db == nil {
		return r
	}

	return &ObjectRepository{db: db}
}

func (r *ObjectRepository) Transaction(ctx context.Context, fn func(repo *ObjectRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(r.WithDB(tx))
	})
}

func (r *ObjectRepository) Upsert(ctx context.Context, object *model.Object) (*model.Object, error) {
	now := time.Now().UTC()
	object.CreatedAt = now
	object.UpdatedAt = now

	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "bucket_name"},
			{Name: "object_key"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"original_filename": object.OriginalFilename,
			"storage_path":      object.StoragePath,
			"size":              object.Size,
			"content_type":      object.ContentType,
			"etag":              object.ETag,
			"file_fingerprint":  object.FileFingerprint,
			"visibility":        object.Visibility,
			"is_deleted":        object.IsDeleted,
			"created_at":        now,
			"updated_at":        now,
		}),
	}).Create(object).Error
	if err != nil {
		return nil, err
	}

	return r.FindActive(ctx, object.BucketName, object.ObjectKey)
}

func (r *ObjectRepository) FindActive(ctx context.Context, bucketName string, objectKey string) (*model.Object, error) {
	var object model.Object
	err := r.db.WithContext(ctx).
		Where("bucket_name = ? AND object_key = ? AND is_deleted = ?", bucketName, objectKey, false).
		First(&object).Error
	if err != nil {
		return nil, err
	}

	return &object, nil
}

func (r *ObjectRepository) FindAnyActiveByFingerprint(ctx context.Context, fileFingerprint string) (*model.Object, error) {
	var object model.Object
	err := r.db.WithContext(ctx).
		Where("file_fingerprint = ? AND is_deleted = ?", fileFingerprint, false).
		Order("created_at DESC").
		First(&object).Error
	if err != nil {
		return nil, err
	}

	return &object, nil
}

func (r *ObjectRepository) ListActive(ctx context.Context, params ListObjectsParams) ([]model.Object, error) {
	var objects []model.Object

	query := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", params.BucketName, false)

	query = applyObjectKeyPrefixFilter(query, params.Prefix)
	if params.Cursor != nil {
		query = query.Where(
			"(created_at < ?) OR (created_at = ? AND id < ?)",
			params.Cursor.CreatedAt,
			params.Cursor.CreatedAt,
			params.Cursor.ID,
		)
	}

	err := query.
		Order("created_at DESC").
		Order("id DESC").
		Limit(params.Limit).
		Find(&objects).Error
	return objects, err
}

func (r *ObjectRepository) ListActiveByPrefixOrdered(ctx context.Context, bucketName string, prefix string) ([]model.Object, error) {
	var objects []model.Object

	query := r.db.WithContext(ctx).
		Where("bucket_name = ? AND is_deleted = ?", bucketName, false)

	query = applyObjectKeyPrefixFilter(query, prefix)

	err := query.
		Order("object_key ASC").
		Find(&objects).Error
	return objects, err
}

func (r *ObjectRepository) ListActiveKeys(ctx context.Context, bucketName string) ([]string, error) {
	var keys []string

	err := r.db.WithContext(ctx).
		Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", bucketName, false).
		Order("object_key ASC").
		Pluck("object_key", &keys).Error
	return keys, err
}

func (r *ObjectRepository) ExistsActiveWithPrefix(ctx context.Context, bucketName string, prefix string) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", bucketName, false)

	query = applyObjectKeyPrefixFilter(query, prefix)

	if err := query.Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

func (r *ObjectRepository) ExistsActiveWithPrefixExceptKey(ctx context.Context, bucketName string, prefix string, excludedKey string) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", bucketName, false).
		Where(objectKeyPrefixLikeClause, likePrefixPattern(prefix))

	if excludedKey != "" {
		query = query.Where("object_key <> ?", excludedKey)
	}

	if err := query.Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

func (r *ObjectRepository) SoftDelete(ctx context.Context, bucketName string, objectKey string) (bool, error) {
	result := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND object_key = ? AND is_deleted = ?", bucketName, objectKey, false).
		Updates(map[string]any{
			"is_deleted": true,
			"updated_at": time.Now().UTC(),
		})
	return result.RowsAffected > 0, result.Error
}

func (r *ObjectRepository) SoftDeleteByPrefix(ctx context.Context, bucketName string, prefix string) (int64, error) {
	result := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", bucketName, false).
		Where(objectKeyPrefixLikeClause, likePrefixPattern(prefix)).
		Updates(map[string]any{
			"is_deleted": true,
			"updated_at": time.Now().UTC(),
		})
	return result.RowsAffected, result.Error
}

func likePrefixPattern(prefix string) string {
	return escapeLikeValue(prefix) + "%"
}

func escapeLikeValue(value string) string {
	replacer := strings.NewReplacer(
		"!", "!!",
		"%", "!%",
		"_", "!_",
	)
	return replacer.Replace(value)
}

func applyObjectKeyPrefixFilter(query *gorm.DB, prefix string) *gorm.DB {
	if prefix == "" {
		return query
	}

	return query.Where(objectKeyPrefixLikeClause, likePrefixPattern(prefix))
}

func (r *ObjectRepository) UpdateVisibility(
	ctx context.Context,
	bucketName string,
	objectKey string,
	visibility model.Visibility,
) (*model.Object, error) {
	result := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND object_key = ? AND is_deleted = ?", bucketName, objectKey, false).
		Updates(map[string]any{
			"visibility": visibility,
			"updated_at": time.Now().UTC(),
		})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	return r.FindActive(ctx, bucketName, objectKey)
}
