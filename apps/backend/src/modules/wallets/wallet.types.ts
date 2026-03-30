import type { WalletRecord } from "@mintbot/shared";

export interface StoredWalletRecord extends WalletRecord {
  encryptedPrivateKey: string;
}
