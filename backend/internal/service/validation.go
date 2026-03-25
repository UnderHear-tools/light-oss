package service

import (
	"net/http"
	"path"
	"regexp"
	"strings"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
)

var bucketNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

func ValidateBucketName(name string) error {
	if !bucketNamePattern.MatchString(name) {
		return apperrors.New(http.StatusBadRequest, "invalid_bucket_name", "bucket name must match lowercase letters, digits, dot or hyphen")
	}

	return nil
}

func ValidateObjectKey(key string) error {
	if strings.TrimSpace(key) == "" || len(key) > 512 {
		return apperrors.New(http.StatusBadRequest, "invalid_object_key", "object key is required and must be at most 512 characters")
	}
	if strings.Contains(key, "\x00") || strings.Contains(key, "\\") {
		return apperrors.New(http.StatusBadRequest, "invalid_object_key", "object key contains invalid characters")
	}

	cleaned := path.Clean("/" + key)
	if cleaned == "/" || strings.Contains(cleaned, "..") {
		return apperrors.New(http.StatusBadRequest, "invalid_object_key", "object key must not contain path traversal")
	}

	segments := strings.Split(key, "/")
	for _, segment := range segments {
		if segment == "" || segment == "." || segment == ".." {
			return apperrors.New(http.StatusBadRequest, "invalid_object_key", "object key contains invalid path segments")
		}
	}

	return nil
}

func ValidatePrefix(prefix string) error {
	if len(prefix) > 512 || strings.Contains(prefix, "\x00") || strings.Contains(prefix, "\\") {
		return apperrors.New(http.StatusBadRequest, "invalid_prefix", "prefix is invalid")
	}

	return nil
}

func ParseVisibility(value string) (model.Visibility, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case string(model.VisibilityPublic):
		return model.VisibilityPublic, nil
	case "", string(model.VisibilityPrivate):
		return model.VisibilityPrivate, nil
	default:
		return "", apperrors.New(http.StatusBadRequest, "invalid_visibility", "visibility must be public or private")
	}
}

func SanitizeOriginalFilename(name string) string {
	candidate := path.Base(strings.ReplaceAll(strings.TrimSpace(name), "\\", "/"))
	if candidate == "." || candidate == "/" || candidate == "" {
		return "upload.bin"
	}
	if len(candidate) > 255 {
		return candidate[:255]
	}

	return candidate
}

func isDuplicateError(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "duplicate")
}
