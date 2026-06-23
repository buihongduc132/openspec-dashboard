## 1. MFA scaffolding

- [ ] 1.1 Generate TOTP secret on enrollment
- [x] 1.2 Add `mfaEnrolled` flag to user record
- [ ] 1.3 Verify TOTP on login when enrolled
  - [ ] 1.3a Rate-limit failed TOTP attempts
  - [x] 1.3b Return 401 on invalid TOTP

## 2. Token rename

- [x] 2.1 Rename `Session Token` requirement to `Auth Token` in specs
- [ ] 2.2 Update API docs
