import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from 'src/auth/auth.guard';
import { AssistantController } from './assistant.controller';

describe('AssistantController', () => {
  it('protects every assistant route with the Firebase auth guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AssistantController);
    expect(guards).toContain(AuthGuard);
  });
});
