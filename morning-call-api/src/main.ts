import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as firebase from 'firebase-admin';
import * as serviceAccount from '../firebase-adminsdk.json';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { readFile } from 'fs/promises';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  app
    .getHttpAdapter()
    .getInstance()
    .engine('hbs', async (filePath, options, callback) => {
      try {
        let html = await readFile(filePath, 'utf8');
        Object.entries(options).forEach(([key, value]) => {
          if (typeof value !== 'string' && typeof value !== 'number') return;
          html = html.replace(
            new RegExp(`{{\\s*${key}\\s*}}`, 'g'),
            String(value),
          );
        });
        callback(null, html);
      } catch (error) {
        callback(error);
      }
    });

  /** Swagger API docs **/
  const config = new DocumentBuilder()
    .setTitle('📱 AI Morning Call')
    .setDescription(
      '`API` for **AI Morning Call**\n\n' +
        'Contact: wonbin9413@postech.ac.kr | kkdh1206@postech.ac.kr\n\n' +
        'Powered by PoApper, Inc.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  firebase.initializeApp({
    credential: firebase.credential.cert(firebaseParams),
  });

  await app.listen(3000);
}
bootstrap();
