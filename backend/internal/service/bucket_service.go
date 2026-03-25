package service

import (
	"context"
	"errors"
	"net/http"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
)

type BucketService struct {
	bucketRepo *repository.BucketRepository
}

func NewBucketService(bucketRepo *repository.BucketRepository) *BucketService {
	return &BucketService{bucketRepo: bucketRepo}
}

func (s *BucketService) Create(ctx context.Context, name string) (*model.Bucket, error) {
	if err := ValidateBucketName(name); err != nil {
		return nil, err
	}

	bucket := &model.Bucket{Name: name}
	if err := s.bucketRepo.Create(ctx, bucket); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) || isDuplicateError(err) {
			return nil, apperrors.New(http.StatusConflict, "bucket_exists", "bucket already exists")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "bucket_create_failed", "failed to create bucket", err)
	}

	return bucket, nil
}

func (s *BucketService) List(ctx context.Context) ([]model.Bucket, error) {
	buckets, err := s.bucketRepo.List(ctx)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "bucket_list_failed", "failed to list buckets", err)
	}

	return buckets, nil
}
