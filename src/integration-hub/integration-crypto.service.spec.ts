import { IntegrationCryptoService } from './integration-crypto.service';

describe('IntegrationCryptoService', () => {
  const previousKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  const previousJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY =
      'test-key-with-at-least-thirty-two-characters';
  });

  afterAll(() => {
    if (previousKey === undefined)
      delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    else process.env.INTEGRATIONS_ENCRYPTION_KEY = previousKey;
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
  });

  it('chiffre puis déchiffre un secret sans le stocker en clair', () => {
    const service = new IntegrationCryptoService();
    const secret = 'fathom-secret-value';
    const encrypted = service.encrypt(secret);

    expect(encrypted).not.toContain(secret);
    expect(service.decrypt(encrypted)).toBe(secret);
  });

  it('produit deux charges différentes pour le même secret', () => {
    const service = new IntegrationCryptoService();
    expect(service.encrypt('same-value')).not.toBe(
      service.encrypt('same-value'),
    );
  });

  it('peut utiliser le secret JWT pendant la migration', () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    process.env.JWT_SECRET = 'jwt-secret-with-at-least-thirty-two-characters';
    const service = new IntegrationCryptoService();
    const encrypted = service.encrypt('zoom-token');
    expect(service.decrypt(encrypted)).toBe('zoom-token');
  });
});
