BACKEND_DIR=backend
FRONTEND_DIR=frontend

.PHONY: up down backend-test frontend-test test lint fmt frontend-install

up:
	docker compose up --build

down:
	docker compose down -v

backend-test:
	cd $(BACKEND_DIR) && go test ./...

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend-test:
	cd $(FRONTEND_DIR) && npm test

test: backend-test frontend-test

lint:
	cd $(FRONTEND_DIR) && npm run lint

fmt:
	cd $(BACKEND_DIR) && gofmt -w $$(find . -name '*.go')
	cd $(FRONTEND_DIR) && npm run format
