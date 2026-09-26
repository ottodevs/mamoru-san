/** Minimal EIP-712 typed data shape, enough to serialize for scan-message. */
export interface Eip712TypedData {
  readonly domain: Record<string, unknown>;
  readonly types: Record<string, readonly { name: string; type: string }[]>;
  readonly primaryType: string;
  readonly message: Record<string, unknown>;
}
