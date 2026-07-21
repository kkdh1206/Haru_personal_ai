import { PromptService } from './prompt.service';
export declare class PromptController {
    private readonly promptService;
    constructor(promptService: PromptService);
    getPrompt(dto: {
        alarmId: string;
    }): Promise<string>;
}
