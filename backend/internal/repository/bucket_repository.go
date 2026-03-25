package repository

import (
	"context"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
)

type BucketRepository struct {
	db *gorm.DB
}

func NewBucketRepository(db *gorm.DB) *BucketRepository {
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
