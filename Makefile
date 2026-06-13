.PHONY: dev stop test test-backend test-frontend lint lint-backend lint-frontend ci clean

# ── Local development ──────────────────────────────────────
dev:
	./scripts/start-local.sh

stop:
	docker compose down

# ── Testing ────────────────────────────────────────────────
test-backend:
	cd backend && python -m pytest tests/ -v --tb=short

test-frontend:
	cd frontend && npm test -- --run

test: test-backend test-frontend

# ── Linting ────────────────────────────────────────────────
lint-backend:
	cd backend && ruff check .

lint-frontend:
	cd frontend && npm run lint

lint: lint-backend lint-frontend

# ── Full CI check (run before pushing) ─────────────────────
ci: lint test
	@echo ""
	@echo "All CI checks passed."

# ── Cleanup ────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/coverage frontend/dist
