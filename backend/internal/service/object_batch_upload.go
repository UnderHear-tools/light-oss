package service

import (
	"context"
	"io"
	"net/http"
	"strings"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
)

type UploadObjectBatchItemInput struct {
	RelativePath     string
	OriginalFilename string
	ContentType      string
	Open             func() (io.ReadCloser, error)
}

type UploadObjectBatchInput struct {
	BucketName string
	Prefix     string
	Visibility string
	Items      []UploadObjectBatchItemInput
}

type UploadObjectBatchOutput struct {
	UploadedCount int
	Items         []model.Object
}

func (s *ObjectService) UploadBatch(
	ctx context.Context,
	input UploadObjectBatchInput,
) (*UploadObjectBatchOutput, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateFolderPrefix(input.Prefix); err != nil {
		return nil, err
	}
	if len(input.Items) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest must contain at least one file")
	}

	visibility, err := ParseVisibility(input.Visibility)
	if err != nil {
		return nil, err
	}

	exists, err := s.bucketRepo.Exists(ctx, input.BucketName)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to look up bucket", err)
	}
	if !exists {
		return nil, apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
	}

	uploadedItems := make([]model.Object, 0, len(input.Items))
	storedPaths := make([]string, 0, len(input.Items))
	seenObjectKeys := make(map[string]struct{}, len(input.Items))

	err = s.objectRepo.Transaction(ctx, func(repo *repository.ObjectRepository) error {
		for _, item := range input.Items {
			if err := ValidateUploadRelativePath(item.RelativePath); err != nil {
				return invalidBatchManifestError(err)
			}

			objectKey := input.Prefix + item.RelativePath
			if err := ValidateUserObjectKey(objectKey); err != nil {
				return invalidBatchManifestError(err)
			}
			if _, exists := seenObjectKeys[objectKey]; exists {
				return apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", "manifest contains duplicate object keys")
			}
			seenObjectKeys[objectKey] = struct{}{}

			reader, err := item.Open()
			if err != nil {
				return apperrors.Wrap(http.StatusInternalServerError, "batch_file_open_failed", "failed to open uploaded file", err)
			}

			stored, err := s.storage.Save(ctx, reader)
			closeErr := reader.Close()
			if err != nil {
				return apperrors.Wrap(http.StatusInternalServerError, "object_store_failed", "failed to store object", err)
			}
			if closeErr != nil {
				_ = s.storage.Delete(stored.RelativePath)
				return apperrors.Wrap(http.StatusInternalServerError, "batch_file_open_failed", "failed to close uploaded file", closeErr)
			}

			storedPaths = append(storedPaths, stored.RelativePath)

			object := &model.Object{
				BucketName:       input.BucketName,
				ObjectKey:        objectKey,
				OriginalFilename: SanitizeOriginalFilename(item.OriginalFilename),
				StoragePath:      stored.RelativePath,
				Size:             stored.Size,
				ContentType:      NormalizeContentType(item.ContentType),
				ETag:             stored.ETag,
				Visibility:       visibility,
				IsDeleted:        false,
			}

			saved, err := repo.Upsert(ctx, object)
			if err != nil {
				return apperrors.Wrap(http.StatusInternalServerError, "object_metadata_failed", "failed to save object metadata", err)
			}

			uploadedItems = append(uploadedItems, *saved)
		}

		return nil
	})
	if err != nil {
		for _, storedPath := range storedPaths {
			_ = s.storage.Delete(storedPath)
		}

		return nil, err
	}

	return &UploadObjectBatchOutput{
		UploadedCount: len(uploadedItems),
		Items:         uploadedItems,
	}, nil
}

func invalidBatchManifestError(err error) error {
	appErr := apperrors.From(err)
	message := strings.TrimSpace(appErr.Message)
	if message == "" {
		message = "manifest entry is invalid"
	}

	return apperrors.New(http.StatusBadRequest, "invalid_batch_manifest", message)
}
