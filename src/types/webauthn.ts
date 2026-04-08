export interface TOTPSetupData {
  account: string;
  issuer: string;
  qr_code: string;
  secret: string;
  manual_entry: string;
}
