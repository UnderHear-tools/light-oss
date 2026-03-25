package signing

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
)

type Signer struct {
	secret []byte
}

func NewSigner(secret string) *Signer {
	return &Signer{secret: []byte(secret)}
}

func (s *Signer) SignDownload(bucketName string, objectKey string, expiresAt int64) string {
	return s.sign("GET", bucketName, objectKey, expiresAt)
}

func (s *Signer) VerifyDownload(method string, bucketName string, objectKey string, expiresAt int64, provided string) bool {
	expected := s.sign(method, bucketName, objectKey, expiresAt)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func (s *Signer) sign(method string, bucketName string, objectKey string, expiresAt int64) string {
	payload := fmt.Sprintf("%s\n%s\n%s\n%d", method, bucketName, objectKey, expiresAt)
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}
