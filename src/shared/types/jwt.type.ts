export interface TokenPayload {
  id: number;
  email: string;
  name: string;
  roleId: string;
  iat?: number;
  exp?: number;
}
