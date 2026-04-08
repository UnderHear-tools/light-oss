package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"path"
	"sort"
	"strings"

	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
)

const (
	folderMarkerFilename = ".light-oss-folder"
	defaultExplorerLimit = 100
	maxExplorerLimit     = 200
)

type FolderNode struct {
	Path       string
	Name       string
	ParentPath string
}

type ExplorerEntryType string

const (
	ExplorerEntryTypeDirectory ExplorerEntryType = "directory"
	ExplorerEntryTypeFile      ExplorerEntryType = "file"
)

type ExplorerEntry struct {
	Type    ExplorerEntryType
	Path    string
	Name    string
	IsEmpty bool
	Object  *model.Object
}

type ListExplorerEntriesInput struct {
	BucketName string
	Prefix     string
	Search     string
	Limit      int
	Cursor     string
}

type ListExplorerEntriesOutput struct {
	Items      []ExplorerEntry
	NextCursor string
}

type CreateFolderInput struct {
	BucketName string
	Prefix     string
	Name       string
}

func (s *ObjectService) ListFolders(ctx context.Context, bucketName string) ([]FolderNode, error) {
	if err := ValidateBucketName(bucketName); err != nil {
		return nil, err
	}
	if err := s.ensureBucketExists(ctx, bucketName); err != nil {
		return nil, err
	}

	keys, err := s.objectRepo.ListActiveKeys(ctx, bucketName)
	if err != nil {
		return nil, apperrors.Wrap(500, "folder_list_failed", "failed to list folders", err)
	}

	folderMap := map[string]FolderNode{}
	for _, key := range keys {
		folderPath := folderPathFromObjectKey(key)
		if folderPath == "" {
			continue
		}
		addFolderHierarchy(folderMap, folderPath)
	}

	items := make([]FolderNode, 0, len(folderMap))
	for _, node := range folderMap {
		items = append(items, node)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Path < items[j].Path
	})

	return items, nil
}

func (s *ObjectService) ListExplorerEntries(ctx context.Context, input ListExplorerEntriesInput) (*ListExplorerEntriesOutput, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateFolderPrefix(input.Prefix); err != nil {
		return nil, err
	}
	if err := s.ensureBucketExists(ctx, input.BucketName); err != nil {
		return nil, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = defaultExplorerLimit
	}
	if limit > maxExplorerLimit {
		limit = maxExplorerLimit
	}

	cursor, err := decodeExplorerCursor(input.Cursor)
	if err != nil {
		return nil, apperrors.New(400, "invalid_cursor", "cursor is invalid")
	}

	objects, err := s.objectRepo.ListActiveByPrefixOrdered(ctx, input.BucketName, input.Prefix)
	if err != nil {
		return nil, apperrors.Wrap(500, "explorer_list_failed", "failed to list explorer entries", err)
	}

	directories := map[string]ExplorerEntry{}
	files := map[string]ExplorerEntry{}
	search := strings.ToLower(strings.TrimSpace(input.Search))

	for _, object := range objects {
		relative := strings.TrimPrefix(object.ObjectKey, input.Prefix)
		if relative == "" {
			continue
		}

		segments := strings.Split(relative, "/")
		if len(segments) == 1 {
			if isFolderMarkerKey(object.ObjectKey) {
				continue
			}

			name := segments[0]
			files[name] = ExplorerEntry{
				Type:   ExplorerEntryTypeFile,
				Path:   object.ObjectKey,
				Name:   name,
				Object: cloneObject(object),
			}
			continue
		}

		name := segments[0]
		entry := directories[name]
		entry.Type = ExplorerEntryTypeDirectory
		entry.Name = name
		entry.Path = input.Prefix + name + "/"
		entry.IsEmpty = entry.IsEmpty || len(segments) == 0
		if len(segments) == 2 && segments[1] == folderMarkerFilename {
			if _, exists := directories[name]; !exists {
				entry.IsEmpty = true
			}
		} else {
			entry.IsEmpty = false
		}
		directories[name] = entry
	}

	entries := make([]ExplorerEntry, 0, len(directories)+len(files))
	for _, entry := range directories {
		if matchesExplorerSearch(entry.Name, search) {
			entries = append(entries, entry)
		}
	}
	for _, entry := range files {
		if matchesExplorerSearch(entry.Name, search) {
			entries = append(entries, entry)
		}
	}

	sort.Slice(entries, func(i, j int) bool {
		return compareExplorerEntries(entries[i], entries[j]) < 0
	})

	start := 0
	if cursor != nil {
		for index, entry := range entries {
			if compareExplorerEntries(
				entry,
				ExplorerEntry{Type: cursor.Type, Name: cursor.Name},
			) > 0 {
				start = index
				break
			}
			start = len(entries)
		}
	}

	if start > len(entries) {
		start = len(entries)
	}

	entries = entries[start:]
	nextCursor := ""
	if len(entries) > limit {
		last := entries[limit-1]
		nextCursor = encodeExplorerCursor(last.Type, last.Name)
		entries = entries[:limit]
	}

	return &ListExplorerEntriesOutput{
		Items:      entries,
		NextCursor: nextCursor,
	}, nil
}

