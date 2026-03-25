package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type StoredFile struct {
	RelativePath string
	Size         int64
	ETag         string
}

type LocalStorage struct {
	root string
}

func NewLocalStorage(root string) *LocalStorage {
	return &LocalStorage{root: root}
}

func (s *LocalStorage) Save(ctx context.Context, reader io.Reader) (*StoredFile, error) {
	tmpDir := filepath.Join(s.root, "tmp")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return nil, err
	}

	tmpFile, err := os.CreateTemp(tmpDir, "upload-*.tmp")
	if err != nil {
		return nil, err
	}

	tmpPath := tmpFile.Name()
	hasher := sha256.New()
	size, err := io.Copy(io.MultiWriter(tmpFile, hasher), reader)
	if err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return nil, err
	}

	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return nil, err
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}

	select {
	case <-ctx.Done():
		_ = os.Remove(tmpPath)
		return nil, ctx.Err()
	default:
	}

	fileID := strings.ReplaceAll(uuid.NewString(), "-", "")
	relativePath := filepath.Join(fileID[0:2], fileID[2:4], fileID+".bin")
	finalPath := filepath.Join(s.root, relativePath)
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}

	return &StoredFile{
		RelativePath: filepath.ToSlash(relativePath),
		Size:         size,
		ETag:         hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

func (s *LocalStorage) Open(relativePath string) (io.ReadCloser, error) {
	if hasTraversal(relativePath) {
		return nil, fmt.Errorf("invalid storage path")
	}

	return os.Open(filepath.Join(s.root, filepath.FromSlash(relativePath)))
}

func (s *LocalStorage) Delete(relativePath string) error {
	if hasTraversal(relativePath) {
		return fmt.Errorf("invalid storage path")
	}

	err := os.Remove(filepath.Join(s.root, filepath.FromSlash(relativePath)))
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

func hasTraversal(relativePath string) bool {
	cleaned := filepath.Clean(relativePath)
	return filepath.IsAbs(cleaned) || cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator))
}
