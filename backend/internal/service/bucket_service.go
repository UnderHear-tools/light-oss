package service

import (
	"context"
	"errors"
	"net/http"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/storage"
)

type BucketService struct {
	bucketRepo *repository.BucketRepository
	objectRepo *repository.ObjectRepository
	siteRepo   *repository.SiteRepository
	storage    *storage.LocalStorage
	gormDB     *gorm.DB
	logger     *zap.Logger
}

func NewBucketService(
	logger *zap.Logger,
	gormDB *gorm.DB,
	bucketRepo *repository.BucketRepository,
	objectRepo *repository.ObjectRepository,
	siteRepo *repository.SiteRepository,
	localStorage *storage.LocalStorage,
) *BucketService {
	return &BucketService{
		bucketRepo: bucketRepo,
		objectRepo: objectRepo,
		siteRepo:   siteRepo,
		storage:    localStorage,
		gormDB:     gormDB,
		logger:     logger,
	}
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

func (s *BucketService) List(ctx context.Context, search string) ([]model.Bucket, error) {
	buckets, err := s.bucketRepo.List(ctx, search)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "bucket_list_failed", "failed to list buckets", err)
	}

	return buckets, nil
}

func (s *BucketService) Delete(ctx context.Context, name string) error {
	if err := ValidateBucketName(name); err != nil {
		return err
	}

	storagePaths := make([]string, 0)

	err := s.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		bucketRepo := s.bucketRepo.WithDB(tx)
		objectRepo := s.objectRepo.WithDB(tx)
		siteRepo := s.siteRepo.WithDB(tx)

		if _, err := bucketRepo.LockByName(ctx, name); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}

			return apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to lock bucket", err)
		}

		objects, err := objectRepo.ListAllByBucket(ctx, name)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to load bucket objects", err)
		}

		seenStoragePaths := make(map[string]struct{}, len(objects))
		for _, object := range objects {
			if object.StoragePath == "" {
				continue
			}
			if _, exists := seenStoragePaths[object.StoragePath]; exists {
				continue
			}

			seenStoragePaths[object.StoragePath] = struct{}{}
			storagePaths = append(storagePaths, object.StoragePath)
		}

		if err := siteRepo.DeleteByBucket(ctx, name); err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "bucket_delete_failed", "failed to delete bucket sites", err)
		}
		if err := objectRepo.HardDeleteByBucket(ctx, name); err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "bucket_delete_failed", "failed to delete bucket objects", err)
		}

		deleted, err := bucketRepo.DeleteByName(ctx, name)
		if err != nil {
			return apperrors.Wrap(http.StatusInternalServerError, "bucket_delete_failed", "failed to delete bucket", err)
		}
		if !deleted {
			return gorm.ErrRecordNotFound
		}

		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}
		if appErr := apperrors.From(err); appErr.Code != "internal_error" {
			return err
		}

		return apperrors.Wrap(http.StatusInternalServerError, "bucket_delete_failed", "failed to delete bucket", err)
	}

	for _, storagePath := range storagePaths {
		if err := s.storage.Delete(storagePath); err != nil {
			s.logger.Warn("delete bucket storage file failed", zap.String("bucket", name), zap.String("storage_path", storagePath), zap.Error(err))
		}
	}

	return nil
}
