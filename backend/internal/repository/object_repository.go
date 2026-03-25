package repository

import (
	"context"
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

func NewObjectRepository(db *gorm.DB) *ObjectRepository {
	return &ObjectRepository{db: db}
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

func (r *ObjectRepository) ListActive(ctx context.Context, params ListObjectsParams) ([]model.Object, error) {
	var objects []model.Object

	query := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND is_deleted = ?", params.BucketName, false)

	if params.Prefix != "" {
		query = query.Where("object_key LIKE ?", params.Prefix+"%")
	}
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

func (r *ObjectRepository) SoftDelete(ctx context.Context, bucketName string, objectKey string) (bool, error) {
	result := r.db.WithContext(ctx).Model(&model.Object{}).
		Where("bucket_name = ? AND object_key = ? AND is_deleted = ?", bucketName, objectKey, false).
		Updates(map[string]any{
			"is_deleted": true,
			"updated_at": time.Now().UTC(),
		})
	return result.RowsAffected > 0, result.Error
}
