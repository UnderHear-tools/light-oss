package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/repository"
	"light-oss/backend/internal/storage"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

type UploadObjectInput struct {
	BucketName       string
	ObjectKey        string
	Visibility       string
	OriginalFilename string
	ContentType      string
	Body             io.Reader
}

type ListObjectsInput struct {
	BucketName string
	Prefix     string
	Limit      int
	Cursor     string
}

type ListObjectsOutput struct {
	Items      []model.Object
	NextCursor string
}

type ObjectService struct {
	bucketRepo *repository.BucketRepository
	objectRepo *repository.ObjectRepository
	storage    *storage.LocalStorage
}

func NewObjectService(bucketRepo *repository.BucketRepository, objectRepo *repository.ObjectRepository, localStorage *storage.LocalStorage) *ObjectService {
	return &ObjectService{
		bucketRepo: bucketRepo,
		objectRepo: objectRepo,
		storage:    localStorage,
	}
}

func (s *ObjectService) Upload(ctx context.Context, input UploadObjectInput) (*model.Object, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateUserObjectKey(input.ObjectKey); err != nil {
		return nil, err
	}

	visibility, err := ParseVisibility(input.Visibility)
	if err != nil {
		return nil, err
	}

	if err := s.ensureBucketExists(ctx, input.BucketName); err != nil {
		return nil, err
	}

	stored, err := s.storage.Save(ctx, input.Body)
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_store_failed", "failed to store object", err)
	}

	object := &model.Object{
		BucketName:       input.BucketName,
		ObjectKey:        input.ObjectKey,
		OriginalFilename: SanitizeOriginalFilename(input.OriginalFilename),
		StoragePath:      stored.RelativePath,
		Size:             stored.Size,
		ContentType:      NormalizeContentType(input.ContentType),
		ETag:             stored.ETag,
		Visibility:       visibility,
		IsDeleted:        false,
	}

	saved, err := s.objectRepo.Upsert(ctx, object)
	if err != nil {
		_ = s.storage.Delete(stored.RelativePath)
		if isForeignKeyError(err) {
			return nil, apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_metadata_failed", "failed to save object metadata", err)
	}

	return saved, nil
}

func (s *ObjectService) Open(ctx context.Context, bucketName string, objectKey string) (*model.Object, io.ReadCloser, error) {
	object, err := s.GetMetadata(ctx, bucketName, objectKey)
	if err != nil {
		return nil, nil, err
	}

	reader, err := s.storage.Open(object.StoragePath)
	if err != nil {
		return nil, nil, apperrors.Wrap(http.StatusInternalServerError, "object_open_failed", "failed to open object content", err)
	}

	return object, reader, nil
}

func (s *ObjectService) GetMetadata(ctx context.Context, bucketName string, objectKey string) (*model.Object, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return nil, err
	}

	object, err := s.objectRepo.FindActive(ctx, bucketName, objectKey)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_lookup_failed", "failed to look up object", err)
	}

	return object, nil
}

func (s *ObjectService) List(ctx context.Context, input ListObjectsInput) (*ListObjectsOutput, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidatePrefix(input.Prefix); err != nil {
		return nil, err
	}
	if err := s.ensureBucketExists(ctx, input.BucketName); err != nil {
		return nil, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}

	cursor, err := decodeCursor(input.Cursor)
	if err != nil {
		return nil, apperrors.New(http.StatusBadRequest, "invalid_cursor", "cursor is invalid")
	}

	objects, err := s.objectRepo.ListActive(ctx, repository.ListObjectsParams{
		BucketName: input.BucketName,
		Prefix:     input.Prefix,
		Limit:      limit + 1,
		Cursor:     cursor,
	})
	if err != nil {
		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_list_failed", "failed to list objects", err)
	}

	nextCursor := ""
	if len(objects) > limit {
		last := objects[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		objects = objects[:limit]
	}

	return &ListObjectsOutput{
		Items:      objects,
		NextCursor: nextCursor,
	}, nil
}

func (s *ObjectService) Delete(ctx context.Context, bucketName string, objectKey string) error {
	if err := ValidateBucketName(bucketName); err != nil {
		return err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return err
	}

	deleted, err := s.objectRepo.SoftDelete(ctx, bucketName, objectKey)
	if err != nil {
		return apperrors.Wrap(http.StatusInternalServerError, "object_delete_failed", "failed to delete object", err)
	}
	if !deleted {
		return apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
	}

	return nil
}

func (s *ObjectService) UpdateVisibility(
	ctx context.Context,
	bucketName string,
	objectKey string,
	visibilityValue string,
) (*model.Object, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := ValidateObjectKey(objectKey); err != nil {
		return nil, err
	}

	visibility, err := ParseVisibility(visibilityValue)
	if err != nil {
		return nil, err
	}

	object, err := s.objectRepo.UpdateVisibility(ctx, bucketName, objectKey, visibility)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.New(http.StatusNotFound, "object_not_found", "object not found")
		}

		return nil, apperrors.Wrap(http.StatusInternalServerError, "object_update_failed", "failed to update object visibility", err)
	}

	return object, nil
}

func encodeCursor(createdAt time.Time, id uint64) string {
	raw := fmt.Sprintf("%d|%d", createdAt.UTC().UnixNano(), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(value string) (*repository.Cursor, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}

	parts := strings.Split(string(raw), "|")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid cursor")
	}

	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return nil, err
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return nil, err
	}

	return &repository.Cursor{
		CreatedAt: time.Unix(0, nanos).UTC(),
		ID:        id,
	}, nil
}

func NormalizeContentType(contentType string) string {
	trimmed := strings.TrimSpace(contentType)
	if trimmed == "" {
		return "application/octet-stream"
	}

	mediaType, params, err := mime.ParseMediaType(trimmed)
	if err != nil {
		return trimmed
	}
	if _, hasCharset := params["charset"]; hasCharset || !shouldAttachUTF8Charset(mediaType) {
		return trimmed
	}

	params["charset"] = "utf-8"
	normalized := mime.FormatMediaType(mediaType, params)
	if normalized == "" {
		return mediaType + "; charset=utf-8"
	}

	return normalized
}

func shouldAttachUTF8Charset(mediaType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(mediaType))
	if strings.HasPrefix(normalized, "text/") {
		return true
	}
	if strings.HasSuffix(normalized, "+json") || strings.HasSuffix(normalized, "+xml") {
		return true
	}

	switch normalized {
	case "application/json", "application/ld+json", "application/xml", "application/xhtml+xml", "image/svg+xml":
		return true
	default:
		return false
	}
}

func (s *ObjectService) ensureBucketExists(ctx context.Context, bucketName string) error {
	exists, err := s.bucketRepo.Exists(ctx, bucketName)
	if err != nil {
		return apperrors.Wrap(http.StatusInternalServerError, "bucket_lookup_failed", "failed to look up bucket", err)
	}
	if !exists {
		return apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
	}

	return nil
}
