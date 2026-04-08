package repository

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"light-oss/backend/internal/model"
)

type BucketRepository struct {
	db *gorm.DB
}

func NewBucketRepository(db *gorm.DB) *BucketRepository {
	return &BucketRepository{db: db}
}

func (r *BucketRepository) WithDB(db *gorm.DB) *BucketRepository {
	if db == nil {
		return r
	}

	return &BucketRepository{db: db}
}

func (r *BucketRepository) Create(ctx context.Context, bucket *model.Bucket) error {
	return r.db.WithContext(ctx).Create(bucket).Error
}

func (r *BucketRepository) List(ctx context.Context) ([]model.Bucket, error) {
	var buckets []model.Bucket
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&buckets).Error
	return buckets, err
}

func (r *BucketRepository) Exists(ctx context.Context, name string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Bucket{}).Where("name = ?", name).Count(&count).Error
	return count > 0, err
}

func (r *BucketRepository) LockByName(ctx context.Context, name string) (*model.Bucket, error) {
	var bucket model.Bucket
	err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("name = ?", name).
		First(&bucket).Error
	if err != nil {
		return nil, err
	}

	return &bucket, nil
}

func (r *BucketRepository) DeleteByName(ctx context.Context, name string) (bool, error) {
	result := r.db.WithContext(ctx).Where("name = ?", name).Delete(&model.Bucket{})
	return result.RowsAffected > 0, result.Error
}
