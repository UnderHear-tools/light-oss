package service

import (
	"context"
	"net/http"
	"strings"

	apperrors "light-oss/backend/internal/pkg/errors"
)

const (
	ExplorerBatchDeleteTypeFile      = "file"
	ExplorerBatchDeleteTypeDirectory = "directory"
)

type DeleteExplorerEntriesBatchItemInput struct {
	Type string
	Path string
}

type DeleteExplorerEntriesBatchFailedItem struct {
	Type    string
	Path    string
	Code    string
	Message string
}

type DeleteExplorerEntriesBatchOutput struct {
	DeletedCount int
	FailedCount  int
	FailedItems  []DeleteExplorerEntriesBatchFailedItem
}

func (s *ObjectService) DeleteExplorerEntriesBatch(
	ctx context.Context,
	bucketName string,
	items []DeleteExplorerEntriesBatchItemInput,
) (*DeleteExplorerEntriesBatchOutput, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := s.ensureBucketExists(ctx, bucketName); err != nil {
		return nil, err
	}

	normalizedItems, err := validateDeleteExplorerEntriesBatchItems(items)
	if err != nil {
		return nil, err
	}

	result := &DeleteExplorerEntriesBatchOutput{
		FailedItems: make([]DeleteExplorerEntriesBatchFailedItem, 0),
	}
	successfulItems := make([]DeleteExplorerEntriesBatchItemInput, 0, len(normalizedItems))

	for _, item := range normalizedItems {
		var deleteErr error
		switch item.Type {
		case ExplorerBatchDeleteTypeFile:
			deleteErr = s.Delete(ctx, bucketName, item.Path)
		case ExplorerBatchDeleteTypeDirectory:
			deleteErr = s.DeleteFolder(ctx, bucketName, item.Path, true)
		default:
			deleteErr = apperrors.New(http.StatusBadRequest, "invalid_request", "entry type is invalid")
		}

		if deleteErr == nil || isCoveredDeleteExplorerEntriesBatchNotFound(item, deleteErr, successfulItems) {
			result.DeletedCount++
			successfulItems = append(successfulItems, item)
			continue
		}

		appErr := apperrors.From(deleteErr)
		result.FailedItems = append(result.FailedItems, DeleteExplorerEntriesBatchFailedItem{
			Type:    item.Type,
			Path:    item.Path,
			Code:    appErr.Code,
			Message: appErr.Message,
		})
	}

	result.FailedCount = len(result.FailedItems)
	return result, nil
}

func validateDeleteExplorerEntriesBatchItems(
	items []DeleteExplorerEntriesBatchItemInput,
) ([]DeleteExplorerEntriesBatchItemInput, error) {
	if len(items) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "items must contain at least one entry")
	}
	if len(items) > maxExplorerLimit {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "items must contain at most 200 entries")
	}

	normalized := make([]DeleteExplorerEntriesBatchItemInput, 0, len(items))
	for _, item := range items {
		entryType := strings.TrimSpace(item.Type)
		entryPath := strings.TrimSpace(item.Path)

		switch entryType {
		case ExplorerBatchDeleteTypeFile:
			if strings.HasSuffix(entryPath, "/") {
				return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "file path must not end with /")
			}
			if err := ValidateUserObjectKey(entryPath); err != nil {
				return nil, apperrors.New(http.StatusBadRequest, "invalid_request", apperrors.From(err).Message)
			}
		case ExplorerBatchDeleteTypeDirectory:
			if !strings.HasSuffix(entryPath, "/") {
				return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "directory path must end with /")
			}
			if err := ValidateFolderPath(entryPath); err != nil {
				return nil, apperrors.New(http.StatusBadRequest, "invalid_request", apperrors.From(err).Message)
			}
		default:
			return nil, apperrors.New(http.StatusBadRequest, "invalid_request", "entry type must be file or directory")
		}

		normalized = append(normalized, DeleteExplorerEntriesBatchItemInput{
			Type: entryType,
			Path: entryPath,
		})
	}

	return normalized, nil
}

func isCoveredDeleteExplorerEntriesBatchNotFound(
	item DeleteExplorerEntriesBatchItemInput,
	err error,
	items []DeleteExplorerEntriesBatchItemInput,
) bool {
	appErr := apperrors.From(err)
	if appErr.Code != "object_not_found" && appErr.Code != "folder_not_found" {
		return false
	}

	for _, successfulItem := range items {
		if successfulItem.Path == item.Path {
			return true
		}

		if successfulItem.Type == ExplorerBatchDeleteTypeDirectory &&
			strings.HasPrefix(item.Path, successfulItem.Path) {
			return true
		}

		if item.Type == ExplorerBatchDeleteTypeDirectory &&
			strings.HasPrefix(successfulItem.Path, item.Path) {
			return true
		}
	}

	return false
}