func (s *ObjectService) CreateFolder(ctx context.Context, input CreateFolderInput) (*FolderNode, error) {
	if err := ValidateBucketName(input.BucketName); err != nil {
		return nil, err
	}
	if err := ValidateFolderPrefix(input.Prefix); err != nil {
		return nil, err
	}
	if err := ValidateFolderName(input.Name); err != nil {
		return nil, err
	}

	exists, err := s.bucketRepo.Exists(ctx, input.BucketName)
	if err != nil {
		return nil, apperrors.Wrap(500, "bucket_lookup_failed", "failed to look up bucket", err)
	}
	if !exists {
		return nil, apperrors.New(404, "bucket_not_found", "bucket not found")
	}

	if input.Prefix != "" {
		parentExists, err := s.objectRepo.ExistsActiveWithPrefix(ctx, input.BucketName, input.Prefix)
		if err != nil {
			return nil, apperrors.Wrap(500, "folder_lookup_failed", "failed to look up parent folder", err)
		}
		if !parentExists {
			return nil, apperrors.New(404, "folder_not_found", "folder not found")
		}
	}

	folderPath := input.Prefix + input.Name + "/"
	folderExists, err := s.objectRepo.ExistsActiveWithPrefix(ctx, input.BucketName, folderPath)
	if err != nil {
		return nil, apperrors.Wrap(500, "folder_lookup_failed", "failed to look up folder", err)
	}
	if folderExists {
		return nil, apperrors.New(409, "folder_exists", "folder already exists")
	}

	markerKey := folderPath + folderMarkerFilename
	if _, err := s.createInternalObject(ctx, internalObjectInput{
		BucketName:       input.BucketName,
		ObjectKey:        markerKey,
		OriginalFilename: folderMarkerFilename,
		ContentType:      "application/x-directory",
		Visibility:       model.VisibilityPrivate,
	}); err != nil {
		return nil, err
	}

	return &FolderNode{
		Path:       folderPath,
		Name:       input.Name,
		ParentPath: input.Prefix,
	}, nil
}

func (s *ObjectService) DeleteFolder(ctx context.Context, bucketName string, folderPath string, recursive bool) error {
	if err := ValidateBucketName(bucketName); err != nil {
		return err
	}
	if err := ValidateFolderPath(folderPath); err != nil {
		return err
	}

	exists, err := s.objectRepo.ExistsActiveWithPrefix(ctx, bucketName, folderPath)
	if err != nil {
		return apperrors.Wrap(500, "folder_lookup_failed", "failed to look up folder", err)
	}
	if !exists {
		return apperrors.New(404, "folder_not_found", "folder not found")
	}

	if recursive {
		deleted, err := s.objectRepo.SoftDeleteByPrefix(ctx, bucketName, folderPath)
		if err != nil {
			return apperrors.Wrap(500, "folder_delete_failed", "failed to delete folder", err)
		}
		if deleted == 0 {
			return apperrors.New(404, "folder_not_found", "folder not found")
		}

		return nil
	}

	markerKey := folderPath + folderMarkerFilename
	hasOtherItems, err := s.objectRepo.ExistsActiveWithPrefixExceptKey(ctx, bucketName, folderPath, markerKey)
	if err != nil {
		return apperrors.Wrap(500, "folder_lookup_failed", "failed to inspect folder", err)
	}
	if hasOtherItems {
		return apperrors.New(409, "folder_not_empty", "folder is not empty")
	}

	deleted, err := s.objectRepo.SoftDelete(ctx, bucketName, markerKey)
	if err != nil {
		return apperrors.Wrap(500, "folder_delete_failed", "failed to delete folder", err)
	}
	if !deleted {
		return apperrors.New(404, "folder_not_found", "folder not found")
	}

	return nil
}

