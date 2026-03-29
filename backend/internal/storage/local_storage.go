package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
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

type TempFileWriter struct {
	file   *os.File
	hasher hash.Hash
	size   int64
}

func NewLocalStorage(root string) *LocalStorage {
	return &LocalStorage{root: root}
}

func (s *LocalStorage) Save(ctx context.Context, reader io.Reader) (*StoredFile, error) {
	tempWriter, err := s.CreateTempWriter("upload")
	if err != nil {
		return nil, err
	}

	size, err := io.Copy(tempWriter, reader)
	if err != nil {
		_ = tempWriter.Abort()
		return nil, err
	}

	if err := tempWriter.Close(); err != nil {
		_ = tempWriter.Abort()
		return nil, err
	}
	tempPath := tempWriter.TempPath()
	etag := tempWriter.ETag()

	select {
	case <-ctx.Done():
		_ = os.Remove(tempPath)
		return nil, ctx.Err()
	default:
	}

	relativePath := randomManagedPath("objects", ".bin")
	if err := s.AdoptTempFile(tempPath, relativePath); err != nil {
		_ = os.Remove(tempPath)
		return nil, err
	}

	return &StoredFile{
		RelativePath: relativePath,
		Size:         size,
		ETag:         etag,
	}, nil
}

func (s *LocalStorage) CreateTempWriter(prefix string) (*TempFileWriter, error) {
	tmpDir := filepath.Join(s.root, "tmp")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return nil, err
	}

	file, err := os.CreateTemp(tmpDir, prefix+"-*.tmp")
	if err != nil {
		return nil, err
	}

	return &TempFileWriter{
		file:   file,
		hasher: sha256.New(),
	}, nil
}

func (s *LocalStorage) AdoptTempFile(tempPath string, relativePath string) error {
	if hasTraversal(relativePath) {
		return fmt.Errorf("invalid storage path")
	}

	finalPath := filepath.Join(s.root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		return err
	}

	return os.Rename(tempPath, finalPath)
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

func randomManagedPath(namespace string, extension string) string {
	fileID := strings.ReplaceAll(uuid.NewString(), "-", "")
	return filepath.ToSlash(filepath.Join(namespace, fileID[0:2], fileID[2:4], fileID+extension))
}

func (w *TempFileWriter) Write(p []byte) (int, error) {
	n, err := w.file.Write(p)
	if n > 0 {
		_, _ = w.hasher.Write(p[:n])
		w.size += int64(n)
	}

	return n, err
}

func (w *TempFileWriter) Close() error {
	if err := w.file.Sync(); err != nil {
		_ = w.file.Close()
		return err
	}

	return w.file.Close()
}

func (w *TempFileWriter) Abort() error {
	path := w.file.Name()
	if err := w.file.Close(); err != nil {
		_ = os.Remove(path)
		return err
	}

	return os.Remove(path)
}

func (w *TempFileWriter) TempPath() string {
	return w.file.Name()
}

func (w *TempFileWriter) Size() int64 {
	return w.size
}

func (w *TempFileWriter) ETag() string {
	return hex.EncodeToString(w.hasher.Sum(nil))
}
