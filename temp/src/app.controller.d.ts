import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    getTerms(): {
        updatedAt: string;
    };
    getPrivacy(): {
        updatedAt: string;
    };
}
