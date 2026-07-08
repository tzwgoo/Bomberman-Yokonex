declare module "sm-crypto" {
  const smCrypto: {
    sm4: {
      encrypt(input: string | number[], key: string | number[], options?: { mode?: "cbc"; iv?: string | number[]; padding?: string; output?: string }): string | number[];
      decrypt(input: string | number[], key: string | number[], options?: { mode?: "cbc"; iv?: string | number[]; padding?: string; output?: string }): string | number[];
    };
  };
  export default smCrypto;
  export const sm4: typeof smCrypto.sm4;
}
