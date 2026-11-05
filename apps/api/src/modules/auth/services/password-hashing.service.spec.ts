import { Test, TestingModule } from '@nestjs/testing';
import { PasswordHashingService } from './password-hashing.service';

describe('PasswordHashingService', () => {
  let service: PasswordHashingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordHashingService],
    }).compile();

    service = module.get<PasswordHashingService>(PasswordHashingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hash', () => {
    it('should produce a non-plaintext hash starting with $argon2id$', async () => {
      const password = 'SuperSecretP@ssw0rd123!';
      const hash = await service.hash(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('should generate different salted hashes for identical passwords', async () => {
      const password = 'IdenticalPassword123!';
      const hash1 = await service.hash(password);
      const hash2 = await service.hash(password);

      expect(hash1).not.toBe(hash2);
      expect(hash1.startsWith('$argon2id$')).toBe(true);
      expect(hash2.startsWith('$argon2id$')).toBe(true);
    });

    it('should throw an error if password is empty or not a string', async () => {
      await expect(service.hash('')).rejects.toThrow('Password must be a non-empty string');
      await expect(service.hash(null as unknown as string)).rejects.toThrow('Password must be a non-empty string');
      await expect(service.hash(undefined as unknown as string)).rejects.toThrow('Password must be a non-empty string');
    });
  });

  describe('verify', () => {
    it('should return true for the correct password', async () => {
      const password = 'CorrectPassword999!';
      const hash = await service.hash(password);

      const isMatch = await service.verify(hash, password);
      expect(isMatch).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const password = 'CorrectPassword999!';
      const wrongPassword = 'WrongPassword999!';
      const hash = await service.hash(password);

      const isMatch = await service.verify(hash, wrongPassword);
      expect(isMatch).toBe(false);
    });

    it('should return false safely when given malformed or corrupted hashes without throwing', async () => {
      const candidate = 'AnyPassword123!';

      expect(await service.verify('not_a_valid_argon2_hash', candidate)).toBe(false);
      expect(await service.verify('$argon2id$corrupted_payload', candidate)).toBe(false);
      expect(await service.verify('', candidate)).toBe(false);
      expect(await service.verify(null as unknown as string, candidate)).toBe(false);
    });

    it('should return false when candidate password is empty or non-string', async () => {
      const hash = await service.hash('ValidPassword123!');

      expect(await service.verify(hash, '')).toBe(false);
      expect(await service.verify(hash, null as unknown as string)).toBe(false);
      expect(await service.verify(hash, undefined as unknown as string)).toBe(false);
    });
  });
});

