import { ConfigService } from '@nestjs/config';
export declare class CryptoService {
    private readonly cs;
    private readonly tokenEncryptionKey;
    private readonly algorithm;
    private readonly key;
    constructor(cs: ConfigService);
    encrypt(text: string): string;
    decrypt(encrypted: string): string;
}
