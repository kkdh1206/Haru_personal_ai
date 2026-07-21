"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const firebase = __importStar(require("firebase-admin"));
const serviceAccount = __importStar(require("../firebase-adminsdk.json"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = require("path");
const promises_1 = require("fs/promises");
const firebaseParams = {
    type: serviceAccount.type,
    projectId: serviceAccount.project_id,
    privateKeyId: serviceAccount.private_key_id,
    privateKey: serviceAccount.private_key,
    clientEmail: serviceAccount.client_email,
    clientId: serviceAccount.client_id,
    authUri: serviceAccount.auth_uri,
    tokenUri: serviceAccount.token_uri,
    authProviderX509CertUrl: serviceAccount.auth_provider_x509_cert_url,
    clientX509CertUrl: serviceAccount.client_x509_cert_url,
};
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use((0, cookie_parser_1.default)());
    app.setBaseViewsDir((0, path_1.join)(__dirname, '..', 'views'));
    app.setViewEngine('hbs');
    app
        .getHttpAdapter()
        .getInstance()
        .engine('hbs', async (filePath, options, callback) => {
        try {
            let html = await (0, promises_1.readFile)(filePath, 'utf8');
            Object.entries(options).forEach(([key, value]) => {
                if (typeof value !== 'string' && typeof value !== 'number')
                    return;
                html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
            });
            callback(null, html);
        }
        catch (error) {
            callback(error);
        }
    });
    const config = new swagger_1.DocumentBuilder()
        .setTitle('📱 AI Morning Call')
        .setDescription('`API` for **AI Morning Call**\n\n' +
        'Contact: wonbin9413@postech.ac.kr | kkdh1206@postech.ac.kr\n\n' +
        'Powered by PoApper, Inc.')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('docs', app, document);
    firebase.initializeApp({
        credential: firebase.credential.cert(firebaseParams),
    });
    await app.listen(3000);
}
bootstrap();
//# sourceMappingURL=main.js.map