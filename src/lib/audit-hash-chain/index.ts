/**
 * Task 1.10 — Audit log hash-chain + chain verifier (NFR-10, D-ArchiveSeq).
 *
 * Public surface for the audit hash-chain primitive. See {@link ./audit-hash-chain}
 * for the full contract.
 */
export {
  GENESIS_HASH,
  canonical,
  computeEntryHash,
  appendEntry,
  verifyChain,
  type AuditEntry,
  type ChainedAuditEntry,
  type ChainError,
  type ChainErrorReason,
  type ChainVerifyResult,
} from "./audit-hash-chain";
