/**
 * Task 6.3 — Webhook integration (req 08.5): outbound HMAC + SSRF + retry,
 * inbound HMAC rotation + event-id dedup.
 *
 * Public surface for the webhooks subsystem.
 *
 * Spec source: req 08 §8.5 in `flow/requirements/08-integration-sync.md`.
 */
export {
  isEgressAllowed,
  type EgressAllowlist,
} from "./ssrf";
export {
  SIGNATURE_HEADER,
  signPayload,
  buildSignatureHeader,
  dispatchOutbound,
  type OutboundWebhook,
  type DispatchTransport,
  type SleepFn,
  type DispatchResult,
  type DispatchOptions,
} from "./outbound";
export {
  parseSignatureHeader,
  verifyInboundSignature,
  handleInboundEvent,
  type ActiveSecrets,
  type DedupStore,
  type InboundVerification,
  type InboundEventResult,
} from "./inbound";