type internalObjectInput struct {
	BucketName       string
	ObjectKey        string
	OriginalFilename string
	ContentType      string
	Visibility       model.Visibility
}

func (s *ObjectService) createInternalObject(ctx context.Context, input internalObjectInput) (*model.Object, error) {
	stored, err := s.storage.Save(ctx, strings.NewReader(""))
	if err != nil {
		return nil, apperrors.Wrap(500, "object_store_failed", "failed to store object", err)
	}

	object := &model.Object{
		BucketName:       input.BucketName,
		ObjectKey:        input.ObjectKey,
		OriginalFilename: input.OriginalFilename,
		StoragePath:      stored.RelativePath,
		Size:             stored.Size,
		ContentType:      input.ContentType,
		ETag:             stored.ETag,
		Visibility:       input.Visibility,
		IsDeleted:        false,
	}

	saved, err := s.objectRepo.Upsert(ctx, object)
	if err != nil {
		_ = s.storage.Delete(stored.RelativePath)
		if isForeignKeyError(err) {
			return nil, apperrors.New(http.StatusNotFound, "bucket_not_found", "bucket not found")
		}

		return nil, apperrors.Wrap(500, "object_metadata_failed", "failed to save object metadata", err)
	}

	return saved, nil
}

type explorerCursor struct {
	Type ExplorerEntryType
	Name string
}

func encodeExplorerCursor(entryType ExplorerEntryType, name string) string {
	raw := fmt.Sprintf("%s|%s", entryType, name)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeExplorerCursor(value string) (*explorerCursor, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}

	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid cursor")
	}

	entryType := ExplorerEntryType(parts[0])
	if entryType != ExplorerEntryTypeDirectory && entryType != ExplorerEntryTypeFile {
		return nil, fmt.Errorf("invalid cursor")
	}

	return &explorerCursor{
		Type: entryType,
		Name: parts[1],
	}, nil
}

func compareExplorerEntries(left ExplorerEntry, right ExplorerEntry) int {
	if explorerTypeOrder(left.Type) != explorerTypeOrder(right.Type) {
		return explorerTypeOrder(left.Type) - explorerTypeOrder(right.Type)
	}

	leftName := strings.ToLower(left.Name)
	rightName := strings.ToLower(right.Name)
	if leftName != rightName {
		if leftName < rightName {
			return -1
		}
		return 1
	}

	return strings.Compare(left.Name, right.Name)
}

func explorerTypeOrder(entryType ExplorerEntryType) int {
	if entryType == ExplorerEntryTypeDirectory {
		return 0
	}
	return 1
}

func matchesExplorerSearch(name string, search string) bool {
	if search == "" {
		return true
	}

	return strings.Contains(strings.ToLower(name), search)
}

func folderPathFromObjectKey(key string) string {
	dir := path.Dir(key)
	if dir == "." || dir == "/" {
		return ""
	}

	return strings.TrimPrefix(dir, "/") + "/"
}

func addFolderHierarchy(folderMap map[string]FolderNode, folderPath string) {
	trimmed := strings.TrimSuffix(folderPath, "/")
	if trimmed == "" {
		return
	}

	parts := strings.Split(trimmed, "/")
	current := ""
	for _, part := range parts {
		if current == "" {
			current = part + "/"
		} else {
			current += part + "/"
		}

		if _, exists := folderMap[current]; exists {
			continue
		}

		folderMap[current] = FolderNode{
			Path:       current,
			Name:       part,
			ParentPath: parentFolderPath(current),
		}
	}
}

func parentFolderPath(folderPath string) string {
	trimmed := strings.TrimSuffix(folderPath, "/")
	if trimmed == "" || !strings.Contains(trimmed, "/") {
		return ""
	}

	parent := path.Dir(trimmed)
	if parent == "." || parent == "/" {
		return ""
	}

	return strings.TrimPrefix(parent, "/") + "/"
}

func isFolderMarkerKey(key string) bool {
	return path.Base(key) == folderMarkerFilename
}

func cloneObject(object model.Object) *model.Object {
	copy := object
	return &copy
}
